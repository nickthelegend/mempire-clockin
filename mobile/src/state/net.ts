import { create } from 'zustand';
import { connection } from '../chain/solana';
import { rateLimitedRecently } from '../chain/rpcFetch';

/**
 * Is devnet reachable? Checked on launch, on return to the app, and every
 * 45 s while open. Nothing in the game *needs* it — battles, chests, quests
 * and the coach all run on the device — so "down" means a calm banner, not
 * a wall.
 */
interface NetState { status: 'unknown' | 'ok' | 'busy' | 'down'; check: () => Promise<void> }

export const useNet = create<NetState>((set) => ({
  status: 'unknown',
  check: async () => {
    try {
      await Promise.race([
        connection.getSlot(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
      ]);
      set({ status: 'ok' });
    } catch (e) {
      // A 429 is the public RPC rate-limiting this IP, not an outage.
      set({ status: /429|Too many requests/i.test(String(e)) || rateLimitedRecently() ? 'busy' : 'down' });
    }
  },
}));
