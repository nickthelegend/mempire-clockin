import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, TransactionInstruction, type Connection } from '@solana/web3.js';
import { PASS_PROGRAM } from './pass';

/**
 * The on-chain session delegate and Clock-In record (`mempire_pass`:
 * create_session / revoke_session / clock_in).
 *
 *  - SessionRecord PDA [session, owner, sessionKey]: created by ONE owner
 *    signature, at most 8 days, closed by revoke (owner or session key).
 *  - ClockInState PDA [clockin, owner]: last day, streak, best, total and war
 *    side, written only by clock_in signed by the owner or a live session key
 *    of that owner. The program computes the day (UTC) and the streak itself.
 *
 * Memos are still written alongside (old readers and the Season War index
 * read them); when the program is on the cluster, the PDA is what counts.
 */
const SESSION_SEED = Buffer.from('session');
const CLOCKIN_SEED = Buffer.from('clockin');

// Anchor discriminators, from chain/pass/idl/mempire_pass.json.
const DISC = {
  createSession: [242, 193, 143, 179, 150, 25, 122, 227],
  revokeSession: [86, 92, 198, 120, 144, 2, 7, 194],
  clockIn: [206, 150, 221, 145, 122, 124, 77, 89],
};

export const sessionRecordPda = (owner: PublicKey, key: PublicKey) =>
  PublicKey.findProgramAddressSync([SESSION_SEED, owner.toBuffer(), key.toBuffer()], PASS_PROGRAM)[0];
export const clockStatePda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([CLOCKIN_SEED, owner.toBuffer()], PASS_PROGRAM)[0];

const i64le = (n: number) => { const b = Buffer.alloc(8); b.writeInt32LE(n % 2 ** 32 | 0, 0); b.writeInt32LE(Math.floor(n / 2 ** 32), 4); return b; };
const u32le = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; };
const k = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });

export function createSessionIx(owner: PublicKey, sessionKey: PublicKey, expiresAt: number): TransactionInstruction {
  return new TransactionInstruction({
    programId: PASS_PROGRAM,
    keys: [k(owner, true, true), k(sessionRecordPda(owner, sessionKey), true), k(clockStatePda(owner), true), k(SystemProgram.programId)],
    data: Buffer.concat([Buffer.from(DISC.createSession), sessionKey.toBuffer(), i64le(expiresAt)]),
  });
}

export function revokeSessionIx(signer: PublicKey, owner: PublicKey, sessionKey: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PASS_PROGRAM,
    keys: [k(signer, false, true), k(owner, true), k(sessionRecordPda(owner, sessionKey), true)],
    data: Buffer.from(DISC.revokeSession),
  });
}

export const WAR_CODES: Record<string, number> = { BONK: 1, POPCAT: 2 };

/** A Clock-In signed by `authority`: the owner (session = null) or a session key. */
export function clockInIx(authority: PublicKey, owner: PublicKey, viaSession: boolean, day: number, streak: number, warSide: number): TransactionInstruction {
  return new TransactionInstruction({
    programId: PASS_PROGRAM,
    keys: [
      k(authority, true, true),
      k(owner),
      // An absent optional account is passed as the program id (Anchor's None).
      k(viaSession ? sessionRecordPda(owner, authority) : PASS_PROGRAM),
      k(clockStatePda(owner), true),
      k(SystemProgram.programId),
    ],
    data: Buffer.concat([Buffer.from(DISC.clockIn), u32le(day), u32le(streak), Buffer.from([warSide & 0xff])]),
  });
}

export interface ClockState { lastDay: number; streak: number; best: number; total: number; lastAt: number; warSide: number }

/** ClockInState layout: 8 disc · owner 32 · last_day u32 · streak u32 · best u32 · total u32 · last_at i64 · war_side u8 · bump u8 */
export function decodeClockState(data: Uint8Array): ClockState {
  const b = Buffer.from(data);
  return {
    lastDay: b.readUInt32LE(40), streak: b.readUInt32LE(44), best: b.readUInt32LE(48), total: b.readUInt32LE(52),
    lastAt: b.readInt32LE(56) + b.readInt32LE(60) * 2 ** 32, warSide: b[64],
  };
}

export async function readClockState(conn: Connection, owner: string): Promise<ClockState | null> {
  const info = await conn.getAccountInfo(clockStatePda(new PublicKey(owner)));
  if (!info || info.data.length < 66) return null;
  const st = decodeClockState(info.data);
  return st.lastDay ? st : null;
}

/** SessionRecord layout: 8 disc · owner 32 · session 32 · expires_at i64 · created_at i64 · bump */
export async function readSessionRecord(conn: Connection, owner: string, key: string): Promise<{ expiresAt: number } | null> {
  const info = await conn.getAccountInfo(sessionRecordPda(new PublicKey(owner), new PublicKey(key)));
  if (!info || info.data.length < 80) return null;
  const b = Buffer.from(info.data);
  return { expiresAt: b.readInt32LE(72) + b.readInt32LE(76) * 2 ** 32 };
}

let live: { at: number; ok: boolean } | null = null;
/** Is `mempire_pass` (with clock_in) on this cluster? Cached for 5 minutes. */
export async function programLive(conn: Connection): Promise<boolean> {
  if (live && Date.now() - live.at < 300_000) return live.ok;
  try {
    const info = await conn.getAccountInfo(PASS_PROGRAM);
    live = { at: Date.now(), ok: !!info?.executable };
  } catch {
    return live?.ok ?? false;
  }
  return live.ok;
}
