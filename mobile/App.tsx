import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, AppState, BackHandler, Image, Linking, Pressable, StyleSheet, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts, LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import {
  HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import { UI_ART } from './src/data/art';
import { useWallet } from './src/wallet/wallet';
import { useDisplayName } from './src/state/identity';
import { useGame } from './src/state/game';
import { ftueDone, loadRendererPref, useUi, type Tab } from './src/state/ui';
import { useNet } from './src/state/net';
import { Intro } from './src/screens/Intro';
import { initSound } from './src/sound';
import { reduceMotion, useCountUp, EASE_OUT } from './src/motion';
import { streakState } from './src/game/rules';
import { findSgtMint, mainnetSkr } from './src/chain/seeker';
import { SKR_LIVE } from './src/chain/skr';
import { CLUSTER_LABEL, readClockIns, short } from './src/chain/solana';
import { COPIES_TO_LEVEL, MAX_LEVEL } from './src/game/rules';
import { prepareMatch } from './src/game/actions';
import { ensureChannel, ensureStreakReminder, haptic } from './src/notify';
import { C } from './src/theme';
import { Body, Btn, Chip, Display } from './src/ui/kit';
import { ConnectScreen } from './src/screens/Connect';
import { HomeScreen } from './src/screens/Home';
import { CardsScreen } from './src/screens/Cards';
import { DeckScreen } from './src/screens/Deck';
import { ShopScreen } from './src/screens/Shop';
import { CoachSheet } from './src/screens/Coach';
import { SeasonPassSheet } from './src/screens/SeasonPass';
import { BoardSheet } from './src/screens/Board';
import { usePassChain } from './src/chain/pass';
import { NativeArena } from './src/arena/NativeArena';
import { ArenaHost } from './src/screens/Arena';
import { ResultSheet, RevealSheet, Toast, WalletSheet } from './src/screens/Overlays';

/**
 * Mempire for Seeker.
 *
 * Native React Native for the whole daily loop: wallet (Mobile Wallet Adapter,
 * or a labelled devnet dev wallet), Clock-In streak, chests, collection, deck,
 * SKR shop, AI coach and results. The 3D battle (React Three Fiber over the
 * deterministic sim) runs in a bundled WebView only for the length of a match.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
  }),
});
void SplashScreen.preventAutoHideAsync();

const TABS: { id: Tab; label: string; icon: keyof typeof UI_ART }[] = [
  { id: 'home', label: 'Home', icon: 'tab_arena' },
  { id: 'cards', label: 'Cards', icon: 'tab_cards' },
  { id: 'deck', label: 'Deck', icon: 'tab_deck' },
  { id: 'shop', label: 'Shop', icon: 'tab_swap' },
];

function Header() {
  const insets = useSafeAreaInsets();
  const address = useWallet((s) => s.address);
  const kind = useWallet((s) => s.kind);
  const sol = useWallet((s) => s.sol);
  const skr = useWallet((s) => s.skr);
  const skrSim = useGame((s) => s.skrSim);
  const trophies = useGame((s) => s.trophies);
  const sgt = useUi((s) => s.sgt);
  const siws = useWallet((s) => s.signIn);
  const setWalletOpen = useUi((s) => s.setWalletOpen);
  const setTab = useUi((s) => s.setTab);
  const who = useDisplayName(address);
  const shownTrophies = useCountUp(trophies);
  const shownSkr = useCountUp(SKR_LIVE ? Math.floor(skr ?? 0) : skrSim);
  return (
    <View style={[st.header, { paddingTop: insets.top + 6 }]}>
      <Pressable style={({ pressed }) => [st.who, pressed && { opacity: 0.75 }]} onPress={() => { haptic.tap(); setWalletOpen(true); }} accessibilityRole="button" accessibilityLabel="Wallet and settings">
        <Image source={UI_ART.avatar_guest} style={st.avatar} />
        <View>
          <Body size={13} color={who.skr ? C.teal : '#fff'} bold numberOfLines={1} style={{ maxWidth: 130 }}>{who.label}</Body>
          <Body size={10} color={sgt ? C.teal : kind === 'dev' ? C.goldHi : C.dim} bold>
            {sgt ? 'SEEKER VERIFIED' : kind === 'dev' ? 'DEV WALLET' : 'MWA WALLET'}{siws ? ' · SIWS ✓' : ''}
          </Body>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Chip label="TROPHY" value={String(shownTrophies)} color={C.gold} />
        <Chip label="SOL" value={sol === null ? '…' : sol.toFixed(2)} color={C.bluePale} onPress={() => setWalletOpen(true)} tag={CLUSTER_LABEL} />
        <Chip
          label="SKR"
          value={String(shownSkr)}
          color={C.skr}
          tag={SKR_LIVE ? 'stand-in' : 'sim'}
          onPress={() => setTab('shop')}
        />
      </View>
    </View>
  );
}

function TabBar() {
  const insets = useSafeAreaInsets();
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const upgradable = useGame((s) => Object.values(s.cards)
    .some((c) => c.level < MAX_LEVEL && c.copies >= COPIES_TO_LEVEL[c.level]));
  // Re-evaluated every 15 s: a timer finishing changes no store value.
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const chests = useGame((s) => s.chests);
  const chestReady = chests.some((c) => c.unlockAt !== null && c.unlockAt <= now);
  return (
    <View style={[st.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const on = tab === t.id;
        const dot = (t.id === 'cards' && upgradable) || (t.id === 'home' && chestReady);
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            onPress={() => { if (!on) { haptic.tap(); setTab(t.id); } }}
            style={[st.tab, on && st.tabOn]}
          >
            <Image source={UI_ART[t.icon]} style={{ width: on ? 40 : 32, height: on ? 40 : 32 }} />
            <Body size={11} color={on ? '#fff' : C.dim} bold>{t.label}</Body>
            {dot ? <View style={st.dot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Each tab slides in from the side it lives on. */
function Screens() {
  const tab = useUi((s) => s.tab);
  const v = useRef(new Animated.Value(1)).current;
  const prev = useRef<Tab>(tab);
  const dir = TABS.findIndex((t) => t.id === tab) >= TABS.findIndex((t) => t.id === prev.current) ? 1 : -1;
  useEffect(() => {
    prev.current = tab;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [tab, v]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: v,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion() ? 0 : 24 * dir, 0] }) }],
      }}
    >
      {tab === 'home' ? <HomeScreen /> : tab === 'cards' ? <CardsScreen /> : tab === 'deck' ? <DeckScreen /> : <ShopScreen />}
    </Animated.View>
  );
}

let initialUrlConsumed = false;

function OfflineBanner() {
  const status = useNet((s) => s.status);
  const check = useNet((s) => s.check);
  if (status !== 'down') return null;
  return (
    <Pressable onPress={() => void check()} style={st.offline} accessibilityRole="button" accessibilityLabel="Devnet unreachable. Tap to retry.">
      <Body size={12} bold color="#fff">Devnet is unreachable right now.</Body>
      <Body size={11} color={C.dim}>Battles, chests and quests still work. On-chain actions wait. Tap to retry.</Body>
    </Pressable>
  );
}

function Game() {
  const setIntro = useUi((s) => s.setIntro);
  // First run: the intro opens once per device until finished or skipped.
  useEffect(() => { void ftueDone().then((done) => { if (!done) setIntro(true); }); }, [setIntro]);
  // Streak-at-risk reminder, re-evaluated whenever the app comes and goes.
  useEffect(() => {
    const sync = () => {
      const st = useGame.getState().streak;
      ensureStreakReminder(streakState(st), st.count);
    };
    sync();
    const unsub = useGame.subscribe((s, prev) => { if (s.streak !== prev.streak) sync(); });
    const sub = AppState.addEventListener('change', (a) => { if (a === 'background') sync(); });
    return () => { unsub(); sub.remove(); };
  }, []);
  // Android back: from any tab, go Home first; only Home exits. Sheets and the
  // arena are Modals and get the back press through their onRequestClose.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const ui = useUi.getState();
      if (ui.tab !== 'home') { ui.setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);
  // Deep link straight into a battle: mempire://battle?rival=0..3&rush=1&renderer=native|web
  // (home-screen shortcuts, notifications, and scripted demo capture).
  useEffect(() => {
    const open = (url: string | null) => {
      if (url === 'mempire://pass') { useUi.getState().setPass(true); return; }
      if (url === 'mempire://board') { useUi.getState().setBoard(true); return; }
      const hit = url && /^mempire:\/\/battle(?:\?(.*))?$/.exec(url);
      if (!hit) return;
      const q = new URLSearchParams(hit[1] ?? '');
      const rival = Math.max(0, Math.min(3, Number(q.get('rival') ?? 1) || 0));
      const m = prepareMatch(rival, q.get('rush') === '1');
      const r = q.get('renderer');
      if (r === 'native' || r === 'web') m.renderer = r;
      if (!useUi.getState().battle) useUi.getState().openBattle(m);
    };
    // The launch URL is consumed once per process; a sign-out/sign-in or an
    // error-boundary retry must not replay it.
    if (!initialUrlConsumed) {
      initialUrlConsumed = true;
      void Linking.getInitialURL().then(open);
    }
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, []);
  return (
    <View style={{ flex: 1 }}>
      <Header />
      <OfflineBanner />
      <Screens />
      <TabBar />
      <CoachSheet />
      <SeasonPassSheet />
      <BoardSheet />
      <NativeArena />
      <ArenaHost />
      <ResultSheet />
      <RevealSheet />
      <WalletSheet />
      <Intro />
    </View>
  );
}

function Root() {
  const address = useWallet((s) => s.address);
  const kind = useWallet((s) => s.kind);
  const restoring = useWallet((s) => s.restoring);
  const restore = useWallet((s) => s.restore);
  const refresh = useWallet((s) => s.refresh);
  const loadedFor = useGame((s) => s.address);
  const load = useGame((s) => s.load);
  const setSeeker = useUi((s) => s.setSeeker);

  useEffect(() => {
    void restore();
    void loadRendererPref();
    void initSound();
    void useNet.getState().check();
    const t = setInterval(() => void useNet.getState().check(), 45_000);
    void ensureChannel();
    return () => clearInterval(t);
  }, [restore]);

  useEffect(() => {
    if (address && loadedFor !== address) void load(address);
  }, [address, loadedFor, load]);

  // The streak lives on chain too: if this device is behind (reinstall, new
  // phone), adopt the latest signed Clock-In memo.
  const adoptChainStreak = useGame((s) => s.adoptChainStreak);
  const setChainLedger = useUi((s) => s.setChainLedger);
  const readLedger = useCallback(() => {
    if (!address || useGame.getState().address !== address) return;
    if (Array.isArray(useUi.getState().chainLedger)) return; // read once per session
    void readClockIns(address).then((list) => {
      if (useWallet.getState().address !== address) return;
      setChainLedger(list);
      if (list[0] && adoptChainStreak(list[0])) {
        useUi.getState().say(`Streak restored from Solana: day ${useGame.getState().streak.count}`, 'ok');
      }
    }).catch(() => setChainLedger(null)); // retried on resume and on the 45 s poll
  }, [address, adoptChainStreak, setChainLedger]);
  useEffect(() => {
    if (!address || loadedFor !== address) return undefined;
    setChainLedger(undefined);
    readLedger();
    const t = setInterval(readLedger, 45_000);
    return () => clearInterval(t);
  }, [address, loadedFor, readLedger, setChainLedger]);

  // Season Pass and skins: what the chain says this wallet holds, re-read on
  // resume and every 60 s. Ownership is never cached on the device.
  useEffect(() => {
    void usePassChain.getState().refresh(address);
    if (!address) return undefined;
    const t = setInterval(() => void usePassChain.getState().refresh(address), 60_000);
    return () => clearInterval(t);
  }, [address]);

  // Seeker perks are a mainnet *read* for a real wallet; a dev key never has one.
  useEffect(() => {
    if (!address) return;
    if (kind !== 'mwa') { setSeeker({ sgt: null, mainnetSkr: null }); return; }
    void Promise.all([findSgtMint(address).catch(() => null), mainnetSkr(address).catch(() => null)])
      .then(([sgt, skr]) => setSeeker({ sgt, mainnetSkr: skr }));
  }, [address, kind, setSeeker]);

  // Coming back to the app is when balances and chest timers matter.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void refresh(); void useNet.getState().check(); useGame.getState().refreshQuests(); readLedger();
        void usePassChain.getState().refresh(useWallet.getState().address);
      }
    });
    return () => sub.remove();
  }, [refresh, readLedger]);

  if (restoring) return <Loading />;
  return (
    <>
      {address && loadedFor === address ? <Game /> : address ? <Loading /> : <ConnectScreen />}
      <Toast />
    </>
  );
}

function Loading() {
  return (
    <View style={st.loading} accessibilityLabel="Loading your empire">
      <Image source={UI_ART.logo} style={{ width: 220, height: 80 }} resizeMode="contain" />
      <ActivityIndicator color={C.gold} size="large" />
    </View>
  );
}

/** A render crash anywhere shows a way back instead of a white screen. */
class AppBoundary extends Component<{ children: ReactNode }, { error: string | null; key: number }> {
  state = { error: null as string | null, key: 0 };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  render() {
    if (this.state.error) {
      return (
        <View style={st.loading}>
          <Display size={28}>Something broke</Display>
          <Body style={{ textAlign: 'center', paddingHorizontal: 30 }}>
            Your cards, chests and streak are saved. Try again; if it keeps happening, restart the app.
          </Body>
          <Body size={11} color={C.dim} style={{ textAlign: 'center', paddingHorizontal: 30 }}>{this.state.error}</Body>
          <Btn label="TRY AGAIN" onPress={() => this.setState((s) => ({ error: null, key: s.key + 1 }))} style={{ width: 220 }} />
        </View>
      );
    }
    return <View key={this.state.key} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    LilitaOne_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_800ExtraBold,
  });
  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <LinearGradient colors={[C.blueLit, C.blue, C.blueDeep]} style={{ flex: 1 }}>
        <StatusBar style="light" />
        <AppBoundary><Root /></AppBoundary>
      </LinearGradient>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  offline: { backgroundColor: '#7a2236', paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 8, backgroundColor: 'rgba(9,22,48,0.55)',
    borderBottomWidth: 2, borderBottomColor: 'rgba(0,0,0,0.4)',
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 38, height: 38, borderRadius: 10, borderWidth: 2, borderColor: C.gold },
  tabs: {
    flexDirection: 'row', backgroundColor: C.woodDark, borderTopWidth: 3, borderTopColor: C.woodEdge,
    paddingTop: 6, paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderRadius: 12, minHeight: 56 },
  tabOn: { backgroundColor: 'rgba(255,196,34,0.18)' },
  dot: {
    position: 'absolute', top: 2, right: '28%', width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.red, borderWidth: 1.5, borderColor: '#fff',
  },
});
