import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, AppState, BackHandler, Image, Linking, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
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
import { readFullLedger, useSession } from './src/wallet/sessionKey';
import { useGame } from './src/state/game';
import { ftueDone, loadRendererPref, useUi, type Tab } from './src/state/ui';
import { useNet } from './src/state/net';
import { Intro } from './src/screens/Intro';
import { initSound } from './src/sound';
import { reduceMotion, useCountUp, EASE_OUT } from './src/motion';
import { streakState } from './src/game/rules';
import { findSgtMint, mainnetSkr } from './src/chain/seeker';
import { SKR_LIVE } from './src/chain/skr';
import { readClockIns, short } from './src/chain/solana';
import { COPIES_TO_LEVEL, MAX_LEVEL } from './src/game/rules';
import { commitPendingChests, prepareMatch } from './src/game/actions';
import { setPerf } from './src/arena/perf';
import { ensureChannel, ensureStreakReminder, haptic } from './src/notify';
import { C } from './src/theme';
import { Body, Btn, Display } from './src/ui/kit';
import { CHAR_ART, GAME_BG, ITEM_ART, NAV_ART } from './src/data/cosmeticArt';
import { Hero } from './src/ui/Backdrop';
import { ConnectScreen } from './src/screens/Connect';
import { HomeScreen } from './src/screens/Home';
import { CardsScreen } from './src/screens/Cards';
import { DeckScreen } from './src/screens/Deck';
import { ShopScreen } from './src/screens/Shop';
import { DuelsScreen } from './src/screens/Duels';
import { useDuels } from './src/state/duels';
import { CoachSheet } from './src/screens/Coach';
import { SeasonPassSheet } from './src/screens/SeasonPass';
import { BoardSheet } from './src/screens/Board';
import { OnChainSheet } from './src/screens/OnChain';
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

const TABS: { id: Tab; label: string; icon: ImageSourcePropType }[] = [
  { id: 'home', label: 'Home', icon: NAV_ART.home },
  { id: 'cards', label: 'Cards', icon: NAV_ART.deck },
  { id: 'deck', label: 'Deck', icon: NAV_ART.battle },
  { id: 'duels', label: 'Duels', icon: NAV_ART.duels },
  { id: 'shop', label: 'Shop', icon: NAV_ART.shop },
];

function Header() {
  const insets = useSafeAreaInsets();
  const address = useWallet((s) => s.address);
  const kind = useWallet((s) => s.kind);
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
        <Image source={UI_ART.avatar_guest} style={[st.avatar, { borderColor: siws ? C.gold : C.dim }]} />
        <View style={{ flexShrink: 1 }}>
          <Display size={15} color={who.skr ? C.teal : '#fff'} style={{ maxWidth: 140 }}>{who.label}</Display>
          {sgt ? <Body size={10} color={C.teal} bold>SEEKER</Body> : null}
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0, alignItems: 'center' }}>
        <NetIcon />
        <HudPill icon={CHAR_ART.trophy} value={String(shownTrophies)} label="Trophies" />
        <HudPill icon={ITEM_ART.coin} value={SKR_LIVE && skr === null ? null : String(shownSkr)} label="SKR" onPress={() => setTab('shop')} />
      </View>
    </View>
  );
}

/** A HUD counter: art badge overlapping a capsule; a shimmer until the value is known. */
function HudPill({ icon, value, label, onPress }: { icon: ImageSourcePropType; value: string | null; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress ? () => { haptic.tap(); onPress(); } : undefined} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label} ${value ?? 'loading'}`} style={({ pressed }) => [st.pill, pressed && { transform: [{ translateY: 2 }] }]}>
      <Image source={icon} style={st.pillIcon} resizeMode="contain" />
      {value === null ? <View style={st.pillShimmer} /> : <Text maxFontSizeMultiplier={1.15} style={st.pillText}>{value}</Text>}
    </Pressable>
  );
}

/** Network trouble is a small spinning cloud in the HUD, retried silently; never a banner. */
function NetIcon() {
  const status = useNet((s) => s.status);
  if (status !== 'busy' && status !== 'down') return null;
  return (
    <View style={st.net} accessibilityLabel={status === 'busy' ? 'Network busy, retrying' : 'Offline, retrying'}>
      <View style={st.cloud} />
      <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.7 }] }} />
    </View>
  );
}

/** Icon-only tab: the active one springs up 8 px, scales 1.15× and glows gold. */
function TabIcon({ icon, label, on, dot, onPress }: { icon: ImageSourcePropType; label: string; on: boolean; dot: boolean; onPress: () => void }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: on ? 1 : 0, friction: 6, tension: 140, useNativeDriver: true }).start();
  }, [on, v]);
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={onPress} style={st.tab} hitSlop={4}>
      <Animated.View style={[st.tabGlow, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]} />
      <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }}>
        <Animated.Image source={icon} style={{ width: 42, height: 42, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }} resizeMode="contain" />
        {dot ? <View style={st.dot} /> : null}
      </Animated.View>
      <Animated.View style={[st.tabUnderline, { opacity: v }]} />
    </Pressable>
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
          <TabIcon key={t.id} icon={t.icon} label={t.label} on={on} dot={dot} onPress={() => { if (!on) { haptic.tap(); setTab(t.id); } }} />
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
  const bg = tab === 'duels' ? GAME_BG.duels : tab === 'shop' ? GAME_BG.shop : GAME_BG.home;
  return (
    <View style={{ flex: 1 }}>
    <Hero source={bg} dim={tab === 'deck' || tab === 'cards' ? 0.45 : 0} />
    <Animated.View
      style={{
        flex: 1,
        opacity: v,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion() ? 0 : 24 * dir, 0] }) }],
      }}
    >
      {tab === 'home' ? <HomeScreen /> : tab === 'cards' ? <CardsScreen /> : tab === 'deck' ? <DeckScreen /> : tab === 'duels' ? <DuelsScreen /> : <ShopScreen />}
    </Animated.View>
    </View>
  );
}


let initialUrlConsumed = false;



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
  // Provably fair chests: every chest gets its target slot as soon as it is in the rail.
  useEffect(() => {
    void commitPendingChests();
    return useGame.subscribe((s, prev) => { if (s.chests !== prev.chests) void commitPendingChests(); });
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
      // Ghost duel: mempire://duel?c=<challenge signature>&d=<ghost payload>
      const duel = url && /^mempire:\/\/duel\?(.*)$/.exec(url);
      if (duel) {
        const q = new URLSearchParams(duel[1]);
        useUi.getState().setTab('duels');
        void useDuels.getState().openLink(q.get('c'), q.get('d'));
        return;
      }
      if (url === 'mempire://pass') { useUi.getState().setPass(true); return; }
      if (url === 'mempire://board') { useUi.getState().setBoard(true); return; }
      if (url === 'mempire://onchain') { useUi.getState().setOnchain(true); return; }
      const hit = url && /^mempire:\/\/battle(?:\?(.*))?$/.exec(url);
      if (!hit) return;
      const q = new URLSearchParams(hit[1] ?? '');
      const rival = Math.max(0, Math.min(3, Number(q.get('rival') ?? 1) || 0));
      const m = prepareMatch(rival, q.get('rush') === '1');
      const r = q.get('renderer');
      if (r === 'native' || r === 'web') { m.renderer = r; m.forcedRenderer = true; }
      if (q.get('perf') === '1') setPerf(true);
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
      <Screens />
      <TabBar />
      <CoachSheet />
      <SeasonPassSheet />
      <BoardSheet />
      <OnChainSheet />
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
    // Silent recovery: when the network comes back, re-read balances and holdings.
    const unsub = useNet.subscribe((n, prev) => {
      if (n.status === 'ok' && prev.status !== 'ok' && prev.status !== 'unknown') {
        void useWallet.getState().refresh();
        const a = useWallet.getState().address;
        if (a) void usePassChain.getState().refresh(a);
      }
    });
    return () => { clearInterval(t); unsub(); };
  }, [restore]);

  useEffect(() => {
    if (address && loadedFor !== address) void load(address);
  }, [address, loadedFor, load]);
  // This wallet's session key (approve once, play all week), if one is linked.
  useEffect(() => { void useSession.getState().load(address); }, [address]);

  // The streak lives on chain too: if this device is behind (reinstall, new
  // phone), adopt the latest signed Clock-In memo.
  const adoptChainStreak = useGame((s) => s.adoptChainStreak);
  const setChainLedger = useUi((s) => s.setChainLedger);
  const readLedger = useCallback(() => {
    if (!address || useGame.getState().address !== address) return;
    if (Array.isArray(useUi.getState().chainLedger)) return; // read once per session
    void readFullLedger(address).then((list) => {
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
      <LinearGradient colors={[C.bg, C.bg]} style={{ flex: 1 }}>
        <StatusBar style="light" />
        <AppBoundary><Root /></AppBoundary>
      </LinearGradient>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  offline: { backgroundColor: '#7a2236', paddingHorizontal: 14, paddingVertical: 6, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 8, backgroundColor: 'rgba(10,16,40,0.92)',
    borderBottomWidth: 2, borderBottomColor: 'rgba(0,0,0,0.4)',
  },
  // Shrinks first at large text sizes so the balance chips never leave the screen.
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, marginRight: 6 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, borderColor: C.gold },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(247,215,116,0.6)', height: 30, paddingRight: 12, paddingLeft: 28, minWidth: 64, marginLeft: 10 },
  pillIcon: { position: 'absolute', left: -10, width: 36, height: 36 },
  pillText: { fontFamily: 'LilitaOne_400Regular', fontSize: 16, color: '#fff' },
  pillShimmer: { width: 26, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.18)' },
  net: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  cloud: { position: 'absolute', width: 22, height: 12, borderRadius: 6, bottom: 8, backgroundColor: 'rgba(255,255,255,0.25)' },
  tabs: {
    flexDirection: 'row', backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: 'rgba(247,215,116,0.55)',
    paddingTop: 10, paddingHorizontal: 8, minHeight: 72,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 60 },
  tabGlow: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32, top: -8, backgroundColor: 'rgba(247,201,72,0.18)',
    shadowColor: C.gold, shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  tabUnderline: { position: 'absolute', bottom: 2, width: 18, height: 4, borderRadius: 2, backgroundColor: C.gold },
  dot: {
    position: 'absolute', top: -2, right: -4, width: 11, height: 11, borderRadius: 6,
    backgroundColor: C.red, borderWidth: 1.5, borderColor: '#fff',
  },
});
