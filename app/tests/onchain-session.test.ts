/**
 * On-chain session delegate + Clock-In (mempire_pass) builders, and the
 * on-chain chest-commit check. Pure parts; the chain round trip is in
 * mobile/scripts/verify-onchain.sh (local validator).
 *
 *   cd app && npx vitest run tests/onchain-session.test.ts
 */
import { describe, expect, it } from 'vitest';
import { Keypair, SystemProgram } from '@solana/web3.js';
import {
  WAR_CODES, clockInIx, clockStatePda, createSessionIx, decodeClockState, revokeSessionIx, sessionRecordPda,
} from '../../mobile/src/chain/clockin';
import { PASS_PROGRAM } from '../../mobile/src/chain/pass';
import { checkCommit, chestCommitText, parseChestCommit } from '../../mobile/src/chain/fair';
import idl from '../../chain/pass/idl/mempire_pass.json';

const disc = (name: string) => (idl as { instructions: { name: string; discriminator: number[] }[] }).instructions.find((i) => i.name === name)!.discriminator;
const owner = Keypair.generate().publicKey;
const key = Keypair.generate().publicKey;

describe('mempire_pass session / clock_in instruction builders', () => {
  it('match the IDL discriminators and account order', () => {
    const c = createSessionIx(owner, key, 1_800_000_000);
    expect([...c.data.subarray(0, 8)]).toEqual(disc('create_session'));
    expect(c.data.subarray(8, 40).equals(key.toBuffer())).toBe(true);
    expect(c.data.readInt32LE(40) + c.data.readInt32LE(44) * 2 ** 32).toBe(1_800_000_000);
    expect(c.keys.map((k) => k.pubkey.toBase58())).toEqual([
      owner.toBase58(), sessionRecordPda(owner, key).toBase58(), clockStatePda(owner).toBase58(), SystemProgram.programId.toBase58(),
    ]);
    expect(c.keys[0].isSigner && c.keys[0].isWritable).toBe(true);

    const r = revokeSessionIx(key, owner, key);
    expect([...r.data]).toEqual(disc('revoke_session'));
    expect(r.keys[0].isSigner && !r.keys[0].isWritable).toBe(true);
    expect(r.keys[1].isWritable && !r.keys[1].isSigner).toBe(true);
  });

  it('clock_in: session path passes the SessionRecord, owner path passes None (the program id)', () => {
    const viaSession = clockInIx(key, owner, true, 20261011, 5, WAR_CODES.POPCAT);
    expect([...viaSession.data.subarray(0, 8)]).toEqual(disc('clock_in'));
    expect(viaSession.data.readUInt32LE(8)).toBe(20261011);
    expect(viaSession.data.readUInt32LE(12)).toBe(5);
    expect(viaSession.data[16]).toBe(2);
    expect(viaSession.keys[2].pubkey.equals(sessionRecordPda(owner, key))).toBe(true);
    const direct = clockInIx(owner, owner, false, 20261011, 1, 0);
    expect(direct.keys[2].pubkey.equals(PASS_PROGRAM)).toBe(true);
    expect(direct.keys[3].pubkey.equals(clockStatePda(owner))).toBe(true);
  });

  it('decodes ClockInState', () => {
    const b = Buffer.alloc(66);
    b.writeUInt32LE(20261011, 40); b.writeUInt32LE(3, 44); b.writeUInt32LE(9, 48); b.writeUInt32LE(12, 52);
    b.writeInt32LE(1_791_700_000, 56); b[64] = 1;
    expect(decodeClockState(b)).toEqual({ lastDay: 20261011, streak: 3, best: 9, total: 12, lastAt: 1_791_700_000, warSide: 1 });
  });
});

describe('on-chain chest commit', () => {
  const o = owner.toBase58();
  const want = { chestId: 'chest_7', targetSlot: 1000, owner: o };
  const text = chestCommitText('chest_7', 1000, o);
  const none = () => false;

  it('round-trips the memo text', () => {
    expect(text).toBe(`mempire:chest-commit:v1:chest_7:1000:owner=${o}`);
    expect(parseChestCommit(text)).toEqual(want);
    expect(parseChestCommit(`${text}:extra`)).toBeNull();
    expect(parseChestCommit(text.replace("chest-commit:v1", "chest-commit:v2"))).toBeNull();
  });
  it('accepts an owner-signed commit that landed before the target slot', () => {
    expect(checkCommit({ texts: [text], txSlot: 970, signers: [o] }, want, none)).toEqual({ ok: true });
  });
  it('accepts a commit signed by a session key of the owner', () => {
    const s = key.toBase58();
    expect(checkCommit({ texts: [text], txSlot: 999, signers: [s] }, want, (x) => x === s).ok).toBe(true);
  });
  it('rejects a commit that landed at or after the target slot (its blockhash could be known)', () => {
    expect(checkCommit({ texts: [text], txSlot: 1000, signers: [o] }, want, none).ok).toBe(false);
    expect(checkCommit({ texts: [text], txSlot: 1200, signers: [o] }, want, none).reason).toMatch(/not before the target/);
  });
  it('rejects a stranger signer, another chest, another target slot, another owner', () => {
    expect(checkCommit({ texts: [text], txSlot: 900, signers: [Keypair.generate().publicKey.toBase58()] }, want, none).reason).toMatch(/not signed/);
    expect(checkCommit({ texts: [chestCommitText('chest_8', 1000, o)], txSlot: 900, signers: [o] }, want, none).ok).toBe(false);
    expect(checkCommit({ texts: [chestCommitText('chest_7', 999, o)], txSlot: 900, signers: [o] }, want, none).reason).toMatch(/slot 999/);
    const other = Keypair.generate().publicKey.toBase58();
    expect(checkCommit({ texts: [chestCommitText('chest_7', 1000, other)], txSlot: 900, signers: [o] }, want, none).reason).toMatch(/another owner/);
  });
});
