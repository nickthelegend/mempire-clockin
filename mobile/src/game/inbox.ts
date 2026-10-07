import { CHEST_SLOTS, type ChestTier } from './rules';
import type { ChestCommit } from '../chain/fair';

/**
 * The chest rail plus an inbox. A chest earned while all four slots are full
 * is never dropped: it waits in `pending` and moves into the rail the moment
 * a slot frees (a chest is opened). Pure functions; the store persists them.
 */
export type ChestSource = 'win' | 'clockin' | 'shop' | 'quest' | 'welcome' | 'pass';

export interface Chest {
  id: string;
  tier: ChestTier;
  /** null until the player starts the timer; then the time it opens. */
  unlockAt: number | null;
  source: ChestSource;
  /** Provably fair: the future slot whose blockhash will roll this chest (chain/fair.ts). */
  commit?: ChestCommit;
}

export interface PendingChest { tier: ChestTier; source: ChestSource }

export interface Rail {
  chests: Chest[];
  pending: PendingChest[];
  nextChestId: number;
}

export interface Placed { rail: Rail; chest: Chest | null; queued: boolean }

/** Put a chest in a free slot, or in the inbox when the rail is full. */
export function placeChest(rail: Rail, tier: ChestTier, source: ChestSource, slots: number = CHEST_SLOTS): Placed {
  if (rail.chests.length < slots) {
    const chest: Chest = { id: `chest_${rail.nextChestId}`, tier, unlockAt: null, source };
    return { rail: { ...rail, chests: [...rail.chests, chest], nextChestId: rail.nextChestId + 1 }, chest, queued: false };
  }
  return { rail: { ...rail, pending: [...rail.pending, { tier, source }] }, chest: null, queued: true };
}

/** Move waiting chests into any free slots, oldest first. */
export function drainPending(rail: Rail, slots: number = CHEST_SLOTS): { rail: Rail; delivered: Chest[] } {
  let r = rail;
  const delivered: Chest[] = [];
  while (r.pending.length && r.chests.length < slots) {
    const [next, ...rest] = r.pending;
    const placed = placeChest({ ...r, pending: rest }, next.tier, next.source, slots);
    r = placed.rail;
    if (placed.chest) delivered.push(placed.chest);
  }
  return { rail: r, delivered };
}
