/**
 * Transaction landing (mobile/src/chain/send.ts) against a mocked connection.
 *
 *   cd app && npx vitest run tests/tx-landing.test.ts
 */
import { describe, expect, it } from 'vitest';
import { ComputeBudgetProgram, Keypair, SystemProgram, TransactionExpiredBlockheightExceededError, type VersionedTransaction } from '@solana/web3.js';
import {
  ExpiredError, MAX_LIMIT, MAX_PRICE, MIN_LIMIT, MIN_PRICE, confirmLanding, friendlyTxError, limitFor, prepareTx,
  priorityPrice, sendAndLand, SimulationError, withBudget, type LandingConn,
} from '../../mobile/src/chain/send';

const payer = Keypair.generate();
const ix = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 });
const sign = (tx: VersionedTransaction) => { tx.sign([payer]); return tx; };

function mockConn(opts: {
  fees?: number[]; units?: number; simErr?: unknown; simLogs?: string[];
  confirm?: (n: number) => 'ok' | 'expire' | { err: unknown }; status?: (sig: string) => unknown;
} = {}) {
  let blockhashes = 0; let sends = 0; let confirms = 0;
  const sent: VersionedTransaction[] = [];
  const conn = {
    getRecentPrioritizationFees: async () => (opts.fees ?? []).map((f, i) => ({ slot: i, prioritizationFee: f })),
    getLatestBlockhashAndContext: async () => {
      blockhashes += 1;
      return { context: { slot: 100 + blockhashes }, value: { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1000 + blockhashes } };
    },
    simulateTransaction: async () => ({ context: { slot: 1 }, value: { err: opts.simErr ?? null, logs: opts.simLogs ?? [], unitsConsumed: opts.units ?? 10_000, accounts: null } }),
    sendRawTransaction: async (raw: Buffer | Uint8Array) => { sends += 1; sent.push(raw as unknown as VersionedTransaction); return `sig${sends}`; },
    confirmTransaction: async (s: { signature: string }) => {
      confirms += 1;
      const r = opts.confirm?.(confirms) ?? 'ok';
      if (r === 'expire') throw new TransactionExpiredBlockheightExceededError(s.signature);
      return { context: { slot: 1 }, value: { err: r === 'ok' ? null : r.err } };
    },
    getSignatureStatuses: async (sigs: string[]) => ({ context: { slot: 1 }, value: sigs.map((s) => opts.status?.(s) ?? null) }),
  } as unknown as LandingConn;
  return { conn, stats: () => ({ blockhashes, sends, confirms }) };
}

describe('priority fee', () => {
  it('uses the median, clamped', async () => {
    expect(await priorityPrice(mockConn({ fees: [0, 5_000, 9_000, 7_000, 3_000] }).conn, [])).toBe(5_000);
    expect(await priorityPrice(mockConn({ fees: [2_000, 4_000] }).conn, [])).toBe(3_000);
    expect(await priorityPrice(mockConn({ fees: [] }).conn, [])).toBe(MIN_PRICE);
    expect(await priorityPrice(mockConn({ fees: [0, 0, 0] }).conn, [])).toBe(MIN_PRICE);
    expect(await priorityPrice(mockConn({ fees: [9e9, 9e9] }).conn, [])).toBe(MAX_PRICE);
  });
});

describe('compute limit and budget instructions', () => {
  it('sizes the limit from the simulation (+15 %), clamped', () => {
    expect(limitFor(100_000)).toBe(116_000);
    expect(limitFor(10_000)).toBe(MIN_LIMIT);
    expect(limitFor(1)).toBe(MIN_LIMIT);
    expect(limitFor(5_000_000)).toBe(MAX_LIMIT);
  });
  it('prepends exactly one limit + one price instruction', () => {
    const out = withBudget([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 9 }), ix], 50_000, 4_000);
    expect(out).toHaveLength(3);
    expect(out[0].programId.equals(ComputeBudgetProgram.programId) && out[1].programId.equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(out[2]).toBe(ix);
  });
  it('prepareTx simulates and builds the sized transaction', async () => {
    const { conn, stats } = mockConn({ fees: [6_000], units: 30_000 });
    const p = await prepareTx(conn, payer.publicKey, [ix]);
    expect(p.limit).toBe(35_500);
    expect(p.price).toBe(6_000);
    expect(p.tx.message.compiledInstructions).toHaveLength(3);
    expect(stats().blockhashes).toBe(1);
  });
  it('a failing simulation never reaches the wallet, with a readable reason', async () => {
    const { conn, stats } = mockConn({ simErr: { InstructionError: [2, { Custom: 6013 }] }, simLogs: ['Program log: AnchorError occurred. Error Code: AlreadyClockedIn. Error Number: 6014. Error Message: Already clocked in for this day.'] });
    await expect(sendAndLand(conn, payer.publicKey, [ix], sign)).rejects.toThrow('Already clocked in for this day.');
    expect(stats().sends).toBe(0);
  });
});

describe('landing', () => {
  it('lands on the first try', async () => {
    const { conn, stats } = mockConn();
    expect(await sendAndLand(conn, payer.publicKey, [ix], sign)).toBe('sig1');
    expect(stats()).toEqual({ blockhashes: 1, sends: 1, confirms: 1 });
  });
  it('resends with a fresh blockhash after an expiry (and keeps the sized limit/price)', async () => {
    const { conn, stats } = mockConn({ confirm: (n) => (n === 1 ? 'expire' : 'ok') });
    const seen: { limit: number; price: number }[] = [];
    expect(await sendAndLand(conn, payer.publicKey, [ix], sign, { onAttempt: (_n, p) => seen.push({ limit: p.limit, price: p.price }) })).toBe('sig2');
    expect(stats()).toEqual({ blockhashes: 2, sends: 2, confirms: 2 });
    expect(seen[0]).toEqual(seen[1]);
  });
  it('gives up after 2 resends', async () => {
    const { conn, stats } = mockConn({ confirm: () => 'expire' });
    await expect(sendAndLand(conn, payer.publicKey, [ix], sign)).rejects.toThrow(/expired, even after a resend/);
    expect(stats().sends).toBe(3);
  });
  it('an expiry whose signature did land counts as landed (no resend)', async () => {
    const { conn, stats } = mockConn({ confirm: () => 'expire', status: () => ({ err: null, confirmationStatus: 'confirmed', slot: 5, confirmations: 1 }) });
    expect(await sendAndLand(conn, payer.publicKey, [ix], sign)).toBe('sig1');
    expect(stats().sends).toBe(1);
  });
  it('confirmLanding reports a definite expiry', async () => {
    const { conn } = mockConn({ confirm: () => 'expire' });
    await expect(confirmLanding(conn, 'x', 'bh', 5)).rejects.toBeInstanceOf(ExpiredError);
  });
  it('an on-chain failure is not resent', async () => {
    const { conn, stats } = mockConn({ confirm: () => ({ err: { InstructionError: [0, { Custom: 1 }] } }) });
    await expect(sendAndLand(conn, payer.publicKey, [ix], sign)).rejects.toThrow();
    expect(stats().sends).toBe(1);
  });
});

describe('friendly errors', () => {
  const f = (e: unknown) => friendlyTxError(e).message;
  it('maps the common failures', () => {
    expect(f(new Error('Attempt to debit an account but found no record of a prior credit.'))).toMatch(/Not enough devnet SOL/);
    expect(f(new SimulationError({ InstructionError: [1, { Custom: 1 }] }, ['Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]', 'Program log: Error: insufficient funds']))).toMatch(/Not enough SKR/);
    expect(f(new Error('Allocate: account Address { address: X } already in use'))).toMatch(/Already done/);
    expect(f(new Error('Blockhash not found'))).toMatch(/expired/);
    expect(f(new Error('429 Too Many Requests'))).toMatch(/rate-limiting/);
    expect(f(new Error('User declined the request'))).toMatch(/declined/);
    expect(f(new SimulationError({ InstructionError: [1, { Custom: 37 }] }, ['Program log: Transfer is disabled for this mint']))).toMatch(/soulbound/);
    expect(f(new SimulationError('AccountNotFound', []))).toMatch(/Not enough devnet SOL/);
    expect(f(new SimulationError('BlockhashNotFound', []))).toMatch(/expired/);
    expect(f(new Error('weird'))).toBe('weird');
  });
});

describe('packet limit', () => {
  it('drops the budget pair rather than overflow 1232 bytes', async () => {
    const { TransactionInstruction, PublicKey } = await import('@solana/web3.js');
    const big = new TransactionInstruction({ programId: new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo'), keys: [], data: Buffer.alloc(1_030, 97) });
    const { conn } = mockConn();
    const p = await prepareTx(conn, payer.publicKey, [big]);
    p.tx.sign([payer]);
    expect(p.tx.serialize().length).toBeLessThanOrEqual(1232);
    expect(p.tx.message.compiledInstructions).toHaveLength(1);
    const small = await prepareTx(conn, payer.publicKey, [ix]);
    expect(small.tx.message.compiledInstructions).toHaveLength(3);
  });
});
