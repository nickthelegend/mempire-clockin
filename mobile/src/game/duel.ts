import { sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer';
import { ARENA_H, ARENA_W, createMatch, hashState, stepSim } from '../../../app/src/sim/engine';
import { archetypeForMint } from '../../../app/src/sim/archetypes';
import { traitForMint } from '../../../app/src/sim/traits';
import { DECK_SIZE, FORMATS, type InputEvent, type MatchCard } from '../../../app/src/sim/types';
import { BY_TICKER } from './rules';

/**
 * Ghost Duels: asynchronous PvP over the deterministic sim.
 *
 * A match is fully determined by (seed, format, both decks, both input logs),
 * so a player's match can be replayed as a "ghost" that someone else fights
 * later. Pure: no React Native, no RPC — unit-tested in Node.
 *
 *  - The challenger's payload is their deck + their timed deploys (seat 0).
 *  - The opponent plays seat 1 against that replay on the same seed: seat 0's
 *    hand cycle and elixir depend only on the seed and seat 0's own plays, so
 *    the ghost's deploys stay valid whatever the opponent does.
 *  - The result names a winner and the final state hash. Anyone holding both
 *    payloads re-simulates and must get the identical hash (`replayDuel`).
 *
 * Wire format (then base64url, no padding):
 *   u8 version=1 · u8 flags (bit0 = rush) · u32le seed
 *   8 × ( u8 len · ascii ticker · u8 level )
 *   varint n · n × ( varint Δtick · u8 deckIndex · varint x · varint y )
 */
export const DUEL_VERSION = 1;
export const MAX_INPUTS = 160;
/** Payload text that still fits one memo next to the commit, with headroom for wallet-injected instructions. */
export const MAX_PAYLOAD_CHARS = 720;

export interface DuelCard { ticker: string; level: number }
export interface DuelPayload {
  seed: number;
  rush: boolean;
  deck: DuelCard[];
  /** this player's deploys; `player` is implied by the seat */
  inputs: { tick: number; deckIndex: number; x: number; y: number }[];
}

// ── varints & base64url ─────────────────────────────────────────────────────

function putVarint(out: number[], v: number): void {
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new Error(`varint out of range: ${v}`);
  let x = v;
  while (x >= 0x80) { out.push((x & 0x7f) | 0x80); x = Math.floor(x / 128); }
  out.push(x);
}

class Reader {
  private o = 0;
  constructor(private b: Uint8Array) {}
  u8(): number { if (this.o >= this.b.length) throw new Error('truncated payload'); return this.b[this.o++]; }
  u32(): number { let v = 0; for (let i = 0; i < 4; i++) v += this.u8() * 2 ** (8 * i); return v; }
  varint(): number {
    let v = 0; let mul = 1;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      v += (b & 0x7f) * mul;
      if (!(b & 0x80)) return v;
      mul *= 128;
    }
    throw new Error('varint too long');
  }
  done(): boolean { return this.o === this.b.length; }
}

export const toB64url = (b: Uint8Array) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  return Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
};

// ── encode / decode ─────────────────────────────────────────────────────────

export function encodeDuel(p: DuelPayload): Uint8Array {
  if (p.deck.length !== DECK_SIZE) throw new Error('a duel deck has 8 cards');
  if (p.inputs.length > MAX_INPUTS) throw new Error(`too many deploys to share (${p.inputs.length})`);
  const out: number[] = [DUEL_VERSION, p.rush ? 1 : 0];
  const s = p.seed >>> 0;
  for (let i = 0; i < 4; i++) out.push(Math.floor(s / 2 ** (8 * i)) & 0xff);
  for (const c of p.deck) {
    if (!/^[A-Z0-9]{1,12}$/.test(c.ticker)) throw new Error(`bad ticker ${c.ticker}`);
    out.push(c.ticker.length, ...Array.from(c.ticker, (ch) => ch.charCodeAt(0)), Math.max(1, Math.min(10, Math.round(c.level))));
  }
  const inputs = [...p.inputs].sort((a, b) => a.tick - b.tick);
  putVarint(out, inputs.length);
  let prev = 0;
  for (const ev of inputs) {
    putVarint(out, ev.tick - prev);
    prev = ev.tick;
    if (ev.deckIndex < 0 || ev.deckIndex >= DECK_SIZE) throw new Error('bad deck index');
    out.push(ev.deckIndex);
    putVarint(out, ev.x);
    putVarint(out, ev.y);
  }
  return Uint8Array.from(out);
}

export function decodeDuel(bytes: Uint8Array): DuelPayload {
  const r = new Reader(bytes);
  if (r.u8() !== DUEL_VERSION) throw new Error('unknown duel version');
  const flags = r.u8();
  const seed = r.u32();
  const deck: DuelCard[] = [];
  for (let i = 0; i < DECK_SIZE; i++) {
    const len = r.u8();
    if (len < 1 || len > 12) throw new Error('bad ticker length');
    let t = '';
    for (let k = 0; k < len; k++) t += String.fromCharCode(r.u8());
    if (!/^[A-Z0-9]+$/.test(t)) throw new Error('bad ticker');
    const level = r.u8();
    if (level < 1 || level > 10) throw new Error('bad level');
    deck.push({ ticker: t, level });
  }
  const n = r.varint();
  if (n > MAX_INPUTS) throw new Error('too many inputs');
  const inputs: DuelPayload['inputs'] = [];
  let tick = 0;
  for (let i = 0; i < n; i++) {
    tick += r.varint();
    const deckIndex = r.u8();
    const x = r.varint();
    const y = r.varint();
    if (deckIndex >= DECK_SIZE || x > ARENA_W || y > ARENA_H) throw new Error('input out of range');
    inputs.push({ tick, deckIndex, x, y });
  }
  if (!r.done()) throw new Error('trailing bytes');
  return { seed, rush: (flags & 1) === 1, deck, inputs };
}

export const commitHex = (bytes: Uint8Array) => Buffer.from(sha256(bytes)).toString('hex');

// ── memos ───────────────────────────────────────────────────────────────────

export const challengeMemo = (bytes: Uint8Array, seed: number) => `mempire:duel:v1:${commitHex(bytes)}:${seed >>> 0}`;
export const dataMemo = (b64: string) => `mempire:duel-data:v1:${b64}`;
export type DuelWinner = 'c' | 'o' | 'd';
export const resultMemo = (challengeSig: string, winner: DuelWinner, stateHash: number) =>
  `mempire:duel-result:v1:${challengeSig}:${winner}:${(stateHash >>> 0).toString(16).padStart(8, '0')}`;
export const acceptMemo = (challengeSig: string) => `mempire:duel-accept:v1:${challengeSig}`;

const SIG = '[1-9A-HJ-NP-Za-km-z]{64,90}';
export type DuelMemo =
  | { kind: 'challenge'; commit: string; seed: number; data?: string }
  | { kind: 'result'; challengeSig: string; winner: DuelWinner; stateHash: number; data?: string }
  | { kind: 'accept'; challengeSig: string };

/** Parse the memos of one transaction (raw texts, or the RPC's "[n] a; [n] b"). */
export function parseDuelMemos(memo: string): DuelMemo | null {
  const data = /mempire:duel-data:v1:([A-Za-z0-9_-]+)/.exec(memo)?.[1];
  const c = /mempire:duel:v1:([0-9a-f]{64}):(\d{1,10})(?![\w:])/.exec(memo);
  if (c) return { kind: 'challenge', commit: c[1], seed: Number(c[2]), data };
  const r = new RegExp(`mempire:duel-result:v1:(${SIG}):([cod]):([0-9a-f]{8})`).exec(memo);
  if (r) return { kind: 'result', challengeSig: r[1], winner: r[2] as DuelWinner, stateHash: parseInt(r[3], 16), data };
  const a = new RegExp(`mempire:duel-accept:v1:(${SIG})`).exec(memo);
  if (a) return { kind: 'accept', challengeSig: a[1] };
  return null;
}

/** A challenge's payload, only if it matches its on-chain commitment. */
export function openChallenge(m: { commit: string; seed: number }, b64: string): DuelPayload {
  const bytes = fromB64url(b64);
  if (commitHex(bytes) !== m.commit) throw new Error('payload does not match the on-chain commitment');
  const p = decodeDuel(bytes);
  if ((p.seed >>> 0) !== (m.seed >>> 0)) throw new Error('seed mismatch');
  return p;
}

// ── replay ──────────────────────────────────────────────────────────────────

export function toCard(c: DuelCard): MatchCard {
  const f = BY_TICKER.get(c.ticker);
  if (!f) throw new Error(`unknown fighter ${c.ticker}`);
  return { coinId: f.mint, name: f.ticker, archetype: archetypeForMint(f.mint), trait: traitForMint(f.mint), level: c.level };
}

export const ghostInputs = (p: DuelPayload, player: 0 | 1): InputEvent[] =>
  p.inputs.map((e) => ({ tick: e.tick, player, deckIndex: e.deckIndex, x: e.x, y: e.y }));

export interface Replay { winner: 0 | 1 | -2; stateHash: number; ticks: number }

/**
 * Re-simulate a duel: challenger (seat 0, the ghost) vs opponent (seat 1).
 * Exactly what the live arena does: createMatch, then stepSim with the events
 * scheduled for each tick, until the match ends.
 */
export function replayDuel(challenger: DuelPayload, opponent: DuelPayload): Replay {
  if (opponent.seed >>> 0 !== challenger.seed >>> 0 || opponent.rush !== challenger.rush) throw new Error('payloads are not the same duel');
  const format = FORMATS[challenger.rush ? 'rush' : 'standard'];
  const sim = createMatch(challenger.seed >>> 0, [challenger.deck.map(toCard), opponent.deck.map(toCard)], format);
  const byTick = new Map<number, InputEvent[]>();
  for (const e of [...ghostInputs(challenger, 0), ...ghostInputs(opponent, 1)]) {
    const l = byTick.get(e.tick) ?? [];
    l.push(e);
    byTick.set(e.tick, l);
  }
  const limit = format.regulationTicks + format.overtimeTicks + 2;
  while (sim.phase !== 'ended' && sim.tick <= limit) stepSim(sim, byTick.get(sim.tick) ?? []);
  if (sim.phase !== 'ended') throw new Error('replay did not end');
  return { winner: sim.winner as 0 | 1 | -2, stateHash: hashState(sim) >>> 0, ticks: sim.tick };
}

export const winnerCode = (w: 0 | 1 | -2): DuelWinner => (w === 0 ? 'c' : w === 1 ? 'o' : 'd');

/** Does a posted result match the replay of both payloads? */
export function verifyResult(challenger: DuelPayload, opponent: DuelPayload, claimed: { winner: DuelWinner; stateHash: number }): { ok: boolean; replay: Replay } {
  const replay = replayDuel(challenger, opponent);
  return { ok: winnerCode(replay.winner) === claimed.winner && replay.stateHash === (claimed.stateHash >>> 0), replay };
}
