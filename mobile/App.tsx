import { useEffect, useRef } from 'react';
import {
  Animated, AppState, BackHandler, Image, Pressable, StyleSheet, View,
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
import { useGame } from './src/state/game';
import { useUi, type Tab } from './src/state/ui';
import { findSgtMint, mainnetSkr } from './src/chain/seeker';
import { SKR_LIVE } from './src/chain/skr';
import { readClockIns, short } from './src/chain/solana';
import { COPIES_TO_LEVEL, MAX_LEVEL } from './src/game/rules';
import { ensureChannel, haptic } from './src/notify';
import { C } from './src/theme';
import { Body, Chip } from './src/ui/kit';
import { ConnectScreen } from './src/screens/Connect';
import { HomeScreen } from './src/screens/Home';
import { CardsScreen } from './src/screens/Cards';
import { DeckScreen } from './src/screens/Deck';
import { ShopScreen } from './src/screens/Shop';
import { CoachSheet } from './src/screens/Coach';
import { NativeArena } from './src/arena/NativeArena';
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
  const setWalletOpen = useUi((s) => s.setWalletOpen);
  const setTab = useUi((s) => s.setTab);
  return (
    <View style={[st.header, { paddingTop: insets.top + 6 }]}>
      <Pressable style={st.who} onPress={() => { haptic.tap(); setWalletOpen(true); }} accessibilityLabel="Wallet">
        <Image source={UI_ART.avatar_guest} style={st.avatar} />
        <View>
          <Body size={13} color="#fff" bold>{address ? short(address, 4) : '-'}</Body>
          <Body size={10} color={sgt ? C.teal : kind === 'dev' ? C.goldHi : C.dim} bold>
            {sgt ? 'SEEKER VERIFIED' : kind === 'dev' ? 'DEV WALLET' : 'MWA WALLET'}
          </Body>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Chip label="TROPHY" value={String(trophies)} color={C.gold} />
        <Chip label="SOL" value={sol === null ? '…' : sol.toFixed(2)} color={C.bluePale} onPress={() => setWalletOpen(true)} tag="devnet" />
        <Chip
          label="SKR"
          value={String(SKR_LIVE ? Math.floor(skr ?? 0) : skrSim)}
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
  const chestReady = useGame((s) => s.chests.some((c) => c.unlockAt !== null && c.unlockAt <= Date.now()));
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
    Animated.timing(v, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [tab, v]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: v,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [24 * dir, 0] }) }],
      }}
    >
      {tab === 'home' ? <HomeScreen /> : tab === 'cards' ? <CardsScreen /> : tab === 'deck' ? <DeckScreen /> : <ShopScreen />}
    </Animated.View>
  );
}

function Game() {
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
  return (
    <View style={{ flex: 1 }}>
      <Header />
      <Screens />
      <TabBar />
      <CoachSheet />
      <NativeArena />
      <ResultSheet />
      <RevealSheet />
      <WalletSheet />
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
    void ensureChannel();
  }, [restore]);

  useEffect(() => {
    if (address && loadedFor !== address) void load(address);
  }, [address, loadedFor, load]);

  // The streak lives on chain too: if this device is behind (reinstall, new
  // phone), adopt the latest signed Clock-In memo.
  const adoptChainStreak = useGame((s) => s.adoptChainStreak);
  const setChainLedger = useUi((s) => s.setChainLedger);
  useEffect(() => {
    if (!address || loadedFor !== address) return;
    void readClockIns(address).then((list) => {
      setChainLedger(list);
      if (list[0] && adoptChainStreak(list[0])) {
        useUi.getState().say(`Streak restored from Solana: day ${list[0].streak}`, 'ok');
      }
    }).catch(() => setChainLedger(null));
  }, [address, loadedFor, adoptChainStreak, setChainLedger]);

  // Seeker perks are a mainnet *read* for a real wallet; a dev key never has one.
  useEffect(() => {
    if (!address) return;
    if (kind !== 'mwa') { setSeeker({ sgt: null, mainnetSkr: null }); return; }
    void Promise.all([findSgtMint(address).catch(() => null), mainnetSkr(address).catch(() => null)])
      .then(([sgt, skr]) => setSeeker({ sgt, mainnetSkr: skr }));
  }, [address, kind, setSeeker]);

  // Coming back to the app is when balances and chest timers matter.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  if (restoring) return null;
  return (
    <>
      {address && loadedFor === address ? <Game /> : address ? null : <ConnectScreen />}
      <Toast />
    </>
  );
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
        <Root />
      </LinearGradient>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
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
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 12 },
  tabOn: { backgroundColor: 'rgba(255,196,34,0.18)' },
  dot: {
    position: 'absolute', top: 2, right: '28%', width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.red, borderWidth: 1.5, borderColor: '#fff',
  },
});
