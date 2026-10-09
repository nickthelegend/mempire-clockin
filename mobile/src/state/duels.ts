import { create } from 'zustand';
import { connection } from '../chain/solana';
import { loadChallenge, readDuelBoard, type DuelTx } from '../chain/duels';
import {
  decodeDuel, fromB64url, verifyResult, type DuelPayload, type Replay,
} from '../game/duel';

/**
 * The Duels tab's view of the chain: every challenge and result posted with
 * the duel reference account, newest first, plus the challenge a deep link
 * opened. Results are re-simulated on this phone before they get a ✓.
 */
export interface OpenDuel {
  sig: string | null;
  challenger: string;
  payload: DuelPayload | null;
  payloadB64: string | null;
  /** 'chain' = payload matched the on-chain sha256 commitment; 'link' = link only */
  source: 'chain' | 'link';
  error?: string;
}

export type Check = { state: 'busy' } | { state: 'ok' | 'bad'; replay?: Replay; why?: string };

interface DuelsState {
  board: DuelTx[];
  loading: boolean;
  error: string | null;
  loadedAt: number | null;
  open: OpenDuel | null;
  checks: Record<string, Check>;
  refresh: () => Promise<void>;
  openLink: (sig: string | null, payload: string | null) => Promise<void>;
  closeOpen: () => void;
  verify: (resultSig: string) => Promise<void>;
}

// A slower RPC answer must not reopen a dismissed sheet or replace a newer link.
let openRequest = 0;
const yieldUi = () => new Promise((r) => setTimeout(r, 30));

export const useDuels = create<DuelsState>((set, get) => ({
  board: [],
  loading: false,
  error: null,
  loadedAt: null,
  open: null,
  checks: {},

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const { txs } = await readDuelBoard(connection, 40);
      set({ board: txs, loadedAt: Date.now() });
      // Verify the newest few results right away; the rest on tap.
      for (const t of txs.filter((x) => x.memo.kind === 'result').slice(0, 4)) {
        if (!get().checks[t.sig]) void get().verify(t.sig);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },

  openLink: async (sig, payload) => {
    const request = ++openRequest;
    if (!sig) {
      try {
        set({ open: { sig: null, challenger: 'a friend', payload: decodeDuel(fromB64url(payload ?? '')), payloadB64: payload, source: 'link' } });
      } catch (e) {
        set({ open: { sig: null, challenger: 'a friend', payload: null, payloadB64: null, source: 'link', error: (e as Error).message } });
      }
      return;
    }
    set({ open: { sig, challenger: '…', payload: null, payloadB64: payload, source: 'chain' } });
    try {
      const c = await loadChallenge(connection, sig, payload ?? undefined);
      if (request !== openRequest) return;
      set({ open: { sig, challenger: c.challenger, payload: c.payload, payloadB64: c.payloadB64, source: 'chain', error: c.error } });
    } catch (e) {
      if (request !== openRequest) return;
      set({ open: { sig, challenger: '?', payload: null, payloadB64: null, source: 'chain', error: (e as Error).message } });
    }
  },

  closeOpen: () => { openRequest++; set({ open: null }); },

  verify: async (resultSig) => {
    if (get().checks[resultSig]?.state === 'busy') return;
    const r = get().board.find((t) => t.sig === resultSig);
    if (!r || r.memo.kind !== 'result') return;
    const memo = r.memo;
    set({ checks: { ...get().checks, [resultSig]: { state: 'busy' } } });
    await yieldUi();
    try {
      if (!memo.data) throw new Error('result has no deploys to replay');
      const c = await loadChallenge(connection, memo.challengeSig);
      if (!c.payload) throw new Error(c.error ?? 'challenge payload missing');
      const v = verifyResult(c.payload, decodeDuel(fromB64url(memo.data)), memo);
      set({ checks: { ...get().checks, [resultSig]: { state: v.ok ? 'ok' : 'bad', replay: v.replay, why: v.ok ? undefined : 'the replay disagrees with the posted result' } } });
    } catch (e) {
      set({ checks: { ...get().checks, [resultSig]: { state: 'bad', why: (e as Error).message } } });
    }
  },
}));
