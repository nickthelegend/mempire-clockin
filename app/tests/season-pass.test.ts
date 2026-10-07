/**
 * Season Pass, cosmetics and roster rules for the native app (mobile/src/game).
 *
 *   cd app && npx vitest run tests/season-pass.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  COSMETIC_OR_CONVENIENCE, SEASON, TIERS, XP, addXp, canClaim, claim, claimable, freshPass, rollSeason,
  tierFor, tierProgress,
} from '../../mobile/src/game/season';
import { HIDDEN_TICKERS, RIVALS, ROSTER, STARTER_DECK, STARTER_POOL, rivalDeck } from '../../mobile/src/game/rules';
import { drainPending, placeChest } from '../../mobile/src/game/inbox';
import { ARENA_SKIN_IDS, SKIN_LOOK, recolor } from '../src/three/skin';
import skins from '../../mobile/src/data/skins.json';

describe('season pass track', () => {
  it('has the advertised number of tiers, numbered 1..N', () => {
    expect(TIERS).toHaveLength(SEASON.tiers);
    expect(TIERS.map((t) => t.n)).toEqual(Array.from({ length: SEASON.tiers }, (_, i) => i + 1));
  });
  it('never pays stats: every reward is a chest, slot, shield, frame or emote', () => {
    for (const t of TIERS) {
      for (const r of [t.free, t.premium]) if (r) expect(COSMETIC_OR_CONVENIENCE).toContain(r.kind);
    }
  });
  it('XP maps to tiers and caps at the top tier', () => {
    expect(tierFor(0)).toBe(0);
    expect(tierFor(SEASON.xpPerTier - 1)).toBe(0);
    expect(tierFor(SEASON.xpPerTier)).toBe(1);
    expect(tierFor(10 ** 9)).toBe(SEASON.tiers);
    expect(tierProgress(SEASON.xpPerTier / 2)).toBeCloseTo(0.5);
    let p = freshPass();
    p = addXp(p, 'clockin', 10_000);
    expect(p.xp).toBe(SEASON.tiers * SEASON.xpPerTier);
    expect(addXp(freshPass(), 'win').xp).toBe(XP.win);
  });
  it('free tiers claim once; premium needs the pass', () => {
    const p = addXp(freshPass(), 'win', 5); // 200 XP = tier 2
    expect(canClaim(p, 1, 'free', false)).toBe(true);
    expect(canClaim(p, 3, 'free', false)).toBe(false); // not reached
    expect(canClaim(p, 2, 'free', false)).toBe(false); // tier 2 has no free reward
    expect(canClaim(p, 1, 'premium', false)).toBe(false); // no pass
    expect(canClaim(p, 1, 'premium', true)).toBe(true);
    const c = claim(p, 1, 'free', false)!;
    expect(c.reward).toEqual(TIERS[0].free);
    expect(claim(c.pass, 1, 'free', false)).toBeNull(); // twice
    expect(claimable(c.pass, true).map((x) => `${x.n}${x.track}`)).toEqual(['1premium', '2premium']);
  });
  it('a new season starts the track over', () => {
    const old = { ...addXp(freshPass(0), 'win', 3), season: 0 };
    expect(rollSeason(old).xp).toBe(0);
    const cur = addXp(freshPass(), 'win');
    expect(rollSeason(cur)).toBe(cur);
    expect(rollSeason(undefined).season).toBe(SEASON.id);
  });
});

describe('extra chest slots from the pass', () => {
  it('a 5th slot takes a chest that would otherwise wait', () => {
    const rail = { chests: [1, 2, 3, 4].map((i) => ({ id: `c${i}`, tier: 'silver' as const, unlockAt: null, source: 'win' as const })), pending: [], nextChestId: 5 };
    expect(placeChest(rail, 'golden', 'pass').queued).toBe(true);
    expect(placeChest(rail, 'golden', 'pass', 5).queued).toBe(false);
    const waiting = placeChest(rail, 'golden', 'pass').rail;
    expect(drainPending(waiting, 5).delivered).toHaveLength(1);
  });
});

describe('unlicensed company marks are hidden from the mobile roster', () => {
  const hidden = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'AMD', 'META', 'GOOGL', 'SBUX', 'DIS', 'COIN', 'HOOD'];
  it('hides the stock fighters, keeps crypto', () => {
    for (const t of hidden) expect(HIDDEN_TICKERS).toContain(t);
    for (const t of hidden) expect(ROSTER.some((f) => f.ticker === t)).toBe(false);
    expect(ROSTER.some((f) => f.ticker === 'BTC')).toBe(true);
    expect(ROSTER.every((f) => f.kind !== 'stock')).toBe(true);
  });
  it('starters and every rival deck use only visible fighters', () => {
    const visible = new Set(ROSTER.map((f) => f.ticker));
    for (const t of [...STARTER_POOL, ...STARTER_DECK]) expect(visible.has(t)).toBe(true);
    for (const r of RIVALS) {
      for (const t of r.tickers) expect(visible.has(t)).toBe(true);
      expect(rivalDeck(r, 3).every((c) => visible.has(c.ticker))).toBe(true);
    }
  });
});

describe('arena skins', () => {
  it('every catalogue arena skin has a look and a recolour', () => {
    for (const s of skins.arena) {
      expect(ARENA_SKIN_IDS).toContain(s.key);
      expect(SKIN_LOOK[s.key as keyof typeof SKIN_LOOK]).toBeDefined();
    }
  });
  it('recolour is deterministic and stays in 0..255', () => {
    for (const k of ['neon', 'golden', 'frozen'] as const) {
      for (const px of [[0, 0, 0], [255, 255, 255], [121, 201, 75], [15, 125, 158]] as const) {
        const a = recolor(k, px[0], px[1], px[2]);
        expect(a).toEqual(recolor(k, px[0], px[1], px[2]));
        for (const v of a) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }
      }
    }
    // Frozen turns grass green into a pale blue-white.
    const [r, g, b] = recolor('frozen', 121, 201, 75);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(150);
  });
});
