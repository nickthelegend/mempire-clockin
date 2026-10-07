import { create } from 'zustand';
import { connection } from '../chain/solana';

/**
 * Is devnet reachable? Checked on launch, on return to the app, and every
 * 45 s while open. Nothing in the game *needs* it — battles, chests, quests
 * and the coach all run on the device — so "down" means a calm banner, not
 * a wall.
 */
interface NetState { status: 'unknown' | 'ok' | 'down'; check: () => Promise<void> }

export const useNet = create<NetState>((set) => ({
  status: 'unknown',
  check: async () => {
    try {
      await Promise.race([
        connection.getSlot(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
      ]);
      set({ status: 'ok' });
    } catch {
      set({ status: 'down' });
    }
  },
}));
