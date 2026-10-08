import { create } from 'zustand';
import { createMatch, hashState, stepSim } from '../../../app/src/sim/engine';
import { decideBot, type BotDifficulty } from '../../../app/src/sim/bot';
import { archetypeForMint } from '../../../app/src/sim/archetypes';
import { traitForMint } from '../../../app/src/sim/traits';
import {
  FORMATS, HASH_EVERY_TICKS, INPUT_DELAY_TICKS,
  type InputEvent, type MatchCard, type SimState,
} from '../../../app/src/sim/types';
import { bindArenaStore } from '../../../app/src/three/arenaStore';
import { countRender } from './perf';

/**
 * The native arena's match: the game's deterministic sim and its bot pilot,
 * stepped on the JS thread at 20 Hz against the wall clock — the same loop the
 * web client runs for a bot match (`tickBot` / `stepOne` in
 * app/src/state/match.ts), minus everything that only exists there (relay,
 * escrow, rollup). The 3D scene reads this store through `bindArenaStore`.
 */
const TICK_MS = 50;

export interface NativeResult { won: boolean; draw: boolean; crowns: [number, number]; ticks: number; finalHash: number; plays: number; forfeited: boolean }

interface NativeMatchState {
  sim: SimState | null;
  perspective: 0 | 1;
  playerDeck: MatchCard[];
  botDeck: MatchCard[];
  /** Bumped every sim tick; the HUD subscribes to this. */
  version: number;
  crowns: [number, number];
  /** Monotonic counter of felled towers per side, for HUD/haptic pulses. */
  towerFell: { id: number; forPlayer: 0 | 1 } | null;
  deployed: number;
  result: NativeResult | null;
  paused: boolean;
  /** Cards the player has queued this match. */
  plays: number;
}

export const useNativeMatch = create<NativeMatchState>(() => ({
  sim: null,
  perspective: 0,
  playerDeck: [],
  botDeck: [],
  version: 0,
  crowns: [0, 0],
  towerFell: null,
  deployed: 0,
  result: null,
  paused: false,
  plays: 0,
}));
bindArenaStore(useNativeMatch);

let loop: ReturnType<typeof setInterval> | null = null;
let pending = new Map<number, InputEvent[]>();
let startedAt = 0;
let pausedAt = 0;
let difficulty: BotDifficulty = 'normal';
let onEnd: ((r: NativeResult) => void) | null = null;
/** No bot in a duel: seat 0 is the ghost, replaying its recorded deploys. */
let botSeat: 0 | 1 | null = 1;
/** Every deploy the player queued this match, exactly as the sim received it. */
let recorded: InputEvent[] = [];
let forfeited = false;
export const recording = (): InputEvent[] => recorded.slice();

export const toMatchCard = (c: { mint: string; ticker: string; level: number }): MatchCard => ({
  coinId: c.mint,
  name: c.ticker,
  archetype: archetypeForMint(c.mint),
  trait: traitForMint(c.mint),
  level: Math.max(1, Math.min(10, Math.round(c.level))),
});

function crownsOf(sim: SimState, me: 0 | 1): [number, number] {
  let mine = 0; let theirs = 0;
  for (const t of sim.towers) {
    if (t.hp > 0) continue;
    if (t.owner === me) theirs += 1; else mine += 1;
  }
  return [mine, theirs];
}

function finish(sim: SimState): void {
  stop();
  const me = useNativeMatch.getState().perspective;
  const result: NativeResult = {
    won: sim.winner === me,
    draw: sim.winner === -2,
    crowns: crownsOf(sim, me),
    ticks: sim.tick,
    finalHash: hashState(sim) >>> 0,
    plays: useNativeMatch.getState().plays,
    forfeited,
  };
  useNativeMatch.setState({ result });
  onEnd?.(result);
}

function stepOne(sim: SimState): void {
  countRender('ticks');
  const towersBefore = sim.towers.map((t) => t.hp > 0);
  const unitsBefore = sim.units.length;
  const bot = botSeat === null ? null : decideBot(sim, botSeat, difficulty);
  if (bot) {
    const list = pending.get(bot.tick) ?? [];
    list.push(bot);
    pending.set(bot.tick, list);
  }
  stepSim(sim, pending.get(sim.tick) ?? []);
  pending.delete(sim.tick - 1);
  if (sim.tick % HASH_EVERY_TICKS === 0) hashState(sim); // parity with the web loop's checkpoint cadence

  let felled: 0 | 1 | null = null;
  for (let i = 0; i < sim.towers.length; i++) {
    if (towersBefore[i] && sim.towers[i].hp <= 0) felled = sim.towers[i].owner;
  }
  useNativeMatch.setState((s) => ({
    version: s.version + 1,
    crowns: felled !== null ? crownsOf(sim, s.perspective) : s.crowns,
    towerFell: felled !== null ? { id: s.version + 1, forPlayer: felled } : s.towerFell,
    deployed: sim.units.length > unitsBefore ? s.deployed + 1 : s.deployed,
  }));
  if (sim.phase === 'ended') finish(sim);
}

function tick(): void {
  const { sim, paused } = useNativeMatch.getState();
  if (!sim || paused || sim.phase === 'ended') return;
  const target = Math.floor((Date.now() - startedAt) / TICK_MS);
  let steps = 0;
  // Catch up after a hitch, but never more than 6 ticks per frame — a
  // backgrounded app returns to a sane state instead of fast-forwarding a war.
  while (sim.tick < target && steps < 6) {
    stepOne(sim);
    steps += 1;
    if ((sim.phase as SimState['phase']) === 'ended') break;
  }
  if (sim.tick < target - 6) startedAt = Date.now() - sim.tick * TICK_MS;
}

function stop(): void {
  if (loop) clearInterval(loop);
  loop = null;
}

export function startNativeArena(opts: {
  player: MatchCard[]; bot: MatchCard[]; tier: number; rush: boolean; seed: number;
  onEnd: (r: NativeResult) => void;
  /** Ghost duel: the opponent's recorded deploys play seat 0, the player seat 1. */
  ghost?: InputEvent[];
}): void {
  stop();
  pending = new Map();
  recorded = [];
  forfeited = false;
  difficulty = opts.tier <= 0 ? 'easy' : opts.tier === 1 ? 'normal' : 'hard';
  onEnd = opts.onEnd;
  const duel = !!opts.ghost;
  botSeat = duel ? null : 1;
  const perspective: 0 | 1 = duel ? 1 : 0;
  // Seat 0 must be the ghost: its hand cycle comes from the seed's first
  // shuffle, the one it was recorded with.
  const decks: [MatchCard[], MatchCard[]] = duel ? [opts.bot, opts.player] : [opts.player, opts.bot];
  for (const ev of opts.ghost ?? []) {
    const list = pending.get(ev.tick) ?? [];
    list.push({ ...ev, player: 0 });
    pending.set(ev.tick, list);
  }
  const sim = createMatch(opts.seed >>> 0, decks, FORMATS[opts.rush ? 'rush' : 'standard']);
  useNativeMatch.setState({
    sim, perspective, playerDeck: opts.player, botDeck: opts.bot,
    version: 0, crowns: [0, 0], towerFell: null, deployed: 0, result: null, paused: false, plays: 0,
  });
  startedAt = Date.now();
  loop = setInterval(tick, TICK_MS / 2);
}

/** Queue a play exactly as the web client does: executed INPUT_DELAY_TICKS later. */
export function playCard(deckIndex: number, xFp: number, yFp: number): boolean {
  const { sim, perspective, paused } = useNativeMatch.getState();
  if (!sim || paused || sim.phase === 'ended') return false;
  const ev: InputEvent = { tick: sim.tick + INPUT_DELAY_TICKS, player: perspective, deckIndex, x: xFp, y: yFp };
  const list = pending.get(ev.tick) ?? [];
  list.push(ev);
  pending.set(ev.tick, list);
  recorded.push(ev);
  useNativeMatch.setState((st) => ({ plays: st.plays + 1 }));
  return true;
}

export function setPaused(p: boolean): void {
  const s = useNativeMatch.getState();
  if (!s.sim || s.paused === p) return;
  if (p) pausedAt = Date.now();
  else startedAt += Date.now() - pausedAt;
  useNativeMatch.setState({ paused: p });
}

/** Leaving counts as a loss, like the web forfeit. */
export function forfeit(): void {
  const { sim, perspective } = useNativeMatch.getState();
  if (!sim || sim.phase === 'ended') return;
  forfeited = true;
  sim.phase = 'ended';
  sim.winner = (1 - perspective) as 0 | 1;
  finish(sim);
}

export function teardown(): void {
  stop();
  onEnd = null;
  useNativeMatch.setState({ sim: null, result: null, paused: false });
}
