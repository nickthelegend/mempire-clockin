import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, TransactionInstruction, type Connection } from '@solana/web3.js';
import {
  acceptMemo, challengeMemo, dataMemo, openChallenge, parseDuelMemos, resultMemo, toB64url,
  type DuelMemo, type DuelPayload, type DuelWinner,
} from '../game/duel';

/**
 * Ghost Duels on chain. Every duel transaction carries the fixed, read-only
 * **duel reference account** as a non-signer key, so the whole duel board is
 * one `getSignaturesForAddress(DUEL_REF)` away — no indexer, no server.
 *
 * The reference is a PDA (no private key exists for it). Memo v3 refuses
 * non-signer accounts and Memo v1 crashes on any account, so the key rides as
 * an extra read-only account on a 0-lamport transfer from the player to
 * themself (the System program ignores extra accounts; wallets show it as
 * "0 SOL to yourself"). Verified on a local validator.
 *
 * The bulky payload goes in a Memo v1 instruction: v1 only checks UTF-8 and
 * does not log the text, so a 700-character payload costs ~1k compute units
 * instead of ~280k through Memo v3 (which logs it). The whole transaction is
 * signed by the player either way.
 */
export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const MEMO_V1 = new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');

export const refPda = (name: string) =>
  PublicKey.findProgramAddressSync([Buffer.from('mempire'), Buffer.from(name), Buffer.from('v1')], MEMO_PROGRAM)[0];
export const DUEL_REF = refPda('duels');

export function memoIx(signer: PublicKey, text: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, 'utf8'),
  });
}

/** Puts `ref` in the transaction's account keys, read-only and unsigned. */
export function refIx(payer: PublicKey, ref: PublicKey): TransactionInstruction {
  const ix = SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 });
  ix.keys.push({ pubkey: ref, isSigner: false, isWritable: false });
  return ix;
}

/** Unlogged, cheap memo (SPL Memo v1, no accounts) for payload text. */
export const dataIx = (text: string) => new TransactionInstruction({ programId: MEMO_V1, keys: [], data: Buffer.from(text, 'utf8') });

export function challengeIxs(owner: PublicKey, bytes: Uint8Array, seed: number): TransactionInstruction[] {
  return [memoIx(owner, challengeMemo(bytes, seed)), dataIx(dataMemo(toB64url(bytes))), refIx(owner, DUEL_REF)];
}

export function resultIxs(owner: PublicKey, challengeSig: string, winner: DuelWinner, stateHash: number, mine: Uint8Array): TransactionInstruction[] {
  return [memoIx(owner, resultMemo(challengeSig, winner, stateHash)), dataIx(dataMemo(toB64url(mine))), refIx(owner, DUEL_REF)];
}

export const acceptIxs = (owner: PublicKey, challengeSig: string) => [memoIx(owner, acceptMemo(challengeSig)), refIx(owner, DUEL_REF)];

// ── reading ─────────────────────────────────────────────────────────────────

export interface DuelTx { sig: string; slot: number; time: number; signer: string; memo: DuelMemo }

type RawTx = Awaited<ReturnType<Connection['getTransaction']>>;

/** The memo texts (v3 and v1) a transaction carries, decoded from its instructions (not the RPC memo field). */
export function memoTexts(tx: NonNullable<RawTx>): string[] {
  const msg = tx.transaction.message;
  const keys = msg.staticAccountKeys;
  return msg.compiledInstructions
    .filter((ix) => keys[ix.programIdIndex]?.equals(MEMO_PROGRAM) || keys[ix.programIdIndex]?.equals(MEMO_V1))
    .map((ix) => Buffer.from(ix.data).toString('utf8'));
}

function toDuelTx(sig: string, tx: RawTx): DuelTx | null {
  if (!tx || tx.meta?.err) return null;
  const memo = parseDuelMemos(memoTexts(tx).join('; '));
  if (!memo) return null;
  const signer = tx.transaction.message.staticAccountKeys[0].toBase58();
  return { sig, slot: tx.slot, time: tx.blockTime ?? 0, signer, memo };
}

export async function fetchDuelTx(conn: Connection, sig: string): Promise<DuelTx | null> {
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  return toDuelTx(sig, tx);
}

/** The newest duel transactions on the board (one page). */
export async function readDuelBoard(conn: Connection, limit = 40, before?: string): Promise<{ txs: DuelTx[]; last?: string }> {
  const sigs = await conn.getSignaturesForAddress(DUEL_REF, { limit, before });
  const ok = sigs.filter((s) => !s.err);
  const txs = ok.length
    ? await conn.getTransactions(ok.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
    : [];
  return {
    txs: ok.map((s, i) => toDuelTx(s.signature, txs[i])).filter((x): x is DuelTx => !!x),
    last: sigs[sigs.length - 1]?.signature,
  };
}

export interface Challenge { sig: string; challenger: string; time: number; payload: DuelPayload | null; error?: string }

/** A challenge by signature, with its payload checked against the commitment. */
export async function loadChallenge(conn: Connection, sig: string, linkPayload?: string): Promise<Challenge> {
  const t = await fetchDuelTx(conn, sig);
  if (!t || t.memo.kind !== 'challenge') throw new Error('No duel challenge with that signature on this cluster');
  const b64 = t.memo.data ?? linkPayload;
  if (!b64) return { sig, challenger: t.signer, time: t.time, payload: null, error: 'payload missing' };
  try {
    return { sig, challenger: t.signer, time: t.time, payload: openChallenge(t.memo, b64) };
  } catch (e) {
    return { sig, challenger: t.signer, time: t.time, payload: null, error: (e as Error).message };
  }
}
