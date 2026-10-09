/**
 * Provably fair chests (mobile/src/chain/fair.ts): the roll is a pure
 * function of (blockhash, chestId, owner, collection), and it uses the same
 * drop table and mapping as the CSPRNG path, so the odds are unchanged.
 *
 *   cd app && npx vitest run tests/fair-chest.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { FORMULA, SLOT_DELAY, rollSeed, seededRand, toHex } from '../../mobile/src/chain/fair';
import { CHESTS, ROSTER, rollChest, winChestTier, type OwnedCard } from '../../mobile/src/game/rules';

const owner = Keypair.fromSeed(new Uint8Array(32).fill(5)).publicKey.toBase58();
const BH = '8TMRQiLZ2Cxc4rTYc5VdSTBv8KYSVeSfFWk7SbZUw6Ae'; // any 32-byte base58 blockhash
const owned: Record<string, OwnedCard> = Object.fromEntries(['ETH', 'WIF', 'BTC', 'DOGE', 'SOL', 'BONK', 'POPCAT', 'GOAT'].map((t) => [t, { level: 1, copies: 0 }]));

afterEach(() => { vi.restoreAllMocks(); });

describe('slot-hash roll', () => {
  it('commits 32 slots ahead and documents the formula', () => {
    expect(SLOT_DELAY).toBe(32);
    expect(FORMULA).toMatch(/sha256\(blockhash ‖ chestId ‖ owner\)/);
  });

  it('seed = sha256(blockhash bytes ‖ chestId ‖ owner bytes), independently recomputed', () => {
    const bs58bytes = (s: string) => Buffer.from(new PublicKey(s).toBytes());
    const expected = createHash('sha256').update(Buffer.concat([bs58bytes(BH), Buffer.from('chest_7'), bs58bytes(owner)])).digest('hex');
    expect(toHex(rollSeed(BH, 'chest_7', owner))).toBe(expected);
  });

  it('is deterministic: same inputs, same drops; any input changed, different seed', () => {
    const a = rollChest('golden', owned, seededRand(rollSeed(BH, 'chest_7', owner)));
    const b = rollChest('golden', owned, seededRand(rollSeed(BH, 'chest_7', owner)));
    expect(a).toEqual(b);
    expect(a).toHaveLength(CHESTS.golden.cards);
    expect(a[0].fresh).toBe(true); // first card is a new fighter, as before
    const seeds = new Set([
      toHex(rollSeed(BH, 'chest_7', owner)),
      toHex(rollSeed(BH, 'chest_8', owner)),
      toHex(rollSeed(BH, 'chest_7', Keypair.generate().publicKey.toBase58())),
      toHex(rollSeed('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi', 'chest_7', owner)),
    ]);
    expect(seeds.size).toBe(4);
  });

  it('the stream is counter-mode sha256 words (as documented)', () => {
    const seed = rollSeed(BH, 'chest_7', owner);
    const r = seededRand(seed);
    const words = Array.from({ length: 9 }, () => r());
    const h0 = createHash('sha256').update(Buffer.concat([Buffer.from(seed), Buffer.from([0, 0, 0, 0])])).digest();
    const h1 = createHash('sha256').update(Buffer.concat([Buffer.from(seed), Buffer.from([1, 0, 0, 0])])).digest();
    expect(words.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, i) => h0.readUInt32LE(i * 4)));
    expect(words[8]).toBe(h1.readUInt32LE(0));
  });
});

describe('same table, same odds', () => {
  it('maps a random stream exactly like the CSPRNG path (same function, same draws)', () => {
    const seq = Array.from({ length: 64 }, (_, i) => (i * 2654435761) >>> 0);
    let k = 0;
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: Uint32Array) => { a[0] = seq[k++]; return a; }) as never);
    const viaCsprng = rollChest('magic', owned);
    let j = 0;
    const viaStream = rollChest('magic', owned, () => seq[j++]);
    expect(viaStream).toEqual(viaCsprng);
    expect(j).toBe(k);
  });

  it('over 4000 slot-hash rolls: card counts, copy ranges and new-fighter rate match the table', () => {
    const counts: Record<number, number> = {};
    let freshFirst = 0; let n = 0;
    for (let i = 0; i < 4000; i++) {
      const bh = Keypair.fromSeed(createHash('sha256').update(`bh${i}`).digest()).publicKey.toBase58();
      const d = rollChest('golden', owned, seededRand(rollSeed(bh, `chest_${i}`, owner)));
      expect(d).toHaveLength(CHESTS.golden.cards);
      expect(new Set(d.map((x) => x.ticker)).size).toBe(d.length);
      if (d[0].fresh) freshFirst += 1;
      for (const x of d) { counts[x.copies] = (counts[x.copies] ?? 0) + 1; n += 1; }
    }
    const [lo, hi] = CHESTS.golden.copies;
    expect(Object.keys(counts).map(Number).sort()).toEqual(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
    for (let c = lo; c <= hi; c++) expect(Math.abs(counts[c] / n - 1 / (hi - lo + 1))).toBeLessThan(0.02); // uniform copies
    expect(freshFirst).toBe(4000); // the first card is always a new fighter when one exists
    expect(ROSTER.length).toBeGreaterThan(8);
  }, 30_000); // 4000 sha256-driven rolls: CPU-bound, slow when the suite runs in parallel

  it('the win-chest tier table is untouched (3 / 9 / 26 / 62 %)', () => {
    let k = 0;
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: Uint32Array) => { a[0] = k++; return a; }) as never);
    const tally: Record<string, number> = {};
    for (let i = 0; i < 100; i++) { const t = winChestTier(); tally[t] = (tally[t] ?? 0) + 1; }
    expect(tally).toEqual({ legendary: 3, magic: 9, golden: 26, silver: 62 });
  });
});
