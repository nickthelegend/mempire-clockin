import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { connection, CLUSTER_LABEL } from '../chain/solana';
import { computeBoard, readWarPage, toEvents, type RawEvent, type WarBoard } from '../chain/war';
import { SEASON_WAR } from '../game/board';
import { dayKey } from '../game/rules';

/**
 * The global war tally and streak board, built on this phone from the
 * WAR_REF history. Raw transactions are cached (per cluster) so a refresh
 * only fetches what is new; "Load older" pages back through history.
 */
const KEY = `mempire.war.v1.${CLUSTER_LABEL}`;
const CAP = 3000;

interface WarState {
  raw: RawEvent[];
  newest: string | null;
  oldest: string | null;
  more: boolean;
  board: WarBoard | null;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
}

const build = (raw: RawEvent[]) => computeBoard(toEvents(raw), dayKey(), SEASON_WAR.sides);
const merge = (a: RawEvent[], b: RawEvent[]) => {
  const seen = new Set<string>();
  return [...a, ...b].filter((r) => (seen.has(r.sig) ? false : (seen.add(r.sig), true))).sort((x, y) => y.slot - x.slot).slice(0, CAP);
};

export const useWar = create<WarState>((set, get) => ({
  raw: [], newest: null, oldest: null, more: false, board: null, loading: false, error: null, updatedAt: null,

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      if (!get().raw.length) {
        const cached = await AsyncStorage.getItem(KEY).catch(() => null);
        if (cached) {
          const c = JSON.parse(cached) as Pick<WarState, 'raw' | 'newest' | 'oldest' | 'more'>;
          set({ ...c, board: build(c.raw) });
        }
      }
      // New since the newest cached signature (or the first page).
      let raw = get().raw;
      let newest = get().newest;
      let oldest = get().oldest;
      let more = get().more;
      const firstLoad = !newest;
      const until = newest ?? undefined;
      for (let page = 0, before: string | undefined; page < 5; page++) {
        const r = await readWarPage(connection, { until, before, limit: 100 });
        raw = merge(raw, r.raw);
        if (page === 0 && r.newest) newest = r.newest;
        if (firstLoad) { oldest = r.oldest ?? oldest; more = r.full; }
        if (!r.full) break;
        before = r.oldest;
      }
      set({ raw, newest, oldest, more, board: build(raw), updatedAt: Date.now() });
      void AsyncStorage.setItem(KEY, JSON.stringify({ raw, newest, oldest, more })).catch(() => {});
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },

  loadOlder: async () => {
    const { oldest, loading } = get();
    if (loading || !oldest) return;
    set({ loading: true });
    try {
      const r = await readWarPage(connection, { before: oldest, limit: 100 });
      const raw = merge(get().raw, r.raw);
      set({ raw, oldest: r.oldest ?? oldest, more: r.full, board: build(raw) });
      void AsyncStorage.setItem(KEY, JSON.stringify({ raw, newest: get().newest, oldest: get().oldest, more: get().more })).catch(() => {});
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },
}));
