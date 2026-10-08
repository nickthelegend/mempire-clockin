import { PublicKey, type TransactionInstruction, type Connection } from '@solana/web3.js';
import {
  acceptMemo, challengeMemo, dataMemo, openChallenge, parseDuelMemos, resultMemo, toB64url,
  type DuelMemo, type DuelPayload, type DuelWinner,
} from '../game/duel';

import { DUEL_REF, MEMO_PROGRAM, MEMO_V1, dataIx, memoIx, memoTexts, refIx } from './refs';

/**
 * Ghost Duels on chain. Every duel transaction carries the duel reference
 * account (chain/refs.ts) as a read-only key, so the whole duel board is one
 * `getSignaturesForAddress(DUEL_REF)` away — no indexer, no server. The
 * payload rides in a cheap Memo v1 instruction.
 */
export { DUEL_REF, MEMO_PROGRAM, MEMO_V1, memoIx, memoTexts, refIx, dataIx };

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

export interface Challenge { sig: string; challenger: string; time: number; payload: DuelPayload | null; payloadB64: string | null; error?: string }

/** A challenge by signature, with its payload checked against the commitment. */
export async function loadChallenge(conn: Connection, sig: string, linkPayload?: string): Promise<Challenge> {
  const t = await fetchDuelTx(conn, sig);
  if (!t || t.memo.kind !== 'challenge') throw new Error('No duel challenge with that signature on this cluster');
  const b64 = t.memo.data ?? linkPayload;
  if (!b64) return { sig, challenger: t.signer, time: t.time, payload: null, payloadB64: null, error: 'payload missing' };
  try {
    return { sig, challenger: t.signer, time: t.time, payload: openChallenge(t.memo, b64), payloadB64: b64 };
  } catch (e) {
    return { sig, challenger: t.signer, time: t.time, payload: null, payloadB64: null, error: (e as Error).message };
  }
}
