import { Buffer } from 'buffer';
import type { VersionedTransactionResponse } from '@solana/web3.js';

const MEMO_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export interface ChainClockIn { day: number; streak: number; sig: string }

/** Read the actual Memo instruction, not the address history's untrusted memo summary. */
export function ownerClockIn(
  owner: string, sig: string, tx: VersionedTransactionResponse | null,
): ChainClockIn | null {
  if (!tx || !tx.meta || tx.meta.err) return null;
  const message = tx.transaction.message;
  const keys = message.staticAccountKeys;
  const ownerIndex = keys.findIndex((key) => key.toBase58() === owner);
  if (ownerIndex < 0 || ownerIndex >= message.header.numRequiredSignatures) return null;
  for (const ix of message.compiledInstructions) {
    if (keys[ix.programIdIndex]?.toBase58() !== MEMO_ID || !ix.accountKeyIndexes.includes(ownerIndex)) continue;
    const text = Buffer.from(ix.data).toString('utf8');
    // Session memos require their separate link/expiry/revocation validator.
    const match = /^mempire:clockin:v1:day=(\d{8}):streak=([1-9]\d*)(?::war=\d+:side=(?:BONK|POPCAT))?$/.exec(text);
    if (!match) continue;
    const day = Number(match[1]);
    const streak = Number(match[2]);
    const year = Math.floor(day / 10000), month = Math.floor(day / 100) % 100, date = day % 100;
    const utc = new Date(Date.UTC(year, month - 1, date));
    if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== date || !Number.isSafeInteger(streak)) continue;
    return { day, streak, sig };
  }
  return null;
}
