import { create } from 'zustand';
import type { Drop, ChestTier } from '../game/rules';

export type Tab = 'home' | 'cards' | 'deck' | 'shop';

export interface PendingMatch {
  rival: string;
  tier: number;
  rush: boolean;
  player: { mint: string; ticker: string; level: number }[];
  bot: { mint: string; ticker: string; level: number }[];
}

export interface MatchResult {
  rival: string;
  won: boolean;
  draw: boolean;
  crowns: [number, number];
  trophyDelta: number;
  chest: ChestTier | null;
  skr: number;
  skrSig?: string;
}

export interface Reveal {
  title: string;
  tier: ChestTier;
  drops: Drop[];
}

interface UiState {
  tab: Tab;
  setTab: (t: Tab) => void;
  battle: PendingMatch | null;
  openBattle: (m: PendingMatch) => void;
  closeBattle: () => void;
  result: MatchResult | null;
  showResult: (r: MatchResult | null) => void;
  reveal: Reveal | null;
  showReveal: (r: Reveal | null) => void;
  coachOpen: boolean;
  setCoach: (v: boolean) => void;
  walletOpen: boolean;
  setWalletOpen: (v: boolean) => void;
  toast: { text: string; tone: 'ok' | 'err' | 'info'; id: number } | null;
  say: (text: string, tone?: 'ok' | 'err' | 'info') => void;
  /** Seeker Genesis Token mint, when the connected wallet holds one (mainnet read). */
  sgt: string | null;
  sgtChecked: boolean;
  mainnetSkr: number | null;
  setSeeker: (p: { sgt: string | null; mainnetSkr: number | null }) => void;
  /** This wallet's Clock-In memos read back from devnet; null = could not read, undefined = reading. */
  chainLedger: { day: number; streak: number; sig: string }[] | null | undefined;
  setChainLedger: (l: { day: number; streak: number; sig: string }[] | null) => void;
}

let toastId = 0;

export const useUi = create<UiState>((set) => ({
  tab: 'home',
  setTab: (tab) => set({ tab }),
  battle: null,
  openBattle: (battle) => set({ battle }),
  closeBattle: () => set({ battle: null }),
  result: null,
  showResult: (result) => set({ result }),
  reveal: null,
  showReveal: (reveal) => set({ reveal }),
  coachOpen: false,
  setCoach: (coachOpen) => set({ coachOpen }),
  walletOpen: false,
  setWalletOpen: (walletOpen) => set({ walletOpen }),
  toast: null,
  say: (text, tone = 'info') => set({ toast: { text, tone, id: ++toastId } }),
  sgt: null,
  sgtChecked: false,
  mainnetSkr: null,
  setSeeker: ({ sgt, mainnetSkr }) => set({ sgt, mainnetSkr, sgtChecked: true }),
  chainLedger: undefined,
  setChainLedger: (chainLedger) => set({ chainLedger }),
}));
