import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  QUESTS, QUEST_BONUS, freshQuests, utcDayKey, type QuestId, type QuestState,
  BY_TICKER, CHESTS, CHEST_SLOTS, COPIES_TO_LEVEL, MAX_LEVEL, STARTER_DECK, STARTER_POOL,
  clockIn, dayKey, rewardFor, rollChest, winChestTier,
  type ChestTier, type ClockInOutcome, type DayReward, type Drop, type OwnedCard, type Streak,
} from '../game/rules';

/**
 * The player's progress, per wallet address, saved on the device.
 *
 * What lives here is game state: cards and levels, the deck, the chest rail,
 * the Clock-In streak, battle record. What does *not* live here is anything
 * the chain is the authority for — SOL and stand-in SKR balances come from
 * the wallet store, and each Clock-In's proof is its devnet signature.
 */
export interface Chest {
  id: string;
  tier: ChestTier;
  /** null until the player starts the timer; then the time it opens. */
  unlockAt: number | null;
  source: 'win' | 'clockin' | 'shop' | 'quest' | 'welcome';
}

export interface BattleRecord {
  at: number;
  rival: string;
  won: boolean;
  draw: boolean;
  crowns: [number, number];
  trophyDelta: number;
  /** Which arena rendered it ('native' 3D or 'web' compat), and whether it fell back. */
  renderer?: 'native' | 'web';
  fellBack?: boolean;
}

export interface ClockInRecord {
  day: number;
  streak: number;
  skr: number;
  chest: ChestTier | null;
  /** Devnet signature of the memo (and SKR mint) — absent when it could not be sent. */
  sig?: string;
  offlineReason?: string;
}

interface Save {
  v: 1;
  cards: Record<string, OwnedCard>;
  deck: string[];
  chests: Chest[];
  nextChestId: number;
  streak: Streak;
  /** Simulated SKR, used only while the devnet stand-in mint is not deployed. */
  skrSim: number;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
  history: BattleRecord[];
  clockIns: ClockInRecord[];
  coachRuns: number;
  quests: QuestState;
}

const fresh = (): Save => ({
  v: 1,
  cards: Object.fromEntries(STARTER_POOL.map((t) => [t, { level: 1, copies: 0 }])),
  deck: [...STARTER_DECK],
  chests: [{ id: 'chest_1', tier: 'silver', unlockAt: null, source: 'clockin' }],
  nextChestId: 2,
  streak: { count: 0, best: 0, lastDay: 0, shields: 0 },
  skrSim: 0,
  trophies: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  history: [],
  clockIns: [],
  coachRuns: 0,
  quests: freshQuests(),
});

const keyFor = (address: string) => `mempire.save.v1.${address}`;

interface GameState extends Save {
  address: string | null;
  loaded: boolean;
  load: (address: string) => Promise<void>;
  unload: () => void;

  addChest: (tier: ChestTier, source: Chest['source']) => Chest | null;
  startUnlock: (id: string) => Chest | null;
  finishUnlock: (id: string) => void;
  openChest: (id: string) => Drop[] | null;
  /** Roll and apply a chest's contents without it ever sitting in a slot. */
  openNow: (tier: ChestTier) => Drop[];
  upgrade: (ticker: string) => boolean;
  setDeckSlot: (slot: number, ticker: string) => void;

  /** Compute today's Clock-In without committing it. */
  previewClockIn: (seeker: boolean) => { outcome: ClockInOutcome; reward: DayReward } | null;
  /** Commit today's Clock-In and pay its rewards. */
  commitClockIn: (seeker: boolean, proof: { sig?: string; offlineReason?: string }) =>
    { outcome: ClockInOutcome; reward: DayReward; chest: Chest | null } | null;

  addSkrSim: (n: number) => void;
  spendSkrSim: (n: number) => boolean;
  addShield: () => void;
  recordBattle: (b: Omit<BattleRecord, 'at' | 'trophyDelta'>) => { record: BattleRecord; chest: Chest | null };
  noteCoachRun: () => void;
  /** Roll the quest board over if the UTC day changed. */
  refreshQuests: () => void;
  progressQuest: (id: QuestId, by?: number) => void;
  /** Mark a finished quest claimed; returns its SKR reward, or 0. */
  claimQuest: (id: QuestId) => number;
  /** All three claimed → bonus chest (once per day). */
  claimQuestBonus: () => Chest | null;
  /**
   * Restore the streak from the chain's Clock-In memos when they are ahead of
   * this device (a reinstall, a second phone). The chain is the record.
   */
  adoptChainStreak: (latest: { day: number; streak: number }) => boolean;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function applyDrops(cards: Record<string, OwnedCard>, drops: Drop[]): Record<string, OwnedCard> {
  const next = { ...cards };
  for (const d of drops) {
    const cur = next[d.ticker];
    // A newly found fighter arrives at level 1 with its first copy spent on it.
    next[d.ticker] = cur
      ? { ...cur, copies: cur.copies + d.copies }
      : { level: 1, copies: Math.max(0, d.copies - 1) };
  }
  return next;
}

export const useGame = create<GameState>((set, get) => {
  const persist = () => {
    const { address } = get();
    if (!address) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = get();
      const save: Save = {
        v: 1, cards: s.cards, deck: s.deck, chests: s.chests, nextChestId: s.nextChestId,
        streak: s.streak, skrSim: s.skrSim, trophies: s.trophies, wins: s.wins, losses: s.losses,
        draws: s.draws, history: s.history.slice(0, 50), clockIns: s.clockIns.slice(0, 120),
        coachRuns: s.coachRuns, quests: s.quests,
      };
      void AsyncStorage.setItem(keyFor(address), JSON.stringify(save));
    }, 250);
  };
  const put = (patch: Partial<GameState>) => { set(patch); persist(); };

  return {
    ...fresh(),
    address: null,
    loaded: false,

    load: async (address) => {
      const raw = await AsyncStorage.getItem(keyFor(address)).catch(() => null);
      let save = fresh();
      if (raw) {
        try { save = { ...save, ...(JSON.parse(raw) as Save) }; } catch { /* corrupt save → fresh */ }
      }
      if (!save.quests || save.quests.day !== utcDayKey()) save.quests = freshQuests();
      // Drop anything the roster no longer has, so a stale save cannot crash a screen.
      save.cards = Object.fromEntries(Object.entries(save.cards).filter(([t]) => BY_TICKER.has(t)));
      if (save.deck.length !== 8 || save.deck.some((t) => !save.cards[t])) save.deck = [...STARTER_DECK];
      set({ ...save, address, loaded: true });
    },

    unload: () => set({ ...fresh(), address: null, loaded: false }),

    addChest: (tier, source) => {
      const s = get();
      if (s.chests.length >= CHEST_SLOTS) return null;
      const chest: Chest = { id: `chest_${s.nextChestId}`, tier, unlockAt: null, source };
      put({ chests: [...s.chests, chest], nextChestId: s.nextChestId + 1 });
      return chest;
    },

    startUnlock: (id) => {
      const s = get();
      if (s.chests.some((c) => c.unlockAt !== null && c.unlockAt > Date.now())) return null; // one at a time
      let started: Chest | null = null;
      const chests = s.chests.map((c) => {
        if (c.id !== id || c.unlockAt !== null) return c;
        started = { ...c, unlockAt: Date.now() + CHESTS[c.tier].unlockMin * 60_000 };
        return started;
      });
      put({ chests });
      return started;
    },

    finishUnlock: (id) => put({
      chests: get().chests.map((c) => (c.id === id ? { ...c, unlockAt: Date.now() } : c)),
    }),

    openChest: (id) => {
      const s = get();
      const c = s.chests.find((x) => x.id === id);
      if (!c || c.unlockAt === null || c.unlockAt > Date.now()) return null;
      const drops = rollChest(c.tier, s.cards);
      put({ chests: s.chests.filter((x) => x.id !== id), cards: applyDrops(s.cards, drops) });
      return drops;
    },

    openNow: (tier) => {
      const drops = rollChest(tier, get().cards);
      put({ cards: applyDrops(get().cards, drops) });
      return drops;
    },

    upgrade: (ticker) => {
      const s = get();
      const c = s.cards[ticker];
      if (!c || c.level >= MAX_LEVEL) return false;
      const need = COPIES_TO_LEVEL[c.level];
      if (c.copies < need) return false;
      put({ cards: { ...s.cards, [ticker]: { level: c.level + 1, copies: c.copies - need } } });
      return true;
    },

    setDeckSlot: (slot, ticker) => {
      const s = get();
      if (!s.cards[ticker] || slot < 0 || slot > 7) return;
      const deck = s.deck.slice();
      const existing = deck.indexOf(ticker);
      if (existing >= 0) deck[existing] = deck[slot]; // swap within the deck
      deck[slot] = ticker;
      put({ deck });
    },

    previewClockIn: (seeker) => {
      const outcome = clockIn(get().streak, dayKey());
      if (!outcome) return null;
      return { outcome, reward: rewardFor(outcome.streak.count, seeker) };
    },

    commitClockIn: (seeker, proof) => {
      const today = dayKey();
      const outcome = clockIn(get().streak, today);
      if (!outcome) return null;
      const reward = rewardFor(outcome.streak.count, seeker);
      put({
        streak: outcome.streak,
        clockIns: [{
          day: today, streak: outcome.streak.count, skr: reward.skr, chest: reward.chest,
          sig: proof.sig, offlineReason: proof.offlineReason,
        }, ...get().clockIns],
      });
      const chest = reward.chest ? get().addChest(reward.chest, 'clockin') : null;
      return { outcome, reward, chest };
    },

    addSkrSim: (n) => put({ skrSim: get().skrSim + n }),
    spendSkrSim: (n) => {
      if (get().skrSim < n) return false;
      put({ skrSim: get().skrSim - n });
      return true;
    },
    addShield: () => put({ streak: { ...get().streak, shields: get().streak.shields + 1 } }),

    recordBattle: (b) => {
      const s = get();
      const trophyDelta = b.draw ? 0 : b.won ? 30 : -Math.min(15, s.trophies);
      const record: BattleRecord = { ...b, at: Date.now(), trophyDelta };
      put({
        history: [record, ...s.history],
        trophies: s.trophies + trophyDelta,
        wins: s.wins + (b.won ? 1 : 0),
        losses: s.losses + (!b.won && !b.draw ? 1 : 0),
        draws: s.draws + (b.draw ? 1 : 0),
      });
      const chest = b.won ? get().addChest(winChestTier(), 'win') : null;
      return { record, chest };
    },

    noteCoachRun: () => put({ coachRuns: get().coachRuns + 1 }),

    refreshQuests: () => {
      const today = utcDayKey();
      if (get().quests?.day !== today) put({ quests: freshQuests(today) });
    },
    progressQuest: (id, by = 1) => {
      get().refreshQuests();
      const q = get().quests;
      const goal = QUESTS.find((x) => x.id === id)!.goal;
      if (q.progress[id] >= goal) return;
      put({ quests: { ...q, progress: { ...q.progress, [id]: Math.min(goal, q.progress[id] + by) } } });
    },
    claimQuest: (id) => {
      get().refreshQuests();
      const q = get().quests;
      const def = QUESTS.find((x) => x.id === id)!;
      if (q.claimed[id] || q.progress[id] < def.goal) return 0;
      put({ quests: { ...q, claimed: { ...q.claimed, [id]: true } } });
      return def.skr;
    },
    claimQuestBonus: () => {
      const q = get().quests;
      if (q.bonusClaimed || !QUESTS.every((x) => q.claimed[x.id])) return null;
      put({ quests: { ...q, bonusClaimed: true } });
      return get().addChest(QUEST_BONUS, 'quest');
    },

    adoptChainStreak: (latest) => {
      const st = get().streak;
      if (latest.day <= st.lastDay) return false;
      put({
        streak: {
          ...st, count: latest.streak, lastDay: latest.day, best: Math.max(st.best, latest.streak),
        },
      });
      return true;
    },
  };
});

export const avgDeckLevel = (s: Pick<Save, 'deck' | 'cards'>) =>
  s.deck.reduce((n, t) => n + (s.cards[t]?.level ?? 1), 0) / Math.max(1, s.deck.length);
