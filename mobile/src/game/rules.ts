/**
 * The native game's rules: roster, card levels, chests, and the daily Clock-In.
 *
 * Pure functions only — no storage, no React — so the rules can be read and
 * tested on their own and the store stays a thin shell over them.
 */
import rosterJson from '../data/roster.json';
import { archetypeForMint } from '../../../app/src/sim/archetypes';

export interface Fighter {
  ticker: string;
  name: string;
  mint: string; // the devnet registry mint the program and the sim both hash
  hue: number;
  kind: 'meme' | 'crypto' | 'stock';
  archetype: number;
}

export const ROSTER: Fighter[] = (rosterJson as Omit<Fighter, 'archetype'>[]).map((f) => ({
  ...f,
  kind: (f.kind as Fighter['kind']) ?? 'meme',
  archetype: archetypeForMint(f.mint),
}));
export const BY_TICKER = new Map(ROSTER.map((f) => [f.ticker, f]));

export const MAX_LEVEL = 10;
/** Copies needed to go from level L to L+1 (index L). Clash-shaped curve. */
export const COPIES_TO_LEVEL = [0, 2, 4, 6, 10, 16, 24, 36, 50, 70, Infinity];

export interface OwnedCard { level: number; copies: number }

export type ChestTier = 'silver' | 'golden' | 'magic' | 'legendary';
export const CHESTS: Record<ChestTier, { name: string; cards: number; copies: [number, number]; unlockMin: number }> = {
  silver: { name: 'Silver Chest', cards: 3, copies: [1, 2], unlockMin: 3 },
  golden: { name: 'Golden Chest', cards: 4, copies: [2, 4], unlockMin: 8 },
  magic: { name: 'Magic Chest', cards: 5, copies: [3, 6], unlockMin: 20 },
  legendary: { name: 'Legendary Chest', cards: 6, copies: [5, 9], unlockMin: 45 },
};
export const CHEST_SLOTS = 4;

/** Uniform 32-bit randomness from the platform CSPRNG (polyfilled at startup). */
export function rand32(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
const pick = <T,>(xs: T[]): T => xs[rand32() % xs.length];

export interface Drop { ticker: string; copies: number; fresh: boolean }

/**
 * Open a chest: distinct fighters, each with a copy count in the tier's range.
 * Unowned fighters are drawn first, so a chest teaches you a new card before
 * it hands you a duplicate.
 */
export function rollChest(tier: ChestTier, owned: Record<string, OwnedCard>): Drop[] {
  const def = CHESTS[tier];
  const fresh = ROSTER.filter((f) => !owned[f.ticker]);
  const known = ROSTER.filter((f) => owned[f.ticker]);
  const out: Drop[] = [];
  const used = new Set<string>();
  for (let i = 0; i < def.cards; i++) {
    const wantFresh = fresh.length > 0 && (i === 0 || rand32() % 3 === 0);
    const pool = (wantFresh ? fresh : known.length ? known : fresh).filter((f) => !used.has(f.ticker));
    if (!pool.length) break;
    const f = pick(pool);
    used.add(f.ticker);
    const [lo, hi] = def.copies;
    out.push({ ticker: f.ticker, copies: lo + (rand32() % (hi - lo + 1)), fresh: !owned[f.ticker] });
  }
  return out;
}

/** A win rolls a chest tier with published odds. */
export function winChestTier(): ChestTier {
  const r = rand32() % 100;
  if (r < 3) return 'legendary';
  if (r < 12) return 'magic';
  if (r < 38) return 'golden';
  return 'silver';
}

// ── the daily Clock-In ─────────────────────────────────────────────────────

/** Local calendar day as YYYYMMDD — the unit a streak is counted in. */
export function dayKey(d = new Date()): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function daysBetween(a: number, b: number): number {
  const toDate = (k: number) => new Date(Math.floor(k / 10000), Math.floor((k % 10000) / 100) - 1, k % 100);
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

export interface Streak {
  count: number;
  best: number;
  lastDay: number; // 0 = never clocked in
  shields: number; // SKR-bought streak protection
}

export interface ClockInOutcome {
  streak: Streak;
  /** Shields consumed to bridge missed days. */
  shieldsUsed: number;
  /** The streak reset because a gap could not be bridged. */
  broke: boolean;
}

/**
 * Advance the streak for today.
 *
 * One missed day can be bridged by one Streak Shield (bought with SKR). Two or
 * more missed days need that many shields; otherwise the streak restarts at 1.
 */
export function clockIn(s: Streak, today = dayKey()): ClockInOutcome | null {
  if (s.lastDay === today) return null; // already clocked in
  if (!s.lastDay) {
    const streak = { ...s, count: 1, best: Math.max(s.best, 1), lastDay: today };
    return { streak, shieldsUsed: 0, broke: false };
  }
  const gap = daysBetween(s.lastDay, today);
  const missed = Math.max(0, gap - 1);
  if (missed === 0) {
    const count = s.count + 1;
    return { streak: { ...s, count, best: Math.max(s.best, count), lastDay: today }, shieldsUsed: 0, broke: false };
  }
  if (missed <= s.shields) {
    const count = s.count + 1;
    return {
      streak: { ...s, count, best: Math.max(s.best, count), lastDay: today, shields: s.shields - missed },
      shieldsUsed: missed,
      broke: false,
    };
  }
  return { streak: { ...s, count: 1, lastDay: today }, shieldsUsed: 0, broke: s.count > 1 };
}

/** Is the streak at risk right now (clocked in yesterday, not yet today)? */
export function streakState(s: Streak, today = dayKey()): 'done' | 'due' | 'lapsed' | 'new' {
  if (!s.lastDay) return 'new';
  if (s.lastDay === today) return 'done';
  const missed = daysBetween(s.lastDay, today) - 1;
  if (missed <= 0) return 'due';
  return missed <= s.shields ? 'due' : 'lapsed';
}

export interface DayReward { day: number; chest: ChestTier | null; skr: number }

/** The seven-day ladder. Day 7 is the one worth coming back for. */
export const WEEK: DayReward[] = [
  { day: 1, chest: 'silver', skr: 5 },
  { day: 2, chest: null, skr: 10 },
  { day: 3, chest: 'golden', skr: 5 },
  { day: 4, chest: null, skr: 15 },
  { day: 5, chest: 'golden', skr: 10 },
  { day: 6, chest: null, skr: 20 },
  { day: 7, chest: 'legendary', skr: 30 },
];

export function rewardFor(streakCount: number, seekerVerified: boolean): DayReward {
  const base = WEEK[(Math.max(1, streakCount) - 1) % 7];
  // Seeker Genesis Token holders earn double SKR — a perk only a Seeker can have.
  return { ...base, skr: seekerVerified ? base.skr * 2 : base.skr };
}

// ── SKR shop ────────────────────────────────────────────────────────────────

export type ShopItemId = 'shield' | 'seeker-chest' | 'rush';
export const SHOP: { id: ShopItemId; title: string; price: number; blurb: string }[] = [
  {
    id: 'shield', title: 'Streak Shield', price: 15,
    blurb: 'Miss a day without losing your Clock-In streak. Used automatically.',
  },
  {
    id: 'seeker-chest', title: 'Seeker Chest', price: 40,
    blurb: 'A Magic Chest that opens instantly — 5 fighters, 3–6 copies each.',
  },
  {
    id: 'rush', title: 'Rush Unlock', price: 8,
    blurb: 'Finish the chest that is unlocking right now.',
  },
];

// ── rivals for battles and the coach ────────────────────────────────────────

export interface RivalDef { name: string; tickers: string[]; levelDelta: number }

export const RIVALS: RivalDef[] = [
  { name: 'Doggo Pack (AI)', tickers: ['DOGE', 'SHIB', 'BONK', 'WIF', 'FWOG', 'PNUT', 'MOODENG', 'CATS'], levelDelta: -1 },
  { name: 'Blue Chips (AI)', tickers: ['BTC', 'ETH', 'SOL', 'NVDA', 'META', 'MSTR', 'V', 'AAPL'], levelDelta: 0 },
  { name: 'Degen Swarm (AI)', tickers: ['POPCAT', 'MEW', 'PEPE', 'BRETT', 'MOG', 'PONKE', 'GIGA', 'GOAT'], levelDelta: 0 },
  { name: 'Whale Court (AI)', tickers: ['BTC', 'SOL', 'MSTR', 'COIN', 'HOOD', 'TSLA', 'SPY', 'JPM'], levelDelta: 1 },
];

/** A rival's deck at a level relative to the player's average, filling gaps from the roster. */
export function rivalDeck(r: RivalDef, avgLevel: number): { ticker: string; mint: string; level: number }[] {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.round(avgLevel) + r.levelDelta));
  const chosen: Fighter[] = [];
  for (const t of r.tickers) {
    const f = BY_TICKER.get(t);
    if (f && !chosen.includes(f)) chosen.push(f);
  }
  for (const f of ROSTER) {
    if (chosen.length >= 8) break;
    if (!chosen.includes(f)) chosen.push(f);
  }
  return chosen.slice(0, 8).map((f) => ({ ticker: f.ticker, mint: f.mint, level: lvl }));
}

/** Twelve fighters every new player starts with: two of each archetype. */
export const STARTER_POOL = ['ETH', 'NVDA', 'WIF', 'GOAT', 'BTC', 'POPCAT', 'DOGE', 'SHIB', 'SOL', 'MSTR', 'BONK', 'PEPE'];
/** The opening eight: one tank, swarm, ranged, splash, support and spell, plus two. */
export const STARTER_DECK = ['ETH', 'WIF', 'BTC', 'DOGE', 'SOL', 'BONK', 'POPCAT', 'GOAT'];
