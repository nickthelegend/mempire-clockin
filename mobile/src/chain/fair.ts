import { sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer';
import { PublicKey, type Connection } from '@solana/web3.js';

/**
 * Provably fair chests, verifiable with Solana slot hashes (not VRF).
 *
 *  1. Commit, when the chest is earned: `{ chestId, targetSlot = current + 32 }`.
 *     Slot `targetSlot` is ~13 s in the future, so nobody — the app, the
 *     player, us — knows its blockhash yet.
 *  2. Open: take the blockhash of the first block at or after `targetSlot`
 *     (a slot can be skipped; the rule picks the next produced one).
 *  3. seed = sha256( blockhash(32 bytes) ‖ utf8(chestId) ‖ owner(32 bytes) )
 *     and the drops come from the SAME table and mapping as before
 *     (`rollChest`), fed by a counter-mode stream:
 *     word k = little-endian u32 #(k mod 8) of sha256(seed ‖ u32le(⌊k/8⌋)).
 *  Anyone can re-fetch that slot's blockhash and recompute the drops; the
 *  reveal sheet does exactly that with "Recompute".
 *
 * Honest limits: the commit lives on the device, so this proves the result
 * was fixed by a blockhash nobody could know at commit time — it is not a VRF,
 * and a block producer at that exact slot could in principle grind it (for a
 * cosmetic card pull, not worth it).
 */
export const SLOT_DELAY = 32;
export const FAIR_LABEL = 'verifiable with Solana slot hashes (not VRF)';
export const FORMULA = 'seed = sha256(blockhash ‖ chestId ‖ owner); word k = u32le #(k mod 8) of sha256(seed ‖ u32le(k div 8))';

export interface ChestCommit {
  chestId: string;
  committedSlot: number;
  targetSlot: number;
  /** ms since epoch, device clock */
  at: number;
}

export interface ChestProof {
  chestId: string;
  owner: string;
  targetSlot: number;
  /** the produced slot actually used (>= targetSlot) */
  slot: number;
  blockhash: string;
  seedHex: string;
  /** owned tickers when it was opened (the roll draws unowned fighters first) */
  owned: string[];
}

export const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** The 32 raw bytes of a base58 blockhash or address. */
const b58bytes = (s: string) => new PublicKey(s).toBytes();

export function rollSeed(blockhash: string, chestId: string, owner: string): Uint8Array {
  return sha256(Uint8Array.from(Buffer.concat([
    Buffer.from(b58bytes(blockhash)), Buffer.from(chestId, 'utf8'), Buffer.from(b58bytes(owner)),
  ])));
}

/** A deterministic uniform u32 stream from a seed (see FORMULA). */
export function seededRand(seed: Uint8Array): () => number {
  let block = 0;
  let words: number[] = [];
  return () => {
    if (!words.length) {
      const ctr = Buffer.alloc(4);
      ctr.writeUInt32LE(block++, 0);
      const h = Buffer.from(sha256(Uint8Array.from(Buffer.concat([Buffer.from(seed), ctr]))));
      words = Array.from({ length: 8 }, (_, i) => h.readUInt32LE(i * 4));
    }
    return words.shift()!;
  };
}

export async function commitChest(conn: Connection, chestId: string): Promise<ChestCommit | null> {
  try {
    const slot = await conn.getSlot('confirmed');
    return { chestId, committedSlot: slot, targetSlot: slot + SLOT_DELAY, at: Date.now() };
  } catch {
    return null; // offline: this chest opens with the device CSPRNG and says so
  }
}

/** Blockhash of `slot`, or null when it was skipped / not available. */
export async function fetchBlockhash(conn: Connection, slot: number): Promise<string | null> {
  try {
    const b = await conn.getBlock(slot, {
      commitment: 'confirmed', maxSupportedTransactionVersion: 0, transactionDetails: 'none', rewards: false,
    });
    return b?.blockhash ?? null;
  } catch {
    return null;
  }
}

/**
 * Wait for the target slot (bounded), then find the first produced block at
 * or after it and return its slot and blockhash.
 */
export async function resolveChest(
  conn: Connection, c: ChestCommit, opts: { timeoutMs?: number; onWait?: (slotsLeft: number) => void } = {},
): Promise<{ slot: number; blockhash: string } | null> {
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
  let cur = 0;
  for (;;) {
    try { cur = await conn.getSlot('confirmed'); } catch { /* retry */ }
    if (cur >= c.targetSlot) break;
    opts.onWait?.(c.targetSlot - cur);
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 800));
  }
  let produced: number[] = [];
  try { produced = await conn.getBlocks(c.targetSlot, Math.min(cur, c.targetSlot + 100), 'confirmed'); } catch { produced = []; }
  for (const s of produced.length ? produced : [c.targetSlot]) {
    const blockhash = await fetchBlockhash(conn, s);
    if (blockhash) return { slot: s, blockhash };
  }
  return null;
}

/** Recompute a proof from the chain: same blockhash at that slot, same seed. */
export async function verifyProof(conn: Connection, p: ChestProof): Promise<{ ok: boolean; blockhash: string | null; seedHex: string | null }> {
  const blockhash = await fetchBlockhash(conn, p.slot);
  if (!blockhash) return { ok: false, blockhash: null, seedHex: null };
  // the slot used must be the FIRST produced block at or after the target
  let first = p.slot;
  try { first = (await conn.getBlocks(p.targetSlot, p.slot, 'confirmed'))[0] ?? p.slot; } catch { /* keep */ }
  const seedHex = toHex(rollSeed(blockhash, p.chestId, p.owner));
  return { ok: blockhash === p.blockhash && seedHex === p.seedHex && p.slot >= p.targetSlot && first === p.slot, blockhash, seedHex };
}
