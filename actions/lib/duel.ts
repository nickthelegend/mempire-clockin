import { createHash } from 'node:crypto';
import { PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, type Connection } from '@solana/web3.js';
import { MEMO_PROGRAM } from './tx';

/**
 * Ghost Duel Blink helpers. Self-contained (the Vercel bundle is only this
 * folder); the derivations and formats match mobile/src/chain/duels.ts and
 * mobile/src/game/duel.ts, and app/tests/blink-actions.test.ts checks that.
 */
export const MEMO_V1 = new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');
export const DUEL_REF = PublicKey.findProgramAddressSync([Buffer.from('mempire'), Buffer.from('duels'), Buffer.from('v1')], MEMO_PROGRAM)[0];

export interface DuelSummary { seed: number; rush: boolean; deck: { ticker: string; level: number }[]; deploys: number }

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Header of a duel payload (enough to describe it; the app does the full decode). */
export function summarize(b64: string): DuelSummary {
  const b = fromB64url(b64);
  let o = 0;
  const u8 = () => { if (o >= b.length) throw new Error('truncated payload'); return b[o++]; };
  if (u8() !== 1) throw new Error('unknown duel version');
  const rush = (u8() & 1) === 1;
  const seed = b.readUInt32LE(o); o += 4;
  const deck = [];
  for (let i = 0; i < 8; i++) {
    const len = u8();
    const ticker = b.toString('ascii', o, o + len); o += len;
    deck.push({ ticker, level: u8() });
  }
  let n = 0; let mul = 1;
  for (;;) { const x = u8(); n += (x & 0x7f) * mul; if (!(x & 0x80)) break; mul *= 128; }
  return { seed, rush, deck, deploys: n };
}

export interface ChallengeInfo { sig: string; challenger: string; payload: string; summary: DuelSummary; time: number | null }

/** Read a challenge transaction and check its payload against the sha256 commitment. */
export async function readChallenge(conn: Connection, sig: string): Promise<ChallengeInfo> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) throw new Error('c must be a transaction signature');
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  if (!tx || tx.meta?.err) throw new Error('challenge not found on devnet');
  const keys = tx.transaction.message.staticAccountKeys;
  const texts = tx.transaction.message.compiledInstructions
    .filter((ix) => keys[ix.programIdIndex].equals(MEMO_PROGRAM) || keys[ix.programIdIndex].equals(MEMO_V1))
    .map((ix) => Buffer.from(ix.data).toString('utf8'));
  const c = texts.map((t) => /^mempire:duel:v1:([0-9a-f]{64}):(\d{1,10})$/.exec(t)).find(Boolean);
  const d = texts.map((t) => /^mempire:duel-data:v1:([A-Za-z0-9_-]+)$/.exec(t)).find(Boolean);
  if (!c || !d) throw new Error('that transaction is not a Mempire duel challenge');
  if (createHash('sha256').update(fromB64url(d[1])).digest('hex') !== c[1]) throw new Error('payload does not match its commitment');
  const summary = summarize(d[1]);
  if (summary.seed !== Number(c[2])) throw new Error('seed mismatch');
  return { sig, challenger: keys[0].toBase58(), payload: d[1], summary, time: tx.blockTime ?? null };
}

export const acceptMemoText = (sig: string) => `mempire:duel-accept:v1:${sig}`;
export const duelDeepLink = (sig: string, payload: string) => `mempire://duel?c=${sig}&d=${payload}`;

/** Accept: a signed memo naming the challenge, carrying the duel reference (read-only). */
export function acceptTx(account: PublicKey, sig: string, blockhash: string): string {
  const memo = new TransactionInstruction({
    programId: MEMO_PROGRAM, keys: [{ pubkey: account, isSigner: true, isWritable: false }], data: Buffer.from(acceptMemoText(sig), 'utf8'),
  });
  const ref = SystemProgram.transfer({ fromPubkey: account, toPubkey: account, lamports: 0 });
  ref.keys.push({ pubkey: DUEL_REF, isSigner: false, isWritable: false });
  const msg = new TransactionMessage({ payerKey: account, recentBlockhash: blockhash, instructions: [memo, ref] }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString('base64');
}
