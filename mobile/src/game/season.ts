/**
 * Season Pass rules: tiers, XP, and what each tier pays. Pure functions only.
 *
 * Free to play, never pay-to-win. Every reward is a chest, a chest slot, a
 * Streak Shield or a cosmetic (card frame, emote); nothing changes a fighter's
 * stats. The premium track unlocks when the wallet holds the season's
 * soulbound pass token (Token-2022, NonTransferable), read from chain.
 */
import type { ChestTier } from './rules';

export const SEASON = {
  id: 1,
  name: 'Season 1 · Clock-In Wars',
  /** Unix seconds; the on-chain season ends at the same moment. */
  endsAt: Date.UTC(2026, 10, 9) / 1000, // 9 Nov 2026 00:00 UTC
  tiers: 25,
  xpPerTier: 100,
  /** Price of the premium pass in SKR (whole tokens). A hypothesis to test. */
  priceSkr: 150,
} as const;

export type XpSource = 'clockin' | 'quest' | 'questBonus' | 'win' | 'loss' | 'draw';
export const XP: Record<XpSource, number> = {
  clockin: 60,
  quest: 25,
  questBonus: 40,
  win: 40,
  draw: 20,
  loss: 15,
};

export type Reward =
  | { kind: 'chest'; tier: ChestTier }
  | { kind: 'slot' }
  | { kind: 'shield'; n: number }
  | { kind: 'frame'; id: string }
  | { kind: 'emote'; id: string };

export interface Tier { n: number; free: Reward | null; premium: Reward }

/** Pass-exclusive cosmetics (kept on the device; the shop skins are on-chain). */
export const PASS_FRAMES: Record<string, { name: string; colors: [string, string] }> = {
  pixel: { name: 'Pixel Rim', colors: ['#7cf6d8', '#2160c4'] },
  laurel: { name: 'S1 Laurel', colors: ['#ffe38a', '#9945ff'] },
  clockwork: { name: 'Clockwork', colors: ['#f6e6cc', '#7a4a22'] },
};
export const EMOTES: Record<string, { label: string; glyph: string }> = {
  gm: { label: 'gm', glyph: '☀️' },
  gg: { label: 'GG', glyph: '🤝' },
  lfg: { label: 'LFG', glyph: '🚀' },
  wagmi: { label: 'WAGMI', glyph: '💎' },
  hodl: { label: 'HODL', glyph: '🛡️' },
};

const T = (n: number, free: Reward | null, premium: Reward): Tier => ({ n, free, premium });

/** 25 tiers. Free every other tier; premium every tier. */
export const TIERS: Tier[] = [
  T(1, { kind: 'chest', tier: 'silver' }, { kind: 'emote', id: 'gm' }),
  T(2, null, { kind: 'chest', tier: 'golden' }),
  T(3, { kind: 'emote', id: 'gg' }, { kind: 'shield', n: 1 }),
  T(4, null, { kind: 'chest', tier: 'silver' }),
  T(5, { kind: 'chest', tier: 'golden' }, { kind: 'frame', id: 'pixel' }),
  T(6, null, { kind: 'chest', tier: 'golden' }),
  T(7, { kind: 'shield', n: 1 }, { kind: 'emote', id: 'lfg' }),
  T(8, null, { kind: 'chest', tier: 'magic' }),
  T(9, { kind: 'chest', tier: 'silver' }, { kind: 'shield', n: 1 }),
  T(10, null, { kind: 'slot' }),
  T(11, { kind: 'frame', id: 'pixel' }, { kind: 'chest', tier: 'golden' }),
  T(12, null, { kind: 'emote', id: 'wagmi' }),
  T(13, { kind: 'chest', tier: 'golden' }, { kind: 'chest', tier: 'magic' }),
  T(14, null, { kind: 'shield', n: 2 }),
  T(15, { kind: 'emote', id: 'hodl' }, { kind: 'frame', id: 'clockwork' }),
  T(16, null, { kind: 'chest', tier: 'golden' }),
  T(17, { kind: 'shield', n: 1 }, { kind: 'chest', tier: 'magic' }),
  T(18, null, { kind: 'chest', tier: 'golden' }),
  T(19, { kind: 'chest', tier: 'magic' }, { kind: 'shield', n: 1 }),
  T(20, null, { kind: 'slot' }),
  T(21, { kind: 'chest', tier: 'golden' }, { kind: 'chest', tier: 'magic' }),
  T(22, null, { kind: 'chest', tier: 'golden' }),
  T(23, { kind: 'shield', n: 1 }, { kind: 'chest', tier: 'legendary' }),
  T(24, null, { kind: 'shield', n: 2 }),
  T(25, { kind: 'chest', tier: 'legendary' }, { kind: 'frame', id: 'laurel' }),
];

export interface PassState {
  season: number;
  xp: number;
  claimedFree: number[];
  claimedPremium: number[];
}

export const freshPass = (season: number = SEASON.id): PassState =>
  ({ season, xp: 0, claimedFree: [], claimedPremium: [] });

/** Tiers reached so far (0..tiers). */
export function tierFor(xp: number): number {
  return Math.min(SEASON.tiers, Math.floor(Math.max(0, xp) / SEASON.xpPerTier));
}

/** Progress inside the current tier, 0..1 (1 at the top tier). */
export function tierProgress(xp: number): number {
  if (tierFor(xp) >= SEASON.tiers) return 1;
  return (Math.max(0, xp) % SEASON.xpPerTier) / SEASON.xpPerTier;
}

export function addXp(p: PassState, source: XpSource, times = 1): PassState {
  const cap = SEASON.tiers * SEASON.xpPerTier;
  return { ...p, xp: Math.min(cap, p.xp + XP[source] * Math.max(0, times)) };
}

export type Track = 'free' | 'premium';

/** Can tier `n` on `track` be claimed now? Premium needs the on-chain pass. */
export function canClaim(p: PassState, n: number, track: Track, premium: boolean): boolean {
  const tier = TIERS.find((t) => t.n === n);
  if (!tier || n > tierFor(p.xp)) return false;
  if (track === 'free') return !!tier.free && !p.claimedFree.includes(n);
  return premium && !p.claimedPremium.includes(n);
}

export function claim(p: PassState, n: number, track: Track, premium: boolean): { pass: PassState; reward: Reward } | null {
  if (!canClaim(p, n, track, premium)) return null;
  const tier = TIERS.find((t) => t.n === n)!;
  return track === 'free'
    ? { pass: { ...p, claimedFree: [...p.claimedFree, n] }, reward: tier.free! }
    : { pass: { ...p, claimedPremium: [...p.claimedPremium, n] }, reward: tier.premium };
}

/** Everything claimable right now (for the Home badge). */
export function claimable(p: PassState, premium: boolean): { n: number; track: Track }[] {
  const out: { n: number; track: Track }[] = [];
  for (const t of TIERS) {
    if (canClaim(p, t.n, 'free', premium)) out.push({ n: t.n, track: 'free' });
    if (canClaim(p, t.n, 'premium', premium)) out.push({ n: t.n, track: 'premium' });
  }
  return out;
}

export function rewardLabel(r: Reward): string {
  switch (r.kind) {
    case 'chest': return `${r.tier[0].toUpperCase()}${r.tier.slice(1)} Chest`;
    case 'slot': return '+1 chest slot';
    case 'shield': return r.n > 1 ? `${r.n} Streak Shields` : 'Streak Shield';
    case 'frame': return `${PASS_FRAMES[r.id]?.name ?? r.id} frame`;
    case 'emote': return `"${EMOTES[r.id]?.label ?? r.id}" emote`;
  }
}

/** No reward may ever touch stats: a guard the tests assert over every tier. */
export const COSMETIC_OR_CONVENIENCE: Reward['kind'][] = ['chest', 'slot', 'shield', 'frame', 'emote'];

/** A season that has ended (or has a different id) starts the track over. */
export function rollSeason(p: PassState | undefined, season: number = SEASON.id): PassState {
  return p && p.season === season ? p : freshPass(season);
}
