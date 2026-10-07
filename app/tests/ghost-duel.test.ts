/**
 * Ghost Duels (mobile/src/game/duel.ts): payload encode/decode, memo parsing,
 * and the core claim — a live duel against a replayed ghost ends in exactly
 * the state a later re-simulation produces (same winner, same state hash).
 *
 *   cd app && npx vitest run tests/ghost-duel.test.ts
 */
import { describe, expect, it } from 'vitest';
import { createMatch, hashState, stepSim } from '../src/sim/engine';
import { decideBot, type BotDifficulty } from '../src/sim/bot';
import { FORMATS, INPUT_DELAY_TICKS, type InputEvent, type SimState } from '../src/sim/types';
import {
  MAX_PAYLOAD_CHARS, acceptMemo, challengeMemo, commitHex, dataMemo, decodeDuel, encodeDuel, fromB64url,
  ghostInputs, openChallenge, parseDuelMemos, replayDuel, resultMemo, toB64url, toCard, verifyResult,
  winnerCode, type DuelPayload,
} from '../../mobile/src/game/duel';

const DECK_A = ['ETH', 'WIF', 'BTC', 'DOGE', 'SOL', 'BONK', 'POPCAT', 'GOAT'];
const DECK_B = ['SHIB', 'PEPE', 'MEW', 'BRETT', 'DOGE', 'BONK', 'WIF', 'SOL'];
const deck = (ts: string[], level = 3) => ts.map((ticker) => ({ ticker, level }));
const SIG = '5E7Y8Wg7gLkLU2HmAXeoSkZpqpuQ8JeLB9ehRV1AtXK1iBxa5pNxvEHjoGEX6t1KMnNRZbeoEgiCmxGTTuQ7vas4';

/**
 * Play a match the way the native arena loop does (match.ts stepOne): each
 * tick, live deciders queue events for tick+delay, scripted events are
 * pre-scheduled, then stepSim runs that tick's events. Returns what each live
 * seat queued (its recording) and the final state.
 */
function play(seed: number, rush: boolean, decks: [string[], string[]], seats: {
  0: { bot?: BotDifficulty; script?: InputEvent[] }; 1: { bot?: BotDifficulty; script?: InputEvent[] };
}): { sim: SimState; rec: [InputEvent[], InputEvent[]] } {
  const sim = createMatch(seed, [deck(decks[0]).map(toCard), deck(decks[1]).map(toCard)], FORMATS[rush ? 'rush' : 'standard']);
  const pending = new Map<number, InputEvent[]>();
  const push = (e: InputEvent) => { const l = pending.get(e.tick) ?? []; l.push(e); pending.set(e.tick, l); };
  for (const s of [0, 1] as const) for (const e of seats[s].script ?? []) push(e);
  const rec: [InputEvent[], InputEvent[]] = [[], []];
  let guard = 0;
  while (sim.phase !== 'ended' && guard++ < 10_000) {
    for (const s of [0, 1] as const) {
      const d = seats[s].bot;
      if (!d) continue;
      const ev = decideBot(sim, s, d);
      if (ev) { expect(ev.tick).toBe(sim.tick + INPUT_DELAY_TICKS); push(ev); rec[s].push(ev); }
    }
    stepSim(sim, pending.get(sim.tick) ?? []);
    pending.delete(sim.tick - 1);
  }
  return { sim, rec };
}

const asPayload = (seed: number, rush: boolean, ts: string[], evs: InputEvent[]): DuelPayload =>
  ({ seed, rush, deck: deck(ts), inputs: evs.map(({ tick, deckIndex, x, y }) => ({ tick, deckIndex, x, y })) });

describe('duel payload', () => {
  it('round-trips through bytes and base64url, compactly', () => {
    const { rec } = play(0xc10c4, true, [DECK_A, DECK_B], { 0: { bot: 'hard' }, 1: { bot: 'normal' } });
    const p = asPayload(0xc10c4, true, DECK_A, rec[0]);
    const bytes = encodeDuel(p);
    expect(decodeDuel(bytes)).toEqual({ ...p, inputs: [...p.inputs].sort((a, b) => a.tick - b.tick) });
    const b64 = toB64url(bytes);
    expect(b64).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Array.from(fromB64url(b64))).toEqual(Array.from(bytes));
    expect(b64.length).toBeLessThan(MAX_PAYLOAD_CHARS);
  });

  it('a full 3-minute hard-bot match still fits one memo', () => {
    const { rec } = play(0x5eed1, false, [DECK_A, DECK_B], { 0: { bot: 'hard' }, 1: { bot: 'hard' } });
    const b64 = toB64url(encodeDuel(asPayload(0x5eed1, false, DECK_A, rec[0])));
    expect(rec[0].length).toBeGreaterThan(20);
    expect(b64.length).toBeLessThan(MAX_PAYLOAD_CHARS);
  });

  it('rejects malformed, truncated or out-of-range payloads', () => {
    const good = encodeDuel(asPayload(1, true, DECK_A, [{ tick: 10, player: 0, deckIndex: 1, x: 5000, y: 4000 }]));
    expect(() => decodeDuel(good.slice(0, good.length - 1))).toThrow(/truncated/);
    expect(() => decodeDuel(Uint8Array.from([...good, 0]))).toThrow(/trailing/);
    const v2 = good.slice(); v2[0] = 2;
    expect(() => decodeDuel(v2)).toThrow(/version/);
    expect(() => encodeDuel(asPayload(1, true, DECK_A.slice(0, 7), []))).toThrow(/8 cards/);
    expect(() => decodeDuel(encodeDuel(asPayload(1, true, DECK_A, [{ tick: 1, player: 0, deckIndex: 0, x: 999_999, y: 1 }])))).toThrow(/range/);
    expect(() => fromB64url('ab+/')).toThrow(/base64url/);
  });
});

describe('duel memos', () => {
  it('formats and parses challenge (+data), result and accept memos', () => {
    const bytes = encodeDuel(asPayload(77, true, DECK_A, []));
    const b64 = toB64url(bytes);
    const rpc = `[${challengeMemo(bytes, 77).length}] ${challengeMemo(bytes, 77)}; [9] ${dataMemo(b64)}`;
    expect(parseDuelMemos(rpc)).toEqual({ kind: 'challenge', commit: commitHex(bytes), seed: 77, data: b64 });
    expect(parseDuelMemos(`${resultMemo(SIG, 'o', 0xdeadbeef)}; ${dataMemo(b64)}`))
      .toEqual({ kind: 'result', challengeSig: SIG, winner: 'o', stateHash: 0xdeadbeef, data: b64 });
    expect(parseDuelMemos(acceptMemo(SIG))).toEqual({ kind: 'accept', challengeSig: SIG });
    expect(parseDuelMemos('mempire:clockin:v1:day=20261008:streak=1')).toBeNull();
  });

  it('the challenge payload must match its on-chain commitment and seed', () => {
    const bytes = encodeDuel(asPayload(77, true, DECK_A, [{ tick: 9, player: 0, deckIndex: 2, x: 3000, y: 3000 }]));
    const m = { commit: commitHex(bytes), seed: 77 };
    expect(openChallenge(m, toB64url(bytes)).inputs).toHaveLength(1);
    const forged = encodeDuel(asPayload(77, true, DECK_A, [{ tick: 9, player: 0, deckIndex: 2, x: 3001, y: 3000 }]));
    expect(() => openChallenge(m, toB64url(forged))).toThrow(/commitment/);
    expect(() => openChallenge({ ...m, seed: 78 }, toB64url(bytes))).toThrow(/seed/);
  });
});

describe('ghost replay determinism', () => {
  for (const [name, seed, rush, ghostBot, oppBot] of [
    ['rush, hard ghost vs normal', 0xc10c4, true, 'hard', 'normal'],
    ['rush, easy ghost vs hard', 0xabcdef, true, 'easy', 'hard'],
    ['standard, normal ghost vs hard', 0x5eed1, false, 'normal', 'hard'],
  ] as const) {
    it(`live duel == re-simulation (${name})`, () => {
      // 1. The challenger plays the AI; their seat-0 deploys are the ghost.
      const original = play(seed, rush, [DECK_A, DECK_B], { 0: { bot: ghostBot }, 1: { bot: 'normal' } });
      const challenger = decodeDuel(encodeDuel(asPayload(seed, rush, DECK_A, original.rec[0])));
      // 2. The opponent plays seat 1 live against the replayed ghost.
      const live = play(seed, rush, [DECK_A, DECK_B], { 0: { script: ghostInputs(challenger, 0) }, 1: { bot: oppBot } });
      const opponent = decodeDuel(encodeDuel(asPayload(seed, rush, DECK_B, live.rec[1])));
      // 3. Anyone re-simulates from the two payloads: identical end state.
      const re = replayDuel(challenger, opponent);
      expect(re.stateHash).toBe(hashState(live.sim) >>> 0);
      expect(re.winner).toBe(live.sim.winner);
      expect(re.ticks).toBe(live.sim.tick);
      expect(verifyResult(challenger, opponent, { winner: winnerCode(live.sim.winner as 0 | 1 | -2), stateHash: hashState(live.sim) }).ok).toBe(true);
      // a lie about the winner or the hash is caught
      expect(verifyResult(challenger, opponent, { winner: live.sim.winner === 0 ? 'o' : 'c', stateHash: hashState(live.sim) }).ok).toBe(false);
      expect(verifyResult(challenger, opponent, { winner: winnerCode(live.sim.winner as 0 | 1 | -2), stateHash: (hashState(live.sim) ^ 1) >>> 0 }).ok).toBe(false);
    });
  }

  it("the ghost's deploys stay valid against any opponent (own elixir and hand only)", () => {
    const seed = 0x1234;
    const original = play(seed, true, [DECK_A, DECK_B], { 0: { bot: 'hard' }, 1: { bot: 'easy' } });
    const ghost = ghostInputs(asPayload(seed, true, DECK_A, original.rec[0]), 0);
    const spent = (s: SimState) => s.nextUnitId;
    // replay the ghost against two very different opponents and track seat 0's hand cycle
    const cycles = (['easy', 'hard'] as const).map((d) => {
      const sim = createMatch(seed, [deck(DECK_A).map(toCard), deck(DECK_B).map(toCard)], FORMATS.rush);
      const p = new Map<number, InputEvent[]>();
      for (const e of ghost) { const l = p.get(e.tick) ?? []; l.push(e); p.set(e.tick, l); }
      const seen: string[] = [];
      while (sim.phase !== 'ended') {
        const ev = decideBot(sim, 1, d);
        if (ev) { const l = p.get(ev.tick) ?? []; l.push(ev); p.set(ev.tick, l); }
        stepSim(sim, p.get(sim.tick) ?? []);
        seen.push(sim.players[0].cycle.join(''));
      }
      return { seen, units: spent(sim) };
    });
    const n = Math.min(cycles[0].seen.length, cycles[1].seen.length);
    expect(cycles[0].seen.slice(0, n)).toEqual(cycles[1].seen.slice(0, n));
  });

  it('refuses to replay payloads from different duels', () => {
    expect(() => replayDuel(asPayload(1, true, DECK_A, []), asPayload(2, true, DECK_B, []))).toThrow(/same duel/);
  });
});
