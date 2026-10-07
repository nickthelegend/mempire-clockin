/**
 * Unit tests for the native app's pure game rules (mobile/src/game): the
 * bug-hunt fixes that can be tested without a device.
 *
 *   cd app && npx vitest run tests/mobile-rules.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  CHEST_SLOTS, clockIn, dayKey, daysBetween, mergeChainStreak, nextRollover, streakState, utcDayKey,
  type Streak,
} from '../../mobile/src/game/rules';
import { drainPending, placeChest, type Rail } from '../../mobile/src/game/inbox';
import { reminderTime } from '../../mobile/src/notify.reminders';

const full = (): Rail => ({
  chests: Array.from({ length: CHEST_SLOTS }, (_, i) => ({ id: `chest_${i + 1}`, tier: 'silver' as const, unlockAt: null, source: 'win' as const })),
  pending: [],
  nextChestId: CHEST_SLOTS + 1,
});

describe('#1 chests are never lost when the rail is full', () => {
  it('queues a chest instead of dropping it', () => {
    const r = placeChest(full(), 'legendary', 'clockin');
    expect(r.chest).toBeNull();
    expect(r.queued).toBe(true);
    expect(r.rail.chests).toHaveLength(CHEST_SLOTS);
    expect(r.rail.pending).toEqual([{ tier: 'legendary', source: 'clockin' }]);
  });
  it('delivers waiting chests oldest-first as slots free', () => {
    let rail = placeChest(full(), 'golden', 'welcome').rail;
    rail = placeChest(rail, 'silver', 'quest').rail;
    rail = { ...rail, chests: rail.chests.slice(1) }; // one chest opened
    const d = drainPending(rail);
    expect(d.delivered.map((c) => [c.tier, c.source])).toEqual([['golden', 'welcome']]);
    expect(d.rail.chests).toHaveLength(CHEST_SLOTS);
    expect(d.rail.pending).toEqual([{ tier: 'silver', source: 'quest' }]);
    expect(new Set(d.rail.chests.map((c) => c.id)).size).toBe(CHEST_SLOTS); // ids unique
  });
  it('places directly when a slot is free', () => {
    const rail = { ...full(), chests: full().chests.slice(0, 2) };
    const r = placeChest(rail, 'magic', 'win');
    expect(r.queued).toBe(false);
    expect(r.chest?.tier).toBe('magic');
  });
});

describe('#7 one day definition (UTC) for streak and quests', () => {
  it('quests and Clock-In use the same day key', () => {
    expect(utcDayKey).toBe(dayKey);
  });
  it('the day turns over at 00:00 UTC regardless of local zone', () => {
    // 23:00 IST on Oct 7 = 17:30 UTC Oct 7; 00:30 IST Oct 8 = 19:00 UTC Oct 7 (same game day)
    expect(dayKey(new Date('2026-10-07T17:30:00Z'))).toBe(20261007);
    expect(dayKey(new Date('2026-10-07T19:00:00Z'))).toBe(20261007);
    expect(dayKey(new Date('2026-10-08T00:00:00Z'))).toBe(20261008);
    expect(nextRollover(new Date('2026-10-07T19:00:00Z')).toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });
  it('a second tap the same UTC day is refused; the next UTC day continues the streak', () => {
    const s: Streak = { count: 4, best: 4, lastDay: 20261007, shields: 0 };
    expect(clockIn(s, 20261007)).toBeNull();
    expect(clockIn(s, 20261008)?.streak.count).toBe(5);
    expect(daysBetween(20261031, 20261101)).toBe(1); // month boundary
  });
  it('a clock moved backwards cannot mint an extra Clock-In', () => {
    const s: Streak = { count: 4, best: 4, lastDay: 20261007, shields: 0 };
    expect(clockIn(s, 20261006)).toBeNull();
    expect(streakState(s, 20261006)).toBe('done');
  });
});

describe('#5 chain streak merge never loses a higher chain streak', () => {
  const chain = { day: 20261006, streak: 9 };
  it('adopts a later chain day (reinstall)', () => {
    expect(mergeChainStreak({ count: 0, best: 0, lastDay: 0, shields: 0 }, chain)?.count).toBe(9);
  });
  it('a local Clock-In made before the chain read continues the chain (N+1, not 1)', () => {
    const local: Streak = { count: 1, best: 1, lastDay: 20261007, shields: 0 };
    const m = mergeChainStreak(local, chain)!;
    expect(m.count).toBe(10);
    expect(m.lastDay).toBe(20261007);
    expect(m.best).toBe(10);
  });
  it('same day, higher chain count wins', () => {
    expect(mergeChainStreak({ count: 1, best: 1, lastDay: 20261006, shields: 0 }, chain)?.count).toBe(9);
  });
  it('no change when the device is already ahead', () => {
    expect(mergeChainStreak({ count: 10, best: 10, lastDay: 20261007, shields: 0 }, chain)).toBeNull();
  });
});

describe('streak reminder timing', () => {
  it('fires on the local evening before the UTC day ends, else shortly before the end', () => {
    const end = new Date('2026-10-08T00:00:00Z');
    const at = reminderTime(new Date('2026-10-07T08:00:00Z'), end)!;
    expect(at.getTime()).toBeLessThan(end.getTime());
    expect(at.getHours()).toBe(19);
    const late = reminderTime(new Date(end.getTime() - 40 * 60_000), end);
    expect(late).toBeNull(); // under 45 min left: too late to nudge
  });
});
