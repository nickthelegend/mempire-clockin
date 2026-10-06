/**
 * The AI coach — it plays your deck before you do.
 *
 * Not a chatbot. The coach runs the game's real battle engine
 * (`app/src/sim`, the same deterministic fixed-point simulation the 3D arena
 * and the on-chain match log use) on the phone, pits your eight cards against
 * a gauntlet of rival decks with the built-in AI pilot on both seats, and
 * reports what actually happened: win rate, crowns, which matchups lose, and
 * which single swap from your collection wins more.
 *
 * Every number it shows is a measurement from simulated matches, with the
 * sample size stated next to it. Nothing is generated text pretending to be
 * analysis, and nothing leaves the device.
 */
import { createMatch, stepSim } from '../../../app/src/sim/engine';
import { decideBot, type BotDifficulty } from '../../../app/src/sim/bot';
import { archetypeForMint } from '../../../app/src/sim/archetypes';
import { traitForMint } from '../../../app/src/sim/traits';
import {
  FORMATS, TICKS_PER_SEC, type Format, type InputEvent, type MatchCard,
} from '../../../app/src/sim/types';

/**
 * The coach's format: the standard match's elixir rules, cut to 90 seconds
 * with double elixir for the last 45. Rush (30 s) is too short for the AI
 * pilots to reach a tower, so every rush sim was a draw; a full 3–4 minute
 * match is too slow to run dozens of on a phone. Same engine, same stats.
 */
export const COACH_FORMAT: Format = {
  ...FORMATS.standard,
  regulationTicks: 90 * TICKS_PER_SEC,
  overtimeTicks: 0,
  doubleElixirAt: 45 * TICKS_PER_SEC,
};

export interface CoachCard { ticker: string; mint: string; level: number }

export interface MatchOutcome {
  winner: number;
  crowns: [number, number];
  /** Share of the enemy's total tower HP each seat destroyed, 0..1. */
  damage: [number, number];
  ticks: number;
}

export const toMatchCard = (c: CoachCard): MatchCard => ({
  coinId: c.mint,
  name: c.ticker,
  archetype: archetypeForMint(c.mint),
  trait: traitForMint(c.mint),
  level: c.level,
});

function damageOf(towers: { hp: number; maxHp: number }[]): [number, number] {
  const lost = (from: number) => {
    let hp = 0; let max = 0;
    for (let i = from; i < from + 3; i++) { hp += Math.max(0, towers[i].hp); max += towers[i].maxHp; }
    return max ? 1 - hp / max : 0;
  };
  return [lost(3), lost(0)];
}

function crownsOf(towers: { hp: number; owner: number }[]): [number, number] {
  // towers[0..2] belong to seat 0, [3..5] to seat 1; a felled enemy tower is a crown.
  let a = 0; let b = 0;
  towers.forEach((t, i) => {
    if (t.hp > 0) return;
    if (i >= 3) a += 1; else b += 1;
  });
  return [a, b];
}

/**
 * One headless match, both seats piloted by the game's own bot.
 *
 * Played in COACH_FORMAT (90 s) so a phone can afford dozens of them; it is
 * the same engine and the same card stats, only shorter.
 */
export function simulate(
  a: MatchCard[], b: MatchCard[], seed: number,
  diff: [BotDifficulty, BotDifficulty] = ['normal', 'normal'],
): MatchOutcome {
  const state = createMatch(seed >>> 0, [a, b], COACH_FORMAT);
  const pending = new Map<number, InputEvent[]>();
  const cap = COACH_FORMAT.regulationTicks + COACH_FORMAT.overtimeTicks + 40;
  while (state.phase !== 'ended' && state.tick < cap) {
    for (const p of [0, 1] as const) {
      const ev = decideBot(state, p, diff[p]);
      if (ev) {
        const list = pending.get(ev.tick) ?? [];
        list.push(ev);
        pending.set(ev.tick, list);
      }
    }
    stepSim(state, pending.get(state.tick) ?? []);
    pending.delete(state.tick - 1);
  }
  return {
    winner: state.winner,
    crowns: crownsOf(state.towers),
    damage: damageOf(state.towers),
    ticks: state.tick,
  };
}

export interface Rival { name: string; deck: CoachCard[] }

export interface Matchup {
  rival: string; wins: number; draws: number; games: number;
  crownsFor: number; crownsAgainst: number;
  /** Mean share of enemy tower HP destroyed, and conceded. */
  dmgFor: number; dmgAgainst: number;
}

export interface Evaluation {
  games: number;
  wins: number;
  draws: number;
  winRate: number; // 0..1, draws count half
  crownsPerGame: number;
  /** Mean share of enemy tower HP destroyed per match, 0..1. */
  damagePerGame: number;
  matchups: Matchup[];
  ms: number;
}

/** Yield to the UI between matches so a long run never freezes the screen. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

export async function evaluate(
  deck: CoachCard[], rivals: Rival[], seedsPerRival: number,
  onProgress?: (done: number, total: number) => void,
  baseSeed = 0x5eed,
): Promise<Evaluation> {
  const t0 = Date.now();
  const mine = deck.map(toMatchCard);
  const total = rivals.length * seedsPerRival * 2;
  let done = 0; let wins = 0; let draws = 0; let crowns = 0; let dmg = 0;
  const matchups: Matchup[] = [];
  for (const r of rivals) {
    const theirs = r.deck.map(toMatchCard);
    const m: Matchup = {
      rival: r.name, wins: 0, draws: 0, games: 0, crownsFor: 0, crownsAgainst: 0, dmgFor: 0, dmgAgainst: 0,
    };
    for (let s = 0; s < seedsPerRival; s++) {
      // Each seed is played from both seats, so a seat advantage cannot pose
      // as a deck advantage.
      for (const seat of [0, 1] as const) {
        const seed = (baseSeed + s * 7919 + r.name.length * 104729) >>> 0;
        const out = seat === 0 ? simulate(mine, theirs, seed) : simulate(theirs, mine, seed);
        const myCrowns = out.crowns[seat];
        const oppCrowns = out.crowns[seat === 0 ? 1 : 0];
        m.games += 1; m.crownsFor += myCrowns; m.crownsAgainst += oppCrowns;
        crowns += myCrowns;
        m.dmgFor += out.damage[seat];
        m.dmgAgainst += out.damage[seat === 0 ? 1 : 0];
        dmg += out.damage[seat];
        if (out.winner === seat) { m.wins += 1; wins += 1; } else if (out.winner === -2 || out.winner === -1) { m.draws += 1; draws += 1; }
        done += 1;
        onProgress?.(done, total);
        await breathe();
      }
    }
    m.dmgFor /= Math.max(1, m.games);
    m.dmgAgainst /= Math.max(1, m.games);
    matchups.push(m);
  }
  const games = done;
  return {
    games, wins, draws,
    winRate: games ? (wins + draws / 2) / games : 0,
    crownsPerGame: games ? crowns / games : 0,
    damagePerGame: games ? dmg / games : 0,
    matchups,
    ms: Date.now() - t0,
  };
}

export interface SwapSuggestion {
  out: CoachCard;
  in: CoachCard;
  before: number;
  after: number;
  games: number;
}

/**
 * Search for the single best swap.
 *
 * A greedy local search: for the weakest-looking slots, try the strongest
 * candidates from the collection, keep whichever raises the measured win rate
 * the most. Small on purpose — a phone has seconds, not minutes — and the
 * result says how many games stand behind it.
 */
export async function bestSwap(
  deck: CoachCard[], pool: CoachCard[], rivals: Rival[], baseline: Evaluation,
  opts: { slots?: number; candidates?: number; seeds?: number } = {},
  onProgress?: (label: string, done: number, total: number) => void,
): Promise<SwapSuggestion | null> {
  const slots = opts.slots ?? 3;
  const candidates = opts.candidates ?? 3;
  const seeds = opts.seeds ?? 1;
  const inDeck = new Set(deck.map((c) => c.ticker));
  const arch = (c: CoachCard) => archetypeForMint(c.mint);
  const counts = new Map<number, number>();
  deck.forEach((c) => counts.set(arch(c), (counts.get(arch(c)) ?? 0) + 1));

  // Weakest slots first: lowest level, then most duplicated archetype.
  const order = deck
    .map((c, i) => ({ c, i, score: c.level * 10 - (counts.get(arch(c)) ?? 0) }))
    .sort((x, y) => x.score - y.score)
    .slice(0, slots);
  // Candidates: highest level first, preferring archetypes the deck is short of.
  const bench = pool
    .filter((c) => !inDeck.has(c.ticker))
    .sort((x, y) => (y.level - x.level) || ((counts.get(arch(x)) ?? 0) - (counts.get(arch(y)) ?? 0)))
    .slice(0, candidates);
  if (!bench.length) return null;

  const total = order.length * bench.length;
  let done = 0;
  let best: SwapSuggestion | null = null;
  for (const o of order) {
    for (const cand of bench) {
      const trial = deck.slice();
      trial[o.i] = cand;
      onProgress?.(`${o.c.ticker} → ${cand.ticker}`, done, total);
      const ev = await evaluate(trial, rivals, seeds);
      done += 1;
      if (ev.winRate > (best?.after ?? baseline.winRate)) {
        best = { out: o.c, in: cand, before: baseline.winRate, after: ev.winRate, games: ev.games };
      }
    }
  }
  return best;
}

/** Plain-language read of a measured evaluation. Every clause is a number above. */
export function verdict(ev: Evaluation): string[] {
  const lines: string[] = [];
  const pct = Math.round(ev.winRate * 100);
  lines.push(`Won ${ev.wins} of ${ev.games} simulated matches (${pct}% counting draws as half).`);
  const sorted = [...ev.matchups].sort((a, b) => (a.wins / a.games) - (b.wins / b.games));
  const worst = sorted[0];
  const bestM = sorted[sorted.length - 1];
  if (worst && worst.games) {
    lines.push(`Toughest rival: ${worst.rival} — ${worst.wins}/${worst.games} wins, you lose ${Math.round(worst.dmgAgainst * 100)}% of your tower HP on average.`);
  }
  if (bestM && bestM !== worst && bestM.games) {
    lines.push(`Best matchup: ${bestM.rival} — ${bestM.wins}/${bestM.games} wins.`);
  }
  lines.push(`Your pushes destroy ${Math.round(ev.damagePerGame * 100)}% of enemy tower HP per match${ev.crownsPerGame >= 0.1 ? ` and take ${ev.crownsPerGame.toFixed(1)} crowns` : ''}.`);
  return lines;
}
