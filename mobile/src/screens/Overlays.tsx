import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CHESTS } from '../game/rules';
import { WIN_SKR } from '../game/actions';
import { airdrop, explorerAddr, explorerTx, short } from '../chain/solana';
import { SKR_LABEL, SKR_LIVE } from '../chain/skr';
import { useGame } from '../state/game';
import { useUi } from '../state/ui';
import { useWallet, walletLabel } from '../wallet/wallet';
import { haptic } from '../notify';
import { C, F, TIER_COLORS } from '../theme';
import { Body, Btn, CardTile, ChestArt, Display, Panel, Tag, Well } from '../ui/kit';

/** Chest opening: shake, burst, then the fighters land one by one. */
export function RevealSheet() {
  const reveal = useUi((s) => s.reveal);
  const show = useUi((s) => s.showReveal);
  const cards = useGame((s) => s.cards);
  const shake = useRef(new Animated.Value(0)).current;
  const [opened, setOpened] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!reveal) return undefined;
    setOpened(false); setShown(0);
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 520, easing: Easing.linear, useNativeDriver: true }),
    ]).start(() => { setOpened(true); haptic.heavy(); });
    return undefined;
  }, [reveal, shake]);

  useEffect(() => {
    if (!opened || !reveal || shown >= reveal.drops.length) return undefined;
    const t = setTimeout(() => { setShown((n) => n + 1); haptic.light(); }, 260);
    return () => clearTimeout(t);
  }, [opened, shown, reveal]);

  if (!reveal) return null;
  const rot = shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: ['0deg', '-8deg', '8deg', '-6deg', '6deg', '0deg'] });
  const [glowA] = TIER_COLORS[reveal.tier];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => show(null)}>
      <View style={st.center}>
        <Display size={28} color={glowA}>{reveal.title}</Display>
        {!opened ? (
          <Animated.View style={{ transform: [{ rotate: rot }, { scale: shake.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }}>
            <ChestArt tier={reveal.tier} size={180} />
          </Animated.View>
        ) : (
          <View style={st.drops}>
            {reveal.drops.slice(0, shown).map((d) => (
              <View key={d.ticker} style={{ alignItems: 'center', gap: 4 }}>
                <CardTile ticker={d.ticker} owned={cards[d.ticker]} width={88} />
                <Tag text={d.fresh ? 'NEW!' : `+${d.copies} ${d.copies === 1 ? 'copy' : 'copies'}`} color={d.fresh ? C.gold : C.teal} />
              </View>
            ))}
          </View>
        )}
        {opened && shown >= reveal.drops.length ? (
          <Btn label="COLLECT" size="lg" style={{ width: 240, marginTop: 20 }} onPress={() => show(null)} />
        ) : null}
      </View>
    </Modal>
  );
}

export function ResultSheet() {
  const r = useUi((s) => s.result);
  const show = useUi((s) => s.showResult);
  const setTab = useUi((s) => s.setTab);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!r) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 12 }).start();
  }, [r, pop]);
  if (!r) return null;
  const title = r.draw ? 'DRAW' : r.won ? 'VICTORY' : 'DEFEAT';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => show(null)}>
      <View style={st.center}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Display size={54} color={r.won ? C.gold : r.draw ? '#fff' : C.red}>{title}</Display>
        </Animated.View>
        <Body size={15} color="#fff">vs {r.rival}</Body>
        <Panel style={{ width: '88%', marginTop: 18 }}>
          <View style={st.row}><Body color={C.dimOnWood}>Crowns</Body><Display size={20}>{r.crowns[0]} – {r.crowns[1]}</Display></View>
          <View style={st.row}><Body color={C.dimOnWood}>Trophies</Body><Display size={20} color={r.trophyDelta > 0 ? C.teal : r.trophyDelta < 0 ? C.red : "#fff"}>{r.trophyDelta > 0 ? '+' : ''}{r.trophyDelta}</Display></View>
          {r.won ? (
            <View style={st.row}>
              <Body color={C.dimOnWood}>{SKR_LABEL}</Body>
              <Display size={20} color={C.skr}>+{WIN_SKR}</Display>
            </View>
          ) : null}
          {r.skrSig ? (
            <Pressable onPress={() => void Linking.openURL(explorerTx(r.skrSig!))}><Tag text={`minted ${short(r.skrSig)} ↗`} /></Pressable>
          ) : r.won && SKR_LIVE ? <Body size={11} color={C.dimOnWood}>SKR is owed until your wallet can pay the devnet fee — claim it in the Shop.</Body> : null}
          {r.chest ? (
            <View style={[st.row, { marginTop: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ChestArt tier={r.chest} size={44} />
                <Body color="#fff" bold>{CHESTS[r.chest].name}</Body>
              </View>
              <Tag text="ADDED" color={C.gold} />
            </View>
          ) : r.won ? <Body size={12} color={C.goldHi}>Chest slots full — open one to make room.</Body> : null}
        </Panel>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, width: '88%' }}>
          <Btn label="HOME" tone="ghost" style={{ flex: 1 }} onPress={() => { show(null); setTab('home'); }} />
          <Btn label="DECK" tone="blue" style={{ flex: 1 }} onPress={() => { show(null); setTab('deck'); }} />
        </View>
      </View>
    </Modal>
  );
}

export function WalletSheet() {
  const open = useUi((s) => s.walletOpen);
  const setOpen = useUi((s) => s.setWalletOpen);
  const say = useUi((s) => s.say);
  const sgt = useUi((s) => s.sgt);
  const { kind, address, sol, skr, refresh, disconnect } = useWallet();
  const unload = useGame((s) => s.unload);
  const [busy, setBusy] = useState(false);
  if (!open || !address) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={{ flex: 1, backgroundColor: C.scrim }} onPress={() => setOpen(false)} />
      <View style={st.sheet}>
        <Panel>
          <View style={st.row}>
            <Display size={22}>Wallet</Display>
            <Tag text={kind === 'dev' ? 'DEVNET ONLY' : sgt ? 'SEEKER VERIFIED' : 'MWA'} color={kind === 'dev' ? C.goldHi : C.teal} />
          </View>
          <Body color={C.dimOnWood}>{walletLabel(kind)}</Body>
          <Pressable onPress={() => { void Clipboard.setStringAsync(address); haptic.tap(); say('Address copied'); }}>
            <Well style={{ marginVertical: 10 }}>
              <Text selectable style={{ fontFamily: F.ui, color: '#fff', fontSize: 13 }}>{address}</Text>
              <Body size={11} color={C.dim}>tap to copy</Body>
            </Well>
          </Pressable>
          <View style={st.row}><Body color={C.dimOnWood}>Devnet SOL</Body><Display size={18}>{sol === null ? '…' : sol.toFixed(4)}</Display></View>
          <View style={st.row}><Body color={C.dimOnWood}>{SKR_LABEL}</Body><Display size={18} color={C.skr}>{SKR_LIVE ? (skr ?? 0) : useGame.getState().skrSim}</Display></View>
          <View style={{ gap: 8, marginTop: 10 }}>
            <Btn
              label="GET DEVNET SOL"
              sub="public faucet — often rate-limited"
              tone="blue"
              size="sm"
              busy={busy}
              onPress={async () => {
                setBusy(true);
                try { await airdrop(address, 0.5); await refresh(); say('0.5 devnet SOL received', 'ok'); } catch (e) { say(e instanceof Error ? e.message : String(e), 'err'); } finally { setBusy(false); }
              }}
            />
            <Btn label="VIEW ON EXPLORER" tone="ghost" size="sm" onPress={() => void Linking.openURL(explorerAddr(address))} />
            <Btn label="SIGN OUT" tone="ghost" size="sm" onPress={() => { setOpen(false); unload(); void disconnect(); }} />
          </View>
        </Panel>
      </View>
    </Modal>
  );
}

export function Toast() {
  const toast = useUi((s) => s.toast);
  const v = useRef(new Animated.Value(0)).current;
  const [text, setText] = useState<typeof toast>(null);
  useEffect(() => {
    if (!toast) return undefined;
    setText(toast);
    if (toast.tone === 'err') haptic.error();
    v.setValue(0);
    Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: true }),
      Animated.delay(toast.tone === 'err' ? 4200 : 2600),
      Animated.timing(v, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    return undefined;
  }, [toast, v]);
  if (!text) return null;
  const bg = text.tone === 'ok' ? '#0f6b4a' : text.tone === 'err' ? '#8a1f35' : C.ink;
  return (
    <Animated.View
      pointerEvents="none"
      style={[st.toast, { backgroundColor: bg, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] }]}
    >
      <Body color="#fff" bold size={13}>{text.text}</Body>
    </Animated.View>
  );
}


const st = StyleSheet.create({
  center: { flex: 1, backgroundColor: 'rgba(6,16,38,0.94)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  drops: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 3 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 30 },
  toast: {
    position: 'absolute', top: 58, left: 16, right: 16, borderRadius: 14, padding: 12,
    borderWidth: 2, borderColor: 'rgba(0,0,0,0.4)', zIndex: 50,
  },
});
