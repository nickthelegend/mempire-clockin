/**
 * No fighter hidden by HIDE_UNLICENSED_MARKS (the tokenised-stock fighters) may
 * appear anywhere a player can see or acquire it in the mobile build.
 *
 *   cd app && npx vitest run tests/hidden-fighters.test.ts
 */
import { describe, expect, it } from 'vitest';
import rosterJson from '../../mobile/src/data/roster.json';
import {
  BY_TICKER, CHESTS, HIDDEN_TICKERS, HIDE_UNLICENSED_MARKS, RIVALS, ROSTER, STARTER_DECK, STARTER_POOL,
  migrateDeck, rivalDeck, rollChest, type ChestTier, type OwnedCard,
} from '../../mobile/src/game/rules';
import { HERO_FIGHTERS, INTRO_FIGHTERS } from '../../mobile/src/data/showcase';
import { SEASON_WAR } from '../../mobile/src/game/board';
import { TIERS } from '../../mobile/src/game/season';

const STOCKS = (rosterJson as { ticker: string; kind: string }[]).filter((f) => f.kind === 'stock').map((f) => f.ticker);
const hidden = new Set(HIDDEN_TICKERS);

describe('hidden fighters never reach the player', () => {
  it('the flag hides every stock fighter (20 of them)', () => {
    expect(HIDE_UNLICENSED_MARKS).toBe(true);
    expect([...hidden].sort()).toEqual([...STOCKS].sort());
    expect(STOCKS.length).toBe(20);
  });

  it('roster, lookup map, starters, showcase and Season War use only visible fighters', () => {
    for (const f of ROSTER) expect(hidden.has(f.ticker)).toBe(false);
    for (const t of STOCKS) expect(BY_TICKER.has(t)).toBe(false);
    const lists = [STARTER_POOL, STARTER_DECK, HERO_FIGHTERS, INTRO_FIGHTERS, SEASON_WAR.sides];
    for (const list of lists) for (const t of list) {
      expect(hidden.has(t)).toBe(false);
      expect(BY_TICKER.has(t)).toBe(true);
    }
  });

  it('every AI rival deck (including Blue Chips and Whale Court) is visible-only', () => {
    for (const r of RIVALS) {
      for (const t of r.tickers) expect(hidden.has(t)).toBe(false);
      for (const lvl of [1, 5, 10]) for (const c of rivalDeck(r, lvl)) expect(hidden.has(c.ticker)).toBe(false);
    }
  });

  it('chest drop tables never roll a hidden fighter (2,000 chests, empty and full collections)', () => {
    let s = 12345;
    const rand = () => { s = (s * 1103515245 + 12345) >>> 0; return s; };
    const full: Record<string, OwnedCard> = Object.fromEntries(ROSTER.map((f) => [f.ticker, { level: 1, copies: 0 }]));
    for (let i = 0; i < 2000; i++) {
      const tier = (Object.keys(CHESTS) as ChestTier[])[i % 4];
      for (const d of rollChest(tier, i % 2 ? {} : full, rand)) expect(hidden.has(d.ticker)).toBe(false);
    }
  });

  it('Season Pass rewards contain no fighters', () => {
    for (const t of TIERS) for (const r of [t.free, t.premium]) if (r) expect(['chest', 'slot', 'shield', 'frame', 'emote']).toContain(r.kind);
  });

  it('saved decks are migrated: hidden slots replaced, the rest of the deck kept', () => {
    const cards: Record<string, OwnedCard> = {
      ETH: { level: 3, copies: 0 }, WIF: { level: 1, copies: 0 }, BTC: { level: 2, copies: 0 }, DOGE: { level: 1, copies: 0 },
      SOL: { level: 1, copies: 0 }, BONK: { level: 1, copies: 0 }, POPCAT: { level: 1, copies: 0 }, PEPE: { level: 4, copies: 0 },
    };
    // An old 1.2 deck with NVDA and MSTR in it (their cards are already dropped on load).
    const old = ['ETH', 'NVDA', 'BTC', 'DOGE', 'SOL', 'BONK', 'MSTR', 'WIF'];
    const deck = migrateDeck(old, cards);
    expect(deck).toHaveLength(8);
    expect(new Set(deck).size).toBe(8);
    for (const t of deck) expect(hidden.has(t)).toBe(false);
    for (const kept of ['ETH', 'BTC', 'DOGE', 'SOL', 'BONK', 'WIF']) expect(deck).toContain(kept);
    expect(deck).toContain('PEPE'); // the best owned spare fills a hidden slot
  });
});
