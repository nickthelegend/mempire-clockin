import type { StoreApi, UseBoundStore } from 'zustand';
import type { MatchCard, SimState } from '../sim/types';

/**
 * What the 3D scene reads about the match, and nothing more.
 *
 * The scene used to import the web client's whole match store, which drags in
 * wallets, escrow, the relay and the rollup. The native app renders the very
 * same scene over its own, much smaller store, so the scene now depends only
 * on this shape and the host binds whichever store it has:
 *
 *   web:    bindArenaStore(useMatch)          (screens/Battle.tsx)
 *   native: bindArenaStore(useNativeMatch)    (mobile/src/arena)
 */
export interface ArenaState {
  sim: SimState | null;
  perspective: 0 | 1;
  playerDeck: MatchCard[];
  botDeck: MatchCard[];
}

type ArenaStore = UseBoundStore<StoreApi<ArenaState>>;

let bound: ArenaStore | null = null;

export function bindArenaStore(store: UseBoundStore<StoreApi<ArenaState>> | UseBoundStore<StoreApi<any>>): void { // eslint-disable-line @typescript-eslint/no-explicit-any
  bound = store as ArenaStore;
}

function store(): ArenaStore {
  if (!bound) throw new Error('arena store not bound: call bindArenaStore() before mounting the scene');
  return bound;
}

/** Drop-in for the zustand hook the scene components used. */
export function useArena<T>(selector: (s: ArenaState) => T): T {
  return store()(selector);
}
useArena.getState = (): ArenaState => store().getState();
