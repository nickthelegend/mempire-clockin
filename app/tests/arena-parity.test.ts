// @vitest-environment happy-dom
/**
 * Parity: the native app's match store (mobile/src/arena/match.ts) and the web
 * client's match store (src/state/match.ts) must play the same match the same
 * way. Same seed, same decks, same scripted deploys at the same ticks, bot on
 * the other seat — both run their real timer-driven loops under fake timers,
 * and the final states must agree tick for tick.
 *
 *   cd app && npx vitest run tests/arena-parity.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import roster from '../../mobile/src/data/roster.json';
import { hashState } from '../src/sim/engine';
import { fp } from '../src/sim/fixed';
import type { MatchCard, SimState } from '../src/sim/types';

// The web store pulls in browser-extension wallet adapters it never uses in a
// bot match; their ESM build does not load under Node, so they are stubbed.
vi.mock('@solana/wallet-adapter-wallets', () => {
  class Stub { name = 'stub'; icon = ''; url = ''; readyState = 'Unsupported'; on() {} }
  return {
    PhantomWalletAdapter: Stub, SolflareWalletAdapter: Stub, CoinbaseWalletAdapter: Stub,
    TrustWalletAdapter: Stub, NightlyWalletAdapter: Stub,
  };
});

const R = roster as { ticker: string; mint: string }[];
const cards = (offset: number, level: number) => R.slice(offset, offset + 8)
  .map((c) => ({ mint: c.mint, ticker: c.ticker, level }));

interface Outcome { winner: number; ticks: number; towers: number[]; maxHp: number[]; hash: number; units: number }
const snapshot = (sim: SimState): Outcome => ({
  winner: sim.winner, ticks: sim.tick, towers: sim.towers.map((t) => t.hp), maxHp: sim.towers.map((t) => t.maxHp),
  hash: hashState(sim) >>> 0,
  units: sim.nextUnitId,
});

/** Deploys at fixed ticks; the card is whatever sits first in the hand then. */
const SCRIPT = [
  { tick: 10, x: 4.5, y: 9 },
  { tick: 60, x: 13.5, y: 9 },
  { tick: 140, x: 4.5, y: 12 },
  { tick: 220, x: 9, y: 6 },
  { tick: 320, x: 13.5, y: 13 },
  { tick: 450, x: 4.5, y: 10 },
];

async function runWeb(seed: number, rush: boolean, player: MatchCard[], bot: MatchCard[]): Promise<Outcome> {
  const { useMatch, startNativeMatch } = await import('../src/state/match');
  expect(startNativeMatch(player, bot, { tier: 1, opponent: 'Parity (AI)', rush, seed })).toBeNull();
  let guard = 0;
  while (useMatch.getState().status !== 'battle' && guard++ < 400) vi.advanceTimersByTime(25);
  expect(useMatch.getState().status).toBe('battle');
  const done = new Set<number>();
  for (let i = 0; i < 200_000; i++) {
    const { sim, status } = useMatch.getState();
    if (!sim || status === 'settled' || sim.phase === 'ended') break;
    for (const s of SCRIPT) {
      if (!done.has(s.tick) && sim.tick === s.tick) {
        done.add(s.tick);
        useMatch.getState().playCard(sim.players[0].cycle[0], fp(s.x), fp(s.y));
      }
    }
    vi.advanceTimersByTime(25);
  }
  return snapshot(useMatch.getState().sim!);
}

async function runNative(seed: number, rush: boolean, player: MatchCard[], bot: MatchCard[]): Promise<Outcome> {
  const native = await import('../../mobile/src/arena/match');
  let ended = false;
  native.startNativeArena({ player, bot, tier: 1, rush, seed, onEnd: () => { ended = true; } });
  const done = new Set<number>();
  for (let i = 0; i < 200_000 && !ended; i++) {
    const sim = native.useNativeMatch.getState().sim!;
    for (const s of SCRIPT) {
      if (!done.has(s.tick) && sim.tick === s.tick) {
        done.add(s.tick);
        native.playCard(sim.players[0].cycle[0], fp(s.x), fp(s.y));
      }
    }
    vi.advanceTimersByTime(25);
  }
  expect(ended).toBe(true);
  return snapshot(native.useNativeMatch.getState().sim!);
}

describe('native arena store vs web match store', () => {
  afterEach(() => { vi.useRealTimers(); });

  for (const [label, rush, seed] of [['rush', true, 0xc10c4], ['standard', false, 0x5eed1]] as const) {
    it(`plays the same ${label} match (seed ${seed.toString(16)})`, async () => {
      vi.useFakeTimers({ now: 1_791_000_000_000 });
      const { toMatchCard } = await import('../../mobile/src/arena/match');
      const player = cards(0, 3).map(toMatchCard);
      const bot = cards(8, 3).map(toMatchCard);
      const web = await runWeb(seed, rush, player, bot);
      const nat = await runNative(seed, rush, player, bot);
      expect(web.ticks).toBeGreaterThan(rush ? 500 : 3000);
      expect(nat).toEqual(web);
      // The script really played: units spawned and towers took damage.
      expect(web.units).toBeGreaterThan(SCRIPT.length);
      expect(web.towers.some((hp, i) => hp < web.maxHp[i])).toBe(true);
      console.log(`${label}: winner ${web.winner}, ${web.ticks} ticks, towers ${web.towers.join('/')}, hash ${web.hash.toString(16)}`);
    }, 120_000);
  }
});
