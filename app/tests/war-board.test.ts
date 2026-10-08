/**
 * Global Season War tally + streak board from WAR_REF history
 * (mobile/src/chain/war.ts): parsing, session validation, tally, streaks.
 *
 *   cd app && npx vitest run tests/war-board.test.ts
 */
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { computeBoard, toEvents, type RawEvent } from '../../mobile/src/chain/war';
import { WAR_REF, DUEL_REF, refIx, refPda } from '../../mobile/src/chain/refs';
import { linkMemoText, revokeMemoText, sessionClockInText } from '../../mobile/src/chain/session';

const k = (n: number) => Keypair.fromSeed(new Uint8Array(32).fill(n)).publicKey.toBase58();
const [ALICE, BOB, CARA, SESS, THIEF] = [k(1), k(2), k(3), k(4), k(5)];
const T0 = 1_791_400_000;
let slot = 100;
const ev = (signers: string[], memo: string, time = T0 + slot): RawEvent => ({ sig: `s${++slot}`, slot, time, signers, memos: [memo] });
const ci = (w: string, day: number, streak: number, side?: string) =>
  ev([w], `mempire:clockin:v1:day=${day}:streak=${streak}${side ? `:war=1:side=${side}` : ''}`);

describe('reference accounts', () => {
  it('are fixed PDAs (no private key), distinct, and ride read-only on a 0-lamport self-transfer', () => {
    expect(WAR_REF.toBase58()).toBe(refPda('war').toBase58());
    expect(WAR_REF.equals(DUEL_REF)).toBe(false);
    expect(PublicKey.isOnCurve(WAR_REF.toBytes())).toBe(false);
    expect(PublicKey.isOnCurve(DUEL_REF.toBytes())).toBe(false);
    const ix = refIx(Keypair.generate().publicKey, WAR_REF);
    expect(ix.keys[2]).toEqual({ pubkey: WAR_REF, isSigner: false, isWritable: false });
    expect(ix.data.readBigUInt64LE(4)).toBe(0n);
  });
});

describe('global board', () => {
  it('tallies sides by latest pledge, one Clock-In per wallet per day', () => {
    const raw = [
      ci(ALICE, 20261006, 1, 'BONK'), ci(ALICE, 20261007, 2, 'BONK'), ci(ALICE, 20261008, 3, 'POPCAT'),
      ci(BOB, 20261008, 1, 'BONK'), ci(BOB, 20261008, 1, 'BONK'), // a double post the same day
      ci(CARA, 20261008, 5), // no pledge
    ];
    const b = computeBoard(toEvents(raw), 20261008, ['BONK', 'POPCAT']);
    expect(b.sides).toEqual({ BONK: { wallets: 1, clockIns: 3 }, POPCAT: { wallets: 1, clockIns: 1 } });
    expect(b.wallets).toBe(3);
    expect(b.clockIns).toBe(5);
  });

  it('streaks are consecutive days on chain, not the number claimed in the memo', () => {
    const raw = [
      ci(ALICE, 20261006, 1), ci(ALICE, 20261007, 2), ci(ALICE, 20261008, 3),
      ci(BOB, 20261008, 99), // claims 99, chain shows 1 day
      ci(CARA, 20261001, 4), ci(CARA, 20261002, 5), // lapsed
    ];
    const b = computeBoard(toEvents(raw), 20261008, ['BONK', 'POPCAT']);
    expect(b.streaks.map((r) => [r.wallet, r.streak, r.claimed])).toEqual([[ALICE, 3, 3], [BOB, 1, 99], [CARA, 0, 5]]);
    // yesterday still counts as alive
    expect(computeBoard(toEvents(raw), 20261009, []).streaks[0]).toMatchObject({ wallet: ALICE, streak: 3 });
    expect(computeBoard(toEvents(raw), 20261010, []).streaks[0].streak).toBe(0);
  });

  it('session Clock-Ins count for the owner only with a valid owner-signed link', () => {
    const raw = [
      ev([ALICE], linkMemoText(SESS, T0 + 7 * 86_400)),
      ev([SESS], sessionClockInText(20261007, 1, ALICE, ':war=1:side=POPCAT')),
      ev([SESS], sessionClockInText(20261008, 2, ALICE, ':war=1:side=POPCAT')),
      // a thief's key naming BOB without any link from BOB: ignored
      ev([THIEF], sessionClockInText(20261008, 50, BOB, ':war=1:side=BONK')),
      // a link "for" CARA signed by the thief: ignored
      ev([THIEF], linkMemoText(THIEF, T0 + 86_400)),
      ev([THIEF], sessionClockInText(20261008, 9, CARA)),
    ];
    const evs = toEvents(raw);
    expect(evs.map((e) => [e.wallet, e.day, e.via])).toEqual([[ALICE, 20261007, 'session'], [ALICE, 20261008, 'session']]);
    const b = computeBoard(evs, 20261008, ['BONK', 'POPCAT']);
    expect(b.sides.POPCAT).toEqual({ wallets: 1, clockIns: 2 });
    expect(b.sides.BONK).toEqual({ wallets: 0, clockIns: 0 });
    expect(b.streaks[0]).toMatchObject({ wallet: ALICE, streak: 2 });
  });

  it('a revoked session stops counting', () => {
    const raw = [
      ev([ALICE], linkMemoText(SESS, T0 + 7 * 86_400)),
      ev([SESS], sessionClockInText(20261007, 1, ALICE)),
      ev([SESS], revokeMemoText(SESS)),
      ev([SESS], sessionClockInText(20261008, 2, ALICE)),
    ];
    expect(toEvents(raw).map((e) => e.day)).toEqual([20261007]);
  });

  it('ignores unrelated memos', () => {
    expect(toEvents([ev([ALICE], 'mempire:challenge:v1:blue-chips'), ev([ALICE], 'hello')])).toEqual([]);
  });
});
