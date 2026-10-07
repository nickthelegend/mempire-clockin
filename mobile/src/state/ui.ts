import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Drop, ChestTier } from '../game/rules';

export type Tab = 'home' | 'cards' | 'deck' | 'shop';

export type RendererPref = 'auto' | 'native' | 'web';
export type Renderer = 'native' | 'web';

export interface PendingMatch {
  rival: string;
  rivalIndex: number;
  tier: number;
  rush: boolean;
  /** Fixed per match, so a fallback to the web arena replays the same match. */
  seed: number;
  /** Which arena renders this match (resolved from the setting at battle start). */
  renderer: Renderer;
  /** Equipped arena skin, already checked against the chain (native arena only). */
  skin?: string;
  /** True when this match was moved here after the native arena failed. */
  fellBack?: boolean;
  /** The guided first battle: coach marks on, welcome chest at the end. */
  tutorial?: boolean;
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
  /** All four slots were full: the chest is waiting in the inbox. */
  chestQueued?: boolean;
  renderer: Renderer;
  fellBack?: boolean;
  skr: number;
  skrSig?: string;
  /** Cards this player deployed (counts toward the daily quest). */
  plays: number;
  tutorial?: boolean;
  /** The welcome chest the guided first battle pays. */
  welcomeChest?: ChestTier | null;
  welcomeQueued?: boolean;
  rivalIndex: number;
  rush: boolean;
}

export interface Reveal {
  title: string;
  tier: ChestTier;
  drops: Drop[];
}

interface UiState {
  /** Arena renderer setting: auto = native 3D on a phone, web arena on a simulator. */
  rendererPref: RendererPref;
  setRendererPref: (r: RendererPref) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  battle: PendingMatch | null;
  openBattle: (m: PendingMatch) => void;
  closeBattle: () => void;
  result: MatchResult | null;
  showResult: (r: MatchResult | null) => void;
  reveal: Reveal | null;
  showReveal: (r: Reveal | null) => void;
  /** First-run intro open. */
  introOpen: boolean;
  setIntro: (v: boolean) => void;
  coachOpen: boolean;
  setCoach: (v: boolean) => void;
  passOpen: boolean;
  setPass: (v: boolean) => void;
  boardOpen: boolean;
  setBoard: (v: boolean) => void;
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
  chainLedger: { day: number; streak: number; sig: string; via?: 'wallet' | 'session' }[] | null | undefined;
  setChainLedger: (l: { day: number; streak: number; sig: string; via?: 'wallet' | 'session' }[] | null | undefined) => void;
}

let toastId = 0;

export const useUi = create<UiState>((set) => ({
  rendererPref: 'auto',
  setRendererPref: (rendererPref) => {
    set({ rendererPref });
    void AsyncStorage.setItem(RENDERER_KEY, rendererPref).catch(() => {});
  },
  tab: 'home',
  setTab: (tab) => set({ tab }),
  battle: null,
  openBattle: (battle) => set({ battle }),
  closeBattle: () => set({ battle: null }),
  result: null,
  showResult: (result) => set({ result }),
  reveal: null,
  showReveal: (reveal) => set({ reveal }),
  introOpen: false,
  setIntro: (introOpen) => set({ introOpen }),
  coachOpen: false,
  setCoach: (coachOpen) => set({ coachOpen }),
  passOpen: false,
  setPass: (passOpen) => set({ passOpen }),
  boardOpen: false,
  setBoard: (boardOpen) => set({ boardOpen }),
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

const RENDERER_KEY = 'mempire.renderer.v1';
/** Restore the saved renderer setting (called once at startup). */
export async function loadRendererPref(): Promise<void> {
  const v = await AsyncStorage.getItem(RENDERER_KEY).catch(() => null);
  if (v === 'auto' || v === 'native' || v === 'web') useUi.setState({ rendererPref: v });
}

const FTUE_KEY = 'mempire.ftue.v1';
/** Has this device finished (or skipped) the first-run intro? */
export async function ftueDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(FTUE_KEY).catch(() => null)) === 'done';
}
export function markFtue(done: boolean): void {
  void (done ? AsyncStorage.setItem(FTUE_KEY, 'done') : AsyncStorage.removeItem(FTUE_KEY)).catch(() => {});
}
