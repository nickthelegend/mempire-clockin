import { useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import {
  Animated, Easing, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHAR_ART, FEATURE_ART, REWARD_ART, UI_ICON, GAME_BG, PREMIUM_UI } from '../data/cosmeticArt';
import { ARENA_THUMBS } from './Shop';
import { ALL_SKINS, PASS_PROGRAM, hasPremium, ownsSkin, passMint, usePassChain, SEASON_ID } from '../chain/pass';
import { clockStatePda, programLive, readClockState, readSessionRecord, type ClockState } from '../chain/clockin';
import { CLUSTER_LABEL, connection, explorerAddr, explorerTx, short } from '../chain/solana';
import { SKR_LIVE, SKR_MINT } from '../chain/skr';
import { ACTIONS_BASE, actionUrl, blinkUrl } from '../game/blink';
import { SEASON_WAR } from '../game/board';
import { useDuels } from '../state/duels';
import { useGame } from '../state/game';
import { useIdentity } from '../state/identity';
import { useUi } from '../state/ui';
import { useWar } from '../state/war';
import { useSession } from '../wallet/sessionKey';
import { useWallet } from '../wallet/wallet';
import { haptic } from '../notify';
import { reduceMotion } from '../motion';
import { C, R } from '../theme';
import { Body, Btn, Display, PressScale, SkrIcon, Ribbon } from '../ui/kit';
import { DriftBackground } from '../ui/Backdrop';

/**
 * "Chain Powers": every Solana feature Mempire uses, as a trophy room of
 * collectible power cards. Each card's state comes from a live read on the
 * current cluster (the same sources as before: SIWS proof, SessionRecord,
 * ClockInState, chest commits, Token-2022 holdings, SKR balance, duel and war
 * history, the Blink endpoint, the Seeker checks). Tapping a card opens its
 * proof: a short transaction or account chip and an Explorer link. Nothing
 * here signs or sends anything.
 */
type PowerState = 'active' | 'locked' | 'loading' | 'offline';

interface Proof { label: string; url: string }
interface Power {
  key: string;
  name: string;
  art: ImageSourcePropType;
  benefit: string;
  /** Rarity border: two colours, top to bottom. */
  rim: [string, string];
  state: PowerState;
  about: string;
  proofs: Proof[];
  /** The SKR card's balance as a big number. */
  amount?: string;
}

const RIM = {
  legendary: ['#7cf6d8', '#12a88a'] as [string, string],
  epic: ['#c77dff', '#6a2fb5'] as [string, string],
  rare: ['#59a6f5', '#1d4f9a'] as [string, string],
  gold: ['#ffd766', '#c8890b'] as [string, string],
  skr: ['#d8ff6a', '#6f8f00'] as [string, string],
};

function usePulse(on: boolean): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on || reduceMotion()) { v.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [on, v]);
  return v;
}

/** Shimmer block shown while a power's live read is in flight. */
function Shimmer({ w, h, radius = 8 }: { w: number; h: number; radius?: number }) {
  const v = usePulse(true);
  return <Animated.View style={{ width: w, height: h, borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.14)', opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] }) }} />;
}

function Seal({ state }: { state: PowerState }) {
  const pulse = usePulse(state === 'active');
  if (state === 'loading') return <Shimmer w={78} h={26} radius={13} />;
  if (state === 'locked') {
    return (
      <View style={[st.seal, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,255,255,0.18)' }]}>
        <Image source={UI_ICON.lock} style={{ width: 16, height: 16 }} />
        <Body size={11} bold color={C.dim}>LOCKED</Body>
      </View>
    );
  }
  if (state === 'offline') {
    return (
      <View style={[st.seal, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,77,109,0.5)' }]}>
        <Body size={11} bold color="#ffb3c0">OFFLINE</Body>
      </View>
    );
  }
  return (
    <Animated.View style={[st.seal, { backgroundColor: 'rgba(20,241,149,0.16)', borderColor: C.teal, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}>
      <Image source={PREMIUM_UI.stamp} style={{ width: 24, height: 24, marginLeft: -6 }} resizeMode="contain" />
      <Body size={11} bold color={C.teal}>ACTIVE</Body>
    </Animated.View>
  );
}

function PowerCard({ p, width, onOpen }: { p: Power; width: number; onOpen: () => void }) {
  const dim = p.state === 'locked' || p.state === 'offline';
  const art = Math.round(Math.min(84, width * 0.5));
  return (
    <PressScale onPress={() => { haptic.tap(); onOpen(); }} accessibilityLabel={`${p.name}. ${p.benefit}. ${p.state === 'loading' ? 'Loading' : p.state}`} style={{ width }}>
      <LinearGradient colors={dim ? ['#5d6a85', '#2b3550'] : p.rim} style={st.rim}>
        <LinearGradient colors={['#173a7a', '#0d2350']} style={st.card}>
          {p.key === 'skr' ? <View style={st.ribbon}><Body size={9} bold color={C.ink}>{CLUSTER_LABEL.toUpperCase()}</Body></View> : null}
          <View style={[st.glow, { width: art * 1.25, height: art * 1.25, borderRadius: art, backgroundColor: dim ? 'rgba(255,255,255,0.04)' : `${p.rim[0]}33` }]}>
            {p.state === 'loading' && p.key !== 'skr'
              ? <Shimmer w={art} h={art} radius={art / 2} />
              : <Image source={p.art} style={{ width: art, height: art, opacity: dim ? 0.4 : 1 }} resizeMode="contain" />}
          </View>
          <Display size={17} style={{ textAlign: 'center' }}>{p.name}</Display>
          {p.key === 'skr' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SkrIcon size={22} />
              {p.amount !== undefined ? <Display size={24} color={C.skr}>{p.amount}</Display>
                : p.state === 'loading' ? <Shimmer w={54} h={22} /> : <Display size={24} color={C.dim}>–</Display>}
            </View>
          ) : (
            <Body size={12} color={C.dim} style={{ textAlign: 'center' }} numberOfLines={2}>{p.benefit}</Body>
          )}
          <Seal state={p.state} />
        </LinearGradient>
      </LinearGradient>
    </PressScale>
  );
}

function PowerSheet({ p, onClose }: { p: Power | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!p) return;
    y.setValue(1);
    Animated.timing(y, { toValue: 0, duration: reduceMotion() ? 0 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [p, y]);
  if (!p) return null;
  const primary = p.proofs[0];
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: C.scrim }]} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View style={[st.sheet, { transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 700] }) }] }]}>
        <LinearGradient colors={['#1d4a96', '#0b1f47']} style={[st.sheetInner, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={st.grab} />
          <View style={[st.glow, { width: 130, height: 130, borderRadius: 65, backgroundColor: `${p.rim[0]}33`, alignSelf: 'center' }]}>
            <Image source={p.art} style={{ width: 110, height: 110 }} resizeMode="contain" />
          </View>
          <Display size={26} style={{ textAlign: 'center' }}>{p.name}</Display>
          <View style={{ alignSelf: 'center' }}><Seal state={p.state} /></View>
          <Body size={14} color="#fff" style={{ textAlign: 'center', lineHeight: 20 }}>{p.about}</Body>
          {p.proofs.length ? (
            <View style={st.proof}>
              <Body size={11} bold color={C.goldHi}>PROOF ON SOLANA {CLUSTER_LABEL.toUpperCase()}</Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {p.proofs.map((x) => (
                  <Pressable key={x.url} onPress={() => void Linking.openURL(x.url)} accessibilityRole="link" accessibilityLabel={x.label} style={st.chip} hitSlop={6}>
                    <Body size={12} bold color={C.teal}>{x.label}</Body>
                  </Pressable>
                ))}
              </View>
              {primary ? <Btn label={primary.url.includes('explorer.solana.com') ? 'VIEW ON EXPLORER' : 'OPEN'} tone="blue" size="sm" onPress={() => void Linking.openURL(primary.url)} /> : null}
            </View>
          ) : null}
          <Btn label="CLOSE" tone="ghost" size="sm" onPress={onClose} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export function OnChainSheet() {
  const open = useUi((s) => s.onchainOpen);
  const setOpen = useUi((s) => s.setOnchain);
  const address = useWallet((s) => s.address);
  const signIn = useWallet((s) => s.signIn);
  const kind = useWallet((s) => s.kind);
  const skr = useWallet((s) => s.skr);
  const session = useSession((s) => s.cur);
  const pc = usePassChain();
  const chests = useGame((s) => s.chests);
  const warSide = useGame((s) => s.warSide);
  const war = useWar((s) => s.board);
  const warErr = useWar((s) => s.error);
  const duels = useDuels((s) => s.board);
  const duelsLoaded = useDuels((s) => s.loadedAt);
  const duelsErr = useDuels((s) => s.error);
  const sgt = useUi((s) => s.sgt);
  const sgtChecked = useUi((s) => s.sgtChecked);
  const skrName = useIdentity((s) => (address ? s.names[address] : undefined));
  const [live, setLive] = useState<boolean | null>(null);
  const [state, setState] = useState<ClockState | null | undefined>(undefined);
  /** The Clock-In record read failed (RPC unreachable or rate-limited): not "no record". */
  const [stateErr, setStateErr] = useState(false);
  const [passBlink, setPassBlink] = useState<'on' | 'off' | 'err' | null>(null);
  /** This phone's session key has a SessionRecord here? (undefined = the read failed) */
  const [record, setRecord] = useState<boolean | null | undefined>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  /** A read still in flight after this long is shown as offline, never as an endless shimmer. */
  const [slow, setSlow] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!open || !address) return;
    let gone = false;
    setSheet(null);
    setSlow(false);
    const slowTimer = setTimeout(() => { if (!gone) setSlow(true); }, 20_000);
    void useWallet.getState().refresh();
    void programLive(connection).then((ok) => { if (!gone) setLive(ok); }).catch(() => {});
    const key = useSession.getState().cur?.session;
    setRecord(null);
    if (key) void readSessionRecord(connection, address, key).then((r) => { if (!gone) setRecord(!!r); }).catch(() => { if (!gone) setRecord(undefined); });
    setStateErr(false);
    void readClockState(connection, address).then((s) => { if (!gone) setState(s); }).catch(() => { if (!gone) { setState(undefined); setStateErr(true); } });
    void usePassChain.getState().refresh(address);
    if (!useWar.getState().board) void useWar.getState().refresh();
    if (!useDuels.getState().loadedAt) void useDuels.getState().refresh();
    if (!useIdentity.getState().names[address]) void useIdentity.getState().resolve(address).catch(() => null);
    void fetch(`${ACTIONS_BASE}/api/actions/season-pass`).then((r) => r.json()).then((j: { disabled?: boolean }) => { if (!gone) setPassBlink(j.disabled ? 'off' : 'on'); }).catch(() => { if (!gone) setPassBlink('err'); });
    return () => { gone = true; clearTimeout(slowTimer); };
  }, [open, address]);

  if (!address) return null;
  const owner = new PublicKey(address);
  const commit = [...chests].reverse().find((c) => c.commit?.commitSig)?.commit;
  const myChallenges = duels.filter((d) => d.signer === address && d.memo.kind === 'challenge').map((d) => d.sig);
  const heldSkins = ALL_SKINS.filter((s) => ownsSkin(pc, s.id));
  const passState: PowerState = pc.status === 'live' ? 'active' : pc.status === 'offline' ? 'offline' : pc.status === 'preview' ? 'locked' : 'loading';

  const powers: Power[] = [
    {
      key: 'siws', name: kind === 'mwa' ? 'Seed Vault Login' : 'Wallet Login', art: FEATURE_ART.siws, rim: RIM.rare,
      benefit: 'Prove the wallet is yours',
      state: signIn ? 'active' : 'locked',
      about: kind === 'mwa'
        ? 'You signed a Sign In With Solana message in your wallet (Seed Vault on a Seeker). The signature is checked on this phone, and nothing is sent on chain.'
        : 'Your dev wallet signed the Sign In With Solana message, and the signature was checked on this phone. On a Seeker the same message is signed in Seed Vault.',
      proofs: [],
    },
    {
      key: 'session', name: 'Approve Once', art: FEATURE_ART.session, rim: RIM.epic,
      benefit: 'Play all week, sign once',
      state: !session ? 'locked' : record === true ? 'active' : record === false ? 'locked' : record === undefined ? 'offline' : live === false ? 'active' : 'loading',
      about: 'One approval links a session key on this phone for 7 days. The mempire_pass program checks its on-chain record on every Clock-In, so daily play needs no wallet prompt.',
      proofs: session ? [{ label: `key ${short(session.session)}`, url: explorerAddr(session.session) }, { label: `link ${short(session.linkSig)}`, url: explorerTx(session.linkSig) }] : [],
    },
    {
      key: 'clockin', name: 'Daily Clock-In', art: FEATURE_ART.clockin, rim: RIM.gold,
      benefit: 'Your streak, kept on chain',
      state: state ? 'active' : state === null ? 'locked' : stateErr ? 'offline' : 'loading',
      about: state
        ? `Streak ${state.streak}, best ${state.best}, ${state.total} Clock-In${state.total === 1 ? '' : 's'}. The program computes the day and the streak itself, so nobody can fake one.`
        : 'Each Clock-In updates a record the program owns. Your first one creates it.',
      proofs: [{ label: `record ${short(clockStatePda(owner).toBase58())}`, url: explorerAddr(clockStatePda(owner).toBase58()) }],
    },
    {
      key: 'chests', name: 'Fair Chests', art: FEATURE_ART.commit, rim: RIM.legendary,
      benefit: 'Loot sealed before it rolls',
      state: commit ? 'active' : 'locked',
      about: 'Every chest is committed on chain to a block that does not exist yet. When you open it, tap Verify to recompute the roll from that block yourself.',
      proofs: commit?.commitSig ? [{ label: `commit ${short(commit.commitSig)}`, url: explorerTx(commit.commitSig) }] : [],
    },
    {
      key: 'pass', name: 'Season Pass', art: REWARD_ART.pass, rim: RIM.gold,
      benefit: 'Premium rewards all season',
      state: passState === 'active' ? (hasPremium(pc) ? 'active' : 'locked') : passState,
      about: 'A soulbound Token-2022 pass: it cannot be transferred or sold, and it unlocks the premium reward track. Ownership is read from your token balance only.',
      proofs: [{ label: `pass ${short(passMint(SEASON_ID).toBase58())}`, url: explorerAddr(passMint(SEASON_ID).toBase58()) }, { label: 'program', url: explorerAddr(PASS_PROGRAM.toBase58()) }],
    },
    {
      key: 'skins', name: 'Skins', art: ARENA_THUMBS.neon, rim: RIM.epic,
      benefit: heldSkins.length ? `${heldSkins.length} of ${ALL_SKINS.length} collected` : 'Restyle your arena',
      state: passState === 'active' ? (heldSkins.length ? 'active' : 'locked') : passState,
      about: 'Arena skins and card frames are Token-2022 tokens bought with SKR. What you own is read from your wallet every time; cosmetic only.',
      proofs: pc.chain ? heldSkins.slice(0, 3).map((s) => ({ label: s.name, url: explorerAddr(pc.chain!.skins[s.id].mint.toBase58()) })) : [],
    },
    {
      key: 'skr', name: 'SKR', art: REWARD_ART.skr, rim: RIM.skr,
      benefit: 'Earned every Clock-In',
      amount: skr === null ? undefined : Math.floor(skr).toLocaleString(),
      state: !SKR_LIVE ? 'locked' : skr === null ? 'loading' : 'active',
      about: 'The game currency: a devnet stand-in for SKR with the same decimals and token program. Clock-Ins and quests mint it; the shop and the pass spend it. Real SKR stays on mainnet.',
      proofs: SKR_MINT ? [{ label: `mint ${short(SKR_MINT.toBase58())}`, url: explorerAddr(SKR_MINT.toBase58()) }] : [],
    },
    {
      key: 'duels', name: 'Ghost Duels', art: FEATURE_ART.ghostduel, rim: RIM.rare,
      benefit: 'Fight friends while they sleep',
      state: duelsLoaded ? (myChallenges.length ? 'active' : 'locked') : duelsErr ? 'offline' : 'loading',
      about: 'Send any native-arena match as a ghost. A friend fights your exact deploys later, and the result goes on chain with a hash anyone can re-simulate.',
      proofs: myChallenges.slice(0, 2).map((s) => ({ label: `challenge ${short(s)}`, url: explorerTx(s) })),
    },
    {
      key: 'war', name: 'Season War', art: FEATURE_ART.war, rim: RIM.gold,
      benefit: warSide ? `Fighting for $${warSide}` : 'Pick a side, swing the war',
      state: war ? (warSide ? 'active' : 'locked') : warErr ? 'offline' : 'loading',
      about: `${SEASON_WAR.title}: every Clock-In you sign carries your pledge, and every phone tallies the war from chain${war ? ` (${SEASON_WAR.sides.map((s) => `$${s} ${war.sides[s]?.clockIns ?? 0}`).join(' · ')})` : ''}.`,
      proofs: [],
    },
    {
      key: 'blinks', name: 'Blinks', art: FEATURE_ART.blink, rim: RIM.legendary,
      benefit: 'Challenges anyone can sign',
      state: passBlink === null ? 'loading' : passBlink === 'err' ? 'offline' : 'active',
      about: 'Share a challenge or the Season Pass as a Solana Action. Anyone can open it in a Blink-aware wallet or on dial.to and sign it on devnet.',
      proofs: [{ label: 'challenge Blink', url: blinkUrl(1) }, { label: 'action', url: actionUrl(1) }, { label: 'actions.json', url: `${ACTIONS_BASE}/actions.json` }],
    },
    {
      key: 'seeker', name: 'Seeker Perks', art: FEATURE_ART.seeker, rim: RIM.legendary,
      benefit: sgt ? 'Double SKR every Clock-In' : skrName ?? 'Double SKR on a Seeker',
      state: sgt ? 'active' : sgtChecked ? 'locked' : 'loading',
      about: `Seeker Genesis Token holders earn double SKR on every Clock-In, and a .skr name shows instead of an address${skrName ? ` (${skrName})` : ''}. Both are read-only mainnet checks.`,
      proofs: sgt ? [{ label: 'Genesis Token', url: `https://explorer.solana.com/address/${sgt}` }] : [],
    },
  ];

  if (slow) for (const p of powers) if (p.state === 'loading') p.state = 'offline';
  const total = powers.length;
  const active = powers.filter((p) => p.state === 'active').length;
  const pad = 14;
  const gap = 10;
  const cardW = Math.floor((Math.min(width, 560) - pad * 2 - gap) / 2);
  const openPower = powers.find((p) => p.key === sheet) ?? null;

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => (sheet ? setSheet(null) : setOpen(false))}>
      <View style={st.wrap}>
        <DriftBackground source={GAME_BG.home} dim={0.5} />
        <ScrollView contentContainerStyle={{ padding: pad, gap: 14, paddingTop: insets.top + 8, paddingBottom: 60, alignItems: 'center' }}>
          <View style={{ alignSelf: 'stretch', alignItems: 'flex-end', marginBottom: -40, zIndex: 2 }}>
            <Btn label="✕" tone="ghost" size="sm" onPress={() => setOpen(false)} />
          </View>
          <View style={st.hero}>
            <View style={st.heroGlow} />
            <Image source={CHAR_ART.trophy} style={{ width: 150, height: 150 }} resizeMode="contain" accessibilityLabel="Season 1 trophy" />
          </View>
          <Ribbon text="Chain Powers" tone="gold" size={28} />
          <Body size={14} color={C.dim} style={{ textAlign: 'center', marginTop: -8 }}>
            {active} of {total} powers active on Solana
          </Body>
          <View style={st.bar} accessibilityLabel={`${active} of ${total} powers active`}>
            <LinearGradient colors={[C.goldHi, C.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${(active / total) * 100}%`, height: '100%', borderRadius: 7 }} />
          </View>
          <View style={[st.grid, { width: cardW * 2 + gap, gap }]}>
            {powers.map((p) => <PowerCard key={p.key} p={p} width={cardW} onOpen={() => setSheet(p.key)} />)}
          </View>
          <Body size={11} color={C.dim} style={{ textAlign: 'center' }}>Tap a power to see its proof on chain. Nothing here signs or sends anything.</Body>
        </ScrollView>
        <PowerSheet p={openPower} onClose={() => setSheet(null)} />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1a3d' },
  hero: { width: 220, height: 170, alignItems: 'center', justifyContent: 'center' },
  heroGlow: {
    position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,196,34,0.18)',
    shadowColor: C.gold, shadowOpacity: 0.9, shadowRadius: 40, shadowOffset: { width: 0, height: 0 },
  },
  bar: { alignSelf: 'stretch', height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.5)', overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  rim: { borderRadius: R.panel, padding: 3 },
  card: { borderRadius: R.panel - 3, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', gap: 6, minHeight: 228, justifyContent: 'space-between' },
  glow: { alignItems: 'center', justifyContent: 'center' },
  seal: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 13, borderWidth: 1.5, paddingHorizontal: 10, height: 26 },
  check: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' },
  ribbon: { position: 'absolute', top: 10, right: 0, backgroundColor: C.skr, paddingHorizontal: 7, paddingVertical: 2, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheetInner: { borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, padding: 18, paddingTop: 10, gap: 12, borderTopWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  proof: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: R.card, padding: 12, gap: 10 },
  chip: { borderRadius: 10, borderWidth: 1.5, borderColor: C.teal, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(20,241,149,0.08)' },
});
