import {
  ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction,
  type Connection, type TransactionInstruction,
} from '@solana/web3.js';

/**
 * Transaction landing, shared by every Mempire transaction (Clock-Ins, session
 * links, chest commits, pass / skin buys, duels, SKR claims).
 *
 *  1. Priority fee: the median of getRecentPrioritizationFees for the
 *     transaction's writable accounts, clamped to [MIN_PRICE, MAX_PRICE]
 *     micro-lamports per compute unit.
 *  2. Compute limit: simulate with the maximum limit, then set the limit to
 *     what the simulation used + 15 % (a lower limit makes the priority fee
 *     cheaper and the transaction easier to schedule).
 *  3. Confirm against the blockhash's lastValidBlockHeight, so "expired" is
 *     a definite answer rather than a timeout.
 *  4. Expiry: if the blockhash expired and the signature never landed, resend
 *     with a fresh blockhash (at most MAX_RESENDS) — only for signers that can
 *     re-sign silently (the session key, scripts). A wallet send has a receipt
 *     journal that refuses a second signature for one intent (duplicate-spend
 *     guard), so it reports a clear "expired, nothing was charged" instead.
 *  5. Errors are mapped to sentences a player can act on (friendlyTxError).
 */
export const MIN_PRICE = 1_000; // micro-lamports / CU
export const MAX_PRICE = 200_000;
export const MAX_LIMIT = 1_400_000;
export const MIN_LIMIT = 20_000;
export const MAX_RESENDS = 2;
const COMPUTE_BUDGET = ComputeBudgetProgram.programId;

export type LandingConn = Pick<Connection,
  'getLatestBlockhashAndContext' | 'simulateTransaction' | 'sendRawTransaction' | 'confirmTransaction'
  | 'getSignatureStatuses' | 'getRecentPrioritizationFees'>;

/** Median of recent prioritization fees, clamped. */
export async function priorityPrice(conn: Pick<Connection, 'getRecentPrioritizationFees'>, accounts: PublicKey[]): Promise<number> {
  try {
    const fees = (await conn.getRecentPrioritizationFees({ lockedWritableAccounts: accounts.slice(0, 128) }))
      .map((f) => f.prioritizationFee).sort((a, b) => a - b);
    if (!fees.length) return MIN_PRICE;
    const mid = Math.floor(fees.length / 2);
    const median = fees.length % 2 ? fees[mid] : Math.round((fees[mid - 1] + fees[mid]) / 2);
    return Math.min(MAX_PRICE, Math.max(MIN_PRICE, median));
  } catch {
    return MIN_PRICE;
  }
}

export const limitFor = (unitsConsumed: number | null | undefined) =>
  Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.ceil((unitsConsumed ?? 200_000) * 1.15) + 1_000));

/** The instructions with Mempire's compute-budget pair in front (any existing ones dropped). */
export function withBudget(ixs: TransactionInstruction[], limit: number, price: number): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: limit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
    ...ixs.filter((ix) => !ix.programId.equals(COMPUTE_BUDGET)),
  ];
}

export interface Prepared {
  tx: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
  minContextSlot: number;
  limit: number;
  price: number;
}

const compile = (payer: PublicKey, blockhash: string, ixs: TransactionInstruction[]) =>
  new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());

/**
 * Price, simulate, size. Throws a friendly error if the simulation fails (the
 * transaction would fail on chain too, so there is no point asking to sign).
 */
export async function prepareTx(
  conn: LandingConn, payer: PublicKey, ixs: TransactionInstruction[], sized?: { limit: number; price: number },
): Promise<Prepared> {
  const { context: { slot: minContextSlot }, value: bh } = await conn.getLatestBlockhashAndContext('confirmed');
  let limit = sized?.limit;
  const price = sized?.price ?? await priorityPrice(conn, [...new Set(ixs.flatMap((ix) => ix.keys.filter((k) => k.isWritable).map((k) => k.pubkey.toBase58())))].map((k) => new PublicKey(k)));
  if (limit === undefined) {
    const sim = await conn.simulateTransaction(fitted(payer, bh.blockhash, ixs, MAX_LIMIT, price), {
      sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed',
    });
    if (sim.value.err) throw friendlyTxError(new SimulationError(sim.value.err, sim.value.logs ?? []));
    limit = limitFor(sim.value.unitsConsumed);
  }
  return { tx: fitted(payer, bh.blockhash, ixs, limit, price), blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight, minContextSlot, limit, price };
}

export const TX_MAX_BYTES = 1232;
/**
 * The transaction with the budget pair, unless that pushes it past the
 * 1232-byte packet limit (a long ghost-duel payload): then without it, at the
 * default limit and no priority fee, rather than not at all.
 */
function fitted(payer: PublicKey, blockhash: string, ixs: TransactionInstruction[], limit: number, price: number): VersionedTransaction {
  try {
    const tx = compile(payer, blockhash, withBudget(ixs, limit, price));
    if (tx.serialize().length <= TX_MAX_BYTES) return tx;
  } catch { /* too large to encode */ }
  return compile(payer, blockhash, ixs.filter((ix) => !ix.programId.equals(COMPUTE_BUDGET)));
}

export class SimulationError extends Error {
  constructor(public err: unknown, public logs: string[]) {
    super(`Simulation failed: ${JSON.stringify(err)}\n${logs.slice(-6).join('\n')}`);
  }
}
export class ExpiredError extends Error {
  constructor(public signature: string) { super(`Transaction ${signature} expired before it landed (blockhash too old). Nothing was charged.`); }
}

const isExpiry = (e: unknown) => /block height exceeded|TransactionExpired|has expired|Blockhash not found/i.test(String((e as Error)?.message ?? e) + String((e as Error)?.name ?? ''));

/**
 * Confirm against the blockhash's last valid block height. Resolves on
 * success, throws ExpiredError if it expired without landing, or the
 * transaction's own error.
 */
export async function confirmLanding(conn: LandingConn, signature: string, blockhash: string, lastValidBlockHeight: number): Promise<void> {
  try {
    const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    if (res.value.err) throw friendlyTxError(new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`));
    return;
  } catch (e) {
    // Expired or timed out: ask the chain once before calling it either way.
    const st = await conn.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
    const s = st?.value[0];
    if (s && !s.err && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return;
    if (s?.err) throw friendlyTxError(new Error(`Transaction failed: ${JSON.stringify(s.err)}`));
    if (isExpiry(e)) throw new ExpiredError(signature);
    throw friendlyTxError(e);
  }
}

/**
 * Prepare, sign (silently), send, confirm; on expiry resend with a fresh
 * blockhash up to MAX_RESENDS times. For the session key and scripts.
 */
export async function sendAndLand(
  conn: LandingConn, payer: PublicKey, ixs: TransactionInstruction[],
  sign: (tx: VersionedTransaction) => VersionedTransaction | Promise<VersionedTransaction>,
  opts: { maxResends?: number; onAttempt?: (n: number, p: Prepared) => void } = {},
): Promise<string> {
  let sized: { limit: number; price: number } | undefined;
  const max = opts.maxResends ?? MAX_RESENDS;
  for (let attempt = 0; ; attempt++) {
    const p = await prepareTx(conn, payer, ixs, sized);
    sized = { limit: p.limit, price: p.price };
    opts.onAttempt?.(attempt, p);
    const signed = await sign(p.tx);
    let sig: string;
    try {
      sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true, minContextSlot: p.minContextSlot, maxRetries: 3 });
    } catch (e) {
      throw friendlyTxError(e);
    }
    try {
      await confirmLanding(conn, sig, p.blockhash, p.lastValidBlockHeight);
      return sig;
    } catch (e) {
      if (e instanceof ExpiredError && attempt < max) continue;
      throw e instanceof ExpiredError ? new Error('The network was busy and the transaction expired, even after a resend. Nothing was charged; try again.') : e;
    }
  }
}

/** Errors a player can act on. Keeps the original message as `cause`. */
export function friendlyTxError(e: unknown): Error {
  if (e instanceof ExpiredError) return e;
  const raw = e instanceof SimulationError ? `${e.message}` : e instanceof Error ? e.message : String(e);
  const logs = e instanceof SimulationError ? e.logs.join('\n') : '';
  const all = `${raw}\n${logs}`;
  const out = (m: string) => Object.assign(new Error(m), { cause: e });
  const anchor = /Error Message: ([^.\n]+)/.exec(all);
  if (anchor) return out(`${anchor[1]}.`);
  if (/Tokenkeg|TokenzQd/.test(logs) && /custom program error: 0x1\b|insufficient funds/i.test(all)) return out('Not enough SKR (or token balance) for this.');
  if (/insufficient (funds|lamports)|no record of a prior credit|InsufficientFundsForFee/i.test(all)) return out('Not enough devnet SOL for this transaction (network fee or rent).');
  if (/already in use|custom program error: 0x0\b/i.test(all)) return out('Already done: that on-chain record exists (bought or claimed before).');
  if (/Blockhash not found|block height exceeded|expired/i.test(all)) return out('The network was busy and the transaction expired. Nothing was charged; try again.');
  if (/429|Too Many Requests|rate.?limit/i.test(all)) return out('The devnet RPC is rate-limiting right now. Try again in a moment.');
  if (/declin|reject|cancel/i.test(all)) return out('You declined the request in your wallet.');
  if (/Network request failed|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(all)) return out('Could not reach the Solana network. Check your connection and try again.');
  return e instanceof Error ? e : new Error(raw);
}
