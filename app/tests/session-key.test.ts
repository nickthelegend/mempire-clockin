/**
 * "Approve once, play all week": session link / expiry / revoke rules
 * (mobile/src/chain/session.ts). The on-chain half is exercised against a
 * local validator by mobile/scripts/verify-solana-tech.ts.
 *
 *   cd app && npx vitest run tests/session-key.test.ts
 */
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  FEE_FLOAT_LAMPORTS, MAX_SESSION_SECS, TX_FEE_LAMPORTS, activeLink, linkIxs, linkMemoText, parseSessionMemo,
  revokeIxs, revokeMemoText, sessionClockInIx, sessionClockInText, validateLedger, type LedgerEvent,
} from '../../mobile/src/chain/session';

const owner = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey.toBase58();
const session = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey.toBase58();
const thief = Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey.toBase58();
const T0 = 1_791_400_000; // unix seconds
const WEEK = 7 * 86_400;

let n = 0;
const ev = (slot: number, time: number, signers: string[], memo: string): LedgerEvent => ({
  sig: `sig${++n}`, slot, time, signers, memo: parseSessionMemo(memo)!,
});
const link = (slot = 100, time = T0, exp = T0 + WEEK, by = owner, s = session) => ev(slot, time, [by], linkMemoText(s, exp));
const ci = (slot: number, time: number, day = 20261008, streak = 3, by = session, o = owner) =>
  ev(slot, time, [by], sessionClockInText(day, streak, o, ':war=1:side=BONK'));

describe('session memos', () => {
  it('formats and parses link, revoke and session Clock-In memos', () => {
    expect(linkMemoText(session, T0 + WEEK)).toBe(`mempire:session:v1:${session}:${T0 + WEEK}`);
    expect(parseSessionMemo(`[83] ${linkMemoText(session, T0 + WEEK)}`)).toEqual({ kind: 'link', session, expiresAt: T0 + WEEK });
    expect(parseSessionMemo(revokeMemoText(session))).toEqual({ kind: 'revoke', session });
    expect(parseSessionMemo(sessionClockInText(20261008, 4, owner, ':war=1:side=BONK')))
      .toEqual({ kind: 'clockin', day: 20261008, streak: 4, owner });
    // an owner-signed Clock-In (no owner=) is not a session memo
    expect(parseSessionMemo('mempire:clockin:v1:day=20261008:streak=4')).toBeNull();
  });

  it('builds ONE owner-signed link tx: memo by the owner + the fee float to the session key', () => {
    const ixs = linkIxs(new PublicKey(owner), new PublicKey(session), T0 + WEEK);
    expect(ixs).toHaveLength(2);
    expect(ixs[0].keys).toEqual([{ pubkey: new PublicKey(owner), isSigner: true, isWritable: false }]);
    expect(ixs[0].data.toString()).toBe(linkMemoText(session, T0 + WEEK));
    expect(ixs[1].programId.equals(SystemProgram.programId)).toBe(true);
    expect(ixs[1].data.readBigUInt64LE(4)).toBe(BigInt(FEE_FLOAT_LAMPORTS));
    expect(FEE_FLOAT_LAMPORTS).toBeGreaterThan(890_880); // rent-exempt, or the transfer fails
    expect(linkIxs(new PublicKey(owner), new PublicKey(session), T0 + WEEK, 0)).toHaveLength(1); // float optional
  });

  it('session Clock-In is signed by the session key only (owner is named, not a signer)', () => {
    const ix = sessionClockInIx(new PublicKey(session), new PublicKey(owner), 20261008, 2);
    expect(ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner])).toEqual([[session, true]]);
    expect(ix.data.toString()).toContain(`:owner=${owner}`);
  });

  it('a self-revoke sweeps the float back to the owner, minus its own fee', () => {
    const ixs = revokeIxs(new PublicKey(session), new PublicKey(session), { to: new PublicKey(owner), balance: 900_000 });
    expect(ixs).toHaveLength(2);
    expect(ixs[1].data.readBigUInt64LE(4)).toBe(BigInt(900_000 - TX_FEE_LAMPORTS));
    expect(revokeIxs(new PublicKey(owner), new PublicKey(session))).toHaveLength(1);
  });
});

describe('ledger validation', () => {
  it('accepts a session Clock-In after an owner-signed link, within 7 days', () => {
    const r = validateLedger(owner, [link(), ci(110, T0 + 60), ci(5000, T0 + 6 * 86_400)]);
    expect(r.accepted.map((a) => a.streak)).toEqual([3, 3]);
    expect(r.rejected).toEqual([]);
    expect(activeLink(r.links, T0 + 100)?.session).toBe(session);
  });

  it('rejects a link the owner did not sign (a forged link from someone else)', () => {
    const r = validateLedger(owner, [link(100, T0, T0 + WEEK, thief), ci(110, T0 + 60)]);
    expect(r.links).toEqual([]);
    expect(r.accepted).toEqual([]);
    expect(r.rejected.map((x) => x.reason)).toEqual(['link not signed by the owner', 'no session link from this owner for the signer']);
  });

  it('rejects Clock-Ins after expiry, and links longer than 7 days', () => {
    const r = validateLedger(owner, [link(), ci(9000, T0 + WEEK + 1)]);
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0].reason).toBe('session expired');
    expect(activeLink(r.links, T0 + WEEK + 1)).toBeNull();
    const long = validateLedger(owner, [link(100, T0, T0 + MAX_SESSION_SECS + 60)]);
    expect(long.links).toEqual([]);
    expect(long.rejected[0].reason).toBe('link longer than 7 days');
  });

  it('rejects Clock-Ins signed before the link landed', () => {
    const r = validateLedger(owner, [ci(90, T0 - 10), link()]);
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0].reason).toBe('signed before the link');
  });

  it('a revoke (by the owner or the session key) ends it; Clock-Ins before it stay valid', () => {
    for (const by of [owner, session]) {
      const r = validateLedger(owner, [link(), ci(110, T0 + 60), ev(120, T0 + 120, [by], revokeMemoText(session)), ci(130, T0 + 180)]);
      expect(r.accepted.map((a) => a.sig)).toHaveLength(1);
      expect(r.rejected.map((x) => x.reason)).toEqual(['session revoked']);
      expect(activeLink(r.links, T0 + 200)).toBeNull();
    }
  });

  it('ignores a revoke signed by a stranger', () => {
    const r = validateLedger(owner, [link(), ev(120, T0 + 120, [thief], revokeMemoText(session)), ci(130, T0 + 180)]);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected.map((x) => x.reason)).toEqual(['revoke not signed by owner or session']);
  });

  it('rejects a Clock-In naming this owner but signed by an unlinked key, or naming another owner', () => {
    const r = validateLedger(owner, [link(), ci(110, T0 + 60, 20261008, 9, thief), ci(111, T0 + 61, 20261008, 9, session, thief)]);
    expect(r.accepted).toEqual([]);
    expect(r.rejected.map((x) => x.reason)).toEqual(['no session link from this owner for the signer', 'names another owner']);
  });

  it('a new link after a revoke starts a new session', () => {
    const s2 = Keypair.fromSeed(new Uint8Array(32).fill(4)).publicKey.toBase58();
    const r = validateLedger(owner, [
      link(), ev(120, T0 + 120, [owner], revokeMemoText(session)),
      link(130, T0 + 200, T0 + 200 + WEEK, owner, s2), ci(140, T0 + 260, 20261009, 4, s2),
    ]);
    expect(r.accepted.map((a) => a.session)).toEqual([s2]);
    expect(activeLink(r.links, T0 + 300)?.session).toBe(s2);
  });
});
