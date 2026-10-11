import { sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer';
import { PublicKey, type Connection } from '@solana/web3.js';
import { memoTexts } from './refs';
import { readSessionRecord } from './clockin';
import { readSessionLedger } from './session';

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
  /** The on-chain commit memo, when posted (session key, or batched into an owner signature). */
  commitSig?: string;
  /** Slot the commit transaction landed in; must be before targetSlot. */
  commitTxSlot?: number;
}

// ── on-chain commit memo ────────────────────────────────────────────────────

/**
 * `mempire:chest-commit:v1:<chestId>:<targetSlot>:owner=<owner>` — the commit
 * published before the target block exists. Signed by the owner, or silently
 * by the owner's session key.
 */
export const CHEST_COMMIT_PREFIX = 'mempire:chest-commit:v1';
export const chestCommitText = (chestId: string, targetSlot: number, owner: string) =>
  `${CHEST_COMMIT_PREFIX}:${chestId}:${targetSlot}:owner=${owner}`;
const COMMIT_RE = /^mempire:chest-commit:v1:([A-Za-z0-9_]{1,40}):(\d{1,12}):owner=([1-9A-HJ-NP-Za-km-z]{32,44})$/;
export function parseChestCommit(text: string): { chestId: string; targetSlot: number; owner: string } | null {
  const m = COMMIT_RE.exec(text.trim());
  return m ? { chestId: m[1], targetSlot: Number(m[2]), owner: m[3] } : null;
}

export interface CommitEvidence { texts: string[]; txSlot: number; signers: string[] }

/**
 * Pure check of an on-chain commit against a roll: the memo names this chest,
 * this target slot and this owner; it was signed by the owner or one of the
 * owner's session keys; and it landed BEFORE the target slot, so the
 * blockhash that seeds the roll could not have been known when it was posted.
 */
export function checkCommit(
  ev: CommitEvidence, want: { chestId: string; targetSlot: number; owner: string },
  isSessionOf: (signer: string) => boolean,
): { ok: boolean; reason?: string } {
  const c = ev.texts.map(parseChestCommit).find((x) => x && x.chestId === want.chestId);
  if (!c) return { ok: false, reason: 'no commit memo for this chest in that transaction' };
  if (c.owner !== want.owner) return { ok: false, reason: 'commit names another owner' };
  if (c.targetSlot !== want.targetSlot) return { ok: false, reason: `commit says slot ${c.targetSlot}, the roll used ${want.targetSlot}` };
  if (!ev.signers.some((s) => s === want.owner || isSessionOf(s))) return { ok: false, reason: 'commit not signed by the owner or a session key of the owner' };
  if (ev.txSlot >= want.targetSlot) return { ok: false, reason: `commit landed at slot ${ev.txSlot}, not before the target ${want.targetSlot}` };
  return { ok: true };
}

export async function fetchCommitEvidence(conn: Connection, sig: string): Promise<CommitEvidence | null> {
  const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) return null;
  const msg = tx.transaction.message;
  const keys = msg.staticAccountKeys.map((k) => k.toBase58());
  return { texts: memoTexts(tx), txSlot: tx.slot, signers: keys.slice(0, msg.header.numRequiredSignatures) };
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
  /** On-chain commit memo, if the commit was published (see checkCommit). */
  commitSig?: string;
  commitTxSlot?: number;
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
export async function verifyProof(conn: Connection, p: ChestProof): Promise<{
  ok: boolean; blockhash: string | null; seedHex: string | null; commit?: { ok: boolean; reason?: string };
}> {
  const blockhash = await fetchBlockhash(conn, p.slot);
  if (!blockhash) return { ok: false, blockhash: null, seedHex: null };
  let commit: { ok: boolean; reason?: string } | undefined;
  if (p.commitSig) {
    const ev = await fetchCommitEvidence(conn, p.commitSig).catch(() => null);
    if (!ev) commit = { ok: false, reason: 'commit transaction not found' };
    else {
      // A session key counts if its SessionRecord exists, or (revoked since,
      // or a memo-only session) the owner's signed link memo is on chain.
      const sessions = new Set<string>();
      const others = ev.signers.filter((s) => s !== p.owner);
      for (const s of others) {
        if (await readSessionRecord(conn, p.owner, s).catch(() => null)) sessions.add(s);
      }
      if (others.some((s) => !sessions.has(s))) {
        const led = await readSessionLedger(conn, p.owner).catch(() => null);
        led?.links.forEach((l) => { if (others.includes(l.session) && l.slot <= ev.txSlot) sessions.add(l.session); });
      }
      commit = checkCommit(ev, p, (s) => sessions.has(s));
    }
  }
  // the slot used must be the FIRST produced block at or after the target
  let first = p.slot;
  try { first = (await conn.getBlocks(p.targetSlot, p.slot, 'confirmed'))[0] ?? p.slot; } catch { /* keep */ }
  const seedHex = toHex(rollSeed(blockhash, p.chestId, p.owner));
  const rollOk = blockhash === p.blockhash && seedHex === p.seedHex && p.slot >= p.targetSlot && first === p.slot;
  return { ok: rollOk && (commit ? commit.ok : true), blockhash, seedHex, commit };
}
