import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CHESTS, rollChest } from '../game/rules';
import { WIN_SKR } from '../game/actions';
import { sfx, useSound } from '../sound';
import { EASE_IN_OUT, reduceMotion } from '../motion';
import { markFtue } from '../state/ui';
import { airdrop, connection, explorerAddr, explorerBlock, explorerTx, short } from '../chain/solana';
import { FAIR_LABEL, FORMULA, seededRand, verifyProof } from '../chain/fair';
import { Buffer } from 'buffer';
import { SKR_LABEL, SKR_LIVE } from '../chain/skr';
import { useGame } from '../state/game';
import { useUi, type Reveal } from '../state/ui';
import { lookupSkrOwner, useDisplayName, useIdentity } from '../state/identity';
import { recheckProof, signInLabel, useWallet, walletLabel } from '../wallet/wallet';
import { cancelChestReminders, haptic } from '../notify';
import { C, F, TIER_COLORS } from '../theme';
import { Body, Btn, CardTile, ChestArt, Display, Panel, Tag, Well } from '../ui/kit';
import { ShareCardButton } from './ShareCard';

/** Chest opening: shake, burst, then the fighters land one by one. */
export function RevealSheet() {
  const reveal = useUi((s) => s.reveal);
  const show = useUi((s) => s.showReveal);
  const cards = useGame((s) => s.cards);
  const shake = useRef(new Animated.Value(0)).current;
  const [opened, setOpened] = useState(false);
  const [shown, setShown] = useState(0);

  const sealing = !!reveal?.sealing;
  const dropsKey = reveal && !reveal.sealing ? reveal.drops : null;
  useEffect(() => {
    if (!reveal || reveal.sealing) return undefined;
    setOpened(false); setShown(0);
    shake.setValue(0);
    Animated.sequence([
      // Anticipation, then the burst: the shake builds for ~0.7 s so the
      // pop lands as a release, with sound and the heaviest haptic we have.
      Animated.timing(shake, { toValue: 1, duration: reduceMotion() ? 120 : 720, easing: EASE_IN_OUT, useNativeDriver: true }),
    ]).start(() => { setOpened(true); haptic.heavy(); sfx('chest'); });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropsKey, shake]);

  useEffect(() => {
    if (!opened || !reveal || shown >= reveal.drops.length) return undefined;
    const t = setTimeout(() => { setShown((n) => n + 1); haptic.light(); sfx('click'); }, shown === 0 ? 180 : 320);
    return () => clearTimeout(t);
  }, [opened, shown, reveal]);

  if (!reveal) return null;
  const rot = reduceMotion()
    ? shake.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '0deg'] })
    : shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: ['0deg', '-6deg', '7deg', '-8deg', '9deg', '0deg'] });
  const [glowA] = TIER_COLORS[reveal.tier];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => show(null)}>
      <View style={st.center}>
        <Display size={28} color={glowA}>{reveal.title}</Display>
        {sealing ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <ChestArt tier={reveal.tier} size={180} />
            <Body size={14} bold color="#fff">Sealing with Solana slot #{reveal.sealing!.targetSlot}</Body>
            <Body size={12} color={C.dim} style={{ textAlign: 'center', maxWidth: 300 }}>
              {reveal.sealing!.left > 0 ? `${reveal.sealing!.left} slots to go (~${Math.ceil(reveal.sealing!.left * 0.4)} s). ` : ''}
              This chest was committed to a slot that had not happened yet; its blockhash decides the drops.
            </Body>
          </View>
        ) : !opened ? (
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
        {opened && !sealing && shown >= reveal.drops.length ? (
          <>
            <FairPanel reveal={reveal} />
            <Btn label="COLLECT" size="lg" style={{ width: 240, marginTop: 14 }} onPress={() => show(null)} />
          </>
        ) : null}
      </View>
    </Modal>
  );
}

/** "Verify": the slot, blockhash, formula, and a recompute from chain. */
function FairPanel({ reveal }: { reveal: Reveal }) {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<{ state: 'idle' | 'busy' | 'ok' | 'bad'; text?: string }>({ state: 'idle' });
  const p = reveal.proof;
  if (!p) {
    return <Body size={11} color={C.dim} style={{ marginTop: 12, textAlign: 'center', maxWidth: 320 }}>{reveal.fairNote ?? 'Rolled on the device.'}</Body>;
  }
  const recompute = async () => {
    setCheck({ state: 'busy' });
    try {
      const v = await verifyProof(connection, p);
      if (!v.ok || !v.seedHex) { setCheck({ state: 'bad', text: v.blockhash ? 'Blockhash or seed differs from the chain.' : 'Could not fetch that slot right now.' }); return; }
      const owned = Object.fromEntries(p.owned.map((t) => [t, { level: 1, copies: 0 }]));
      const again = rollChest(reveal.tier, owned, seededRand(Uint8Array.from(Buffer.from(v.seedHex, 'hex'))));
      const same = JSON.stringify(again) === JSON.stringify(reveal.drops);
      setCheck(same
        ? { state: 'ok', text: `Recomputed from chain: blockhash of slot ${p.slot} → same seed → the same ${again.length} fighters.` }
        : { state: 'bad', text: 'The recomputed drops differ.' });
      if (same) haptic.success(); else haptic.error();
    } catch (e) {
      setCheck({ state: 'bad', text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <View style={{ width: '92%', marginTop: 12, gap: 6 }}>
      <Btn label={open ? 'HIDE PROOF' : 'VERIFY'} sub={FAIR_LABEL} tone="ghost" size="sm" onPress={() => setOpen(!open)} />
      {open ? (
        <Well style={{ gap: 4 }}>
          <View style={st.row}><Body size={11} color={C.dim}>Chest</Body><Body size={11} color="#fff" bold>{p.chestId}</Body></View>
          <View style={st.row}><Body size={11} color={C.dim}>Committed to slot</Body><Body size={11} color="#fff" bold>{p.targetSlot}</Body></View>
          <View style={st.row}>
            <Body size={11} color={C.dim}>Block used</Body>
            <Pressable onPress={() => void Linking.openURL(explorerBlock(p.slot))} hitSlop={10} accessibilityRole="link">
              <Tag text={`slot ${p.slot} ↗`} color={C.teal} />
            </Pressable>
          </View>
          <Body size={11} color={C.dim}>Blockhash</Body>
          <Text selectable style={st.mono}>{p.blockhash}</Text>
          <Body size={11} color={C.dim}>Seed</Body>
          <Text selectable style={st.mono}>{p.seedHex}</Text>
          <Text selectable style={[st.mono, { color: C.dim }]}>{FORMULA}; drops = the standard chest table fed by that stream</Text>
          <Btn label={check.state === 'ok' ? 'MATCHES ✓' : 'RECOMPUTE'} tone="blue" size="sm" busy={check.state === 'busy'} onPress={() => void recompute()} />
          {check.text ? <Body size={11} color={check.state === 'ok' ? C.teal : C.red}>{check.text}</Body> : null}
        </Well>
      ) : null}
    </View>
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
      <ScrollView style={st.scrim} contentContainerStyle={st.centerScroll}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Display size={54} color={r.won ? C.gold : r.draw ? '#fff' : C.red}>{title}</Display>
        </Animated.View>
        <Body size={15} color="#fff">vs {r.rival}</Body>
        <Body size={11} color={C.dim}>
          {r.renderer === 'native' ? 'Native 3D arena' : r.fellBack ? 'Web arena (switched from native)' : 'Web arena (compat)'}
        </Body>
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
            <Pressable onPress={() => void Linking.openURL(explorerTx(r.skrSig!))} hitSlop={14} accessibilityRole="link" accessibilityLabel="Open the SKR mint on Solana Explorer"><Tag text={`minted ${short(r.skrSig)} ↗`} /></Pressable>
          ) : r.won && SKR_LIVE ? <Body size={11} color={C.dimOnWood}>SKR is owed until your wallet can pay the devnet fee — claim it in the Shop.</Body> : null}
          {r.chest ? (
            <View style={[st.row, { marginTop: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ChestArt tier={r.chest} size={44} />
                <Body color="#fff" bold>{CHESTS[r.chest].name}</Body>
              </View>
              <Tag text={r.chestQueued ? 'WAITING' : 'ADDED'} color={C.gold} />
            </View>
          ) : null}
          {r.chestQueued || r.welcomeQueued ? (
            <Body size={12} color={C.goldHi}>Chest slots are full, so it is waiting. Open a chest and it moves in automatically.</Body>
          ) : null}
          {r.welcomeChest ? (
            <View style={[st.row, { marginTop: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ChestArt tier={r.welcomeChest} size={44} />
                <View>
                  <Body color="#fff" bold>Welcome chest</Body>
                  <Body size={11} color={C.dimOnWood}>For finishing your first battle</Body>
                </View>
              </View>
              <Tag text={r.welcomeQueued ? 'WAITING' : 'ADDED'} color={C.gold} />
            </View>
          ) : null}
          <Body size={11} color={C.dimOnWood} style={{ marginTop: 6 }}>
            {r.plays} card{r.plays === 1 ? '' : 's'} deployed · counts toward today's quest
          </Body>
        </Panel>
        {r.tutorial && r.welcomeChest ? (
          <Body size={13} color="#fff" style={{ width: '88%', textAlign: 'center', marginTop: 14 }}>
            {r.won ? 'First win! ' : ''}{r.welcomeQueued ? 'Your welcome chest is waiting for a free slot.' : 'Start your welcome chest on Home'}, then clock in for today's reward.
          </Body>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, width: '88%' }}>
          <Btn label="HOME" tone="ghost" style={{ flex: 1 }} onPress={() => { show(null); setTab('home'); }} />
          <Btn label="DECK" tone="blue" style={{ flex: 1 }} onPress={() => { show(null); setTab('deck'); }} />
        </View>
        <ShareCardButton r={r} />
      </ScrollView>
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
      <View style={[st.sheet, { maxHeight: '92%' }]}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        <Panel>
          <View style={st.row}>
            <Display size={22}>Wallet & settings</Display>
            <Tag text={kind === 'dev' ? 'DEVNET ONLY' : sgt ? 'SEEKER VERIFIED' : 'MWA'} color={kind === 'dev' ? C.goldHi : C.teal} />
          </View>
          <Body color={C.dimOnWood}>{walletLabel(kind)}</Body>
          <Pressable onPress={() => { void Clipboard.setStringAsync(address); haptic.tap(); say('Address copied'); }}>
            <Well style={{ marginVertical: 10 }}>
              <SkrLine address={address} kind={kind} />
              <Text selectable style={{ fontFamily: F.ui, color: '#fff', fontSize: 13 }}>{address}</Text>
              <Body size={11} color={C.dim}>tap to copy</Body>
            </Well>
          </Pressable>
          <SignInCard />
          <FindSeeker />
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
            <SoundSetting />
            <RendererSetting />
            <Btn label="REPLAY THE INTRO" tone="ghost" size="sm" onPress={() => { markFtue(false); setOpen(false); useUi.getState().setIntro(true); }} />
            <Btn label="SIGN OUT" tone="ghost" size="sm" onPress={() => { setOpen(false); void cancelChestReminders(address); unload(); void disconnect(); }} />
          </View>
        </Panel>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** The player's .skr name (mainnet, read-only), or why there is none. */
function SkrLine({ address, kind }: { address: string; kind: string | null }) {
  const who = useDisplayName(address);
  const known = useIdentity((s) => s.names[address] !== undefined);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      {who.skr ? <Display size={20} color={C.teal}>{who.skr}</Display> : null}
      <Body size={11} color={C.dim} style={{ flex: 1 }}>
        {who.skr ? 'your .skr name · AllDomains, mainnet'
          : !known ? 'looking up your .skr name on mainnet…'
          : kind === 'dev' ? 'no .skr: a dev wallet is not a Seeker wallet'
          : 'no .skr name for this wallet · the address is shown instead'}
      </Body>
    </View>
  );
}

/** Find a Seeker: alice.skr → address, and back (both mainnet reads). */
function FindSeeker() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ owner: string; name: string | null; asked: string } | 'none' | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const v = q.trim();
    if (!v) return;
    setBusy(true); setRes(null);
    try {
      if (/\.skr$/i.test(v) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) {
        const owner = await lookupSkrOwner(v);
        if (!owner) { setRes('none'); return; }
        // round trip: the owner's own primary .skr, resolved the reverse way
        setRes({ owner, name: await useIdentity.getState().resolve(owner), asked: v.toLowerCase().replace(/\.skr$/, '') + '.skr' });
      } else {
        const name = await useIdentity.getState().resolve(v);
        setRes(name ? { owner: v, name, asked: name } : 'none');
      }
    } catch { setRes('none'); } finally { setBusy(false); }
  };
  return (
    <Well style={{ marginBottom: 10, gap: 6 }}>
      <Body size={12} bold color="#fff">Find a Seeker</Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="alice.skr or an address"
          placeholderTextColor={C.dim}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => void go()}
          returnKeyType="search"
          clearButtonMode="while-editing"
          selectTextOnFocus
          style={st.input}
          accessibilityLabel="Seeker name or address"
        />
        <Btn label="LOOK UP" size="sm" tone="blue" busy={busy} style={{ width: 104 }} onPress={() => void go()} />
      </View>
      {res === 'none' ? <Body size={11} color={C.dim}>No live .skr name found.</Body> : res ? (
        <Body size={11} color={C.dim}>
          <Text style={{ color: C.teal, fontWeight: '700' }}>{res.asked}</Text> → {short(res.owner, 6)}
          {res.name === res.asked ? ' · reverse lookup agrees' : res.name ? ` · their primary is ${res.name}` : ` · reverse lookup unavailable right now (${useIdentity.getState().lastError ?? 'no name'})`}
        </Body>
      ) : <Body size={11} color={C.dim}>Read-only lookups on Solana mainnet (AllDomains). Cached on this phone.</Body>}
    </Well>
  );
}

/** "Signed in with Seed Vault": the SIWS proof, re-verifiable on the spot. */
function SignInCard() {
  const p = useWallet((s) => s.signIn);
  const kind = useWallet((s) => s.kind);
  const [check, setCheck] = useState<'idle' | 'ok' | 'bad'>('idle');
  const [open, setOpen] = useState(false);
  if (!p) {
    return (
      <Well style={{ marginBottom: 10, gap: 4 }}>
        <Body size={12} bold color="#fff">Connected without a sign-in message</Body>
        <Body size={11} color={C.dim}>
          {kind === 'mwa' ? 'Your wallet authorized Mempire but skipped Sign In With Solana. Sign out and in again to add it.' : 'Sign out and in again to sign in with Solana.'}
        </Body>
      </Well>
    );
  }
  const issued = new Date(p.issuedAt);
  return (
    <Well style={{ marginBottom: 10, gap: 6 }}>
      <View style={st.row}>
        <Body size={13} bold color="#fff" style={{ flex: 1 }}>{signInLabel(p)}</Body>
        <Tag text={check === 'bad' ? 'INVALID' : 'SIWS ✓'} color={check === 'bad' ? C.red : C.teal} />
      </View>
      <Body size={11} color={C.dim}>
        {p.method === 'siws' ? 'One tap: the wallet authorized Mempire and signed a Sign In With Solana message in the same sheet.'
          : p.method === 'signMessage' ? 'Your wallet has no one-tap sign-in, so it signed the same Sign In With Solana message separately.'
          : 'Dev wallet: the same Sign In With Solana message, signed by the key on this device (iOS has no Mobile Wallet Adapter).'}
        {' '}The ed25519 signature was verified on this phone.
      </Body>
      <Body size={11} color={C.dim}>
        {p.domain} · {p.chainId ?? 'no chain'} · nonce {p.nonce.slice(0, 8)}… · {issued.toLocaleString()}
      </Body>
      {open ? <Text selectable style={st.mono}>{p.message}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label={open ? 'HIDE MESSAGE' : 'SHOW MESSAGE'} tone="ghost" size="sm" style={{ flex: 1 }} onPress={() => setOpen(!open)} />
        <Btn
          label={check === 'ok' ? 'VERIFIED ✓' : 'VERIFY AGAIN'}
          tone="ghost"
          size="sm"
          style={{ flex: 1 }}
          onPress={() => { const ok = recheckProof(p); setCheck(ok ? 'ok' : 'bad'); if (ok) haptic.success(); else haptic.error(); }}
        />
      </View>
    </Well>
  );
}

function SoundSetting() {
  const muted = useSound((s) => s.muted);
  const setMuted = useSound((s) => s.setMuted);
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      <Body size={12} color={C.dimOnWood} bold>SOUND & MUSIC</Body>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[{ on: true, label: 'On' }, { on: false, label: 'Off' }].map((o) => {
          const sel = muted === !o.on;
          return (
            <Pressable
              key={o.label}
              onPress={() => { haptic.tap(); setMuted(!o.on); if (o.on) sfx('click'); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`Sound ${o.label}`}
              style={{ flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 10, alignItems: 'center', backgroundColor: sel ? C.gold : 'rgba(0,0,0,0.3)' }}
            >
              <Body size={12} bold color={sel ? C.ink : '#fff'}>{o.label}</Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Settings: which arena renders battles. Persisted. */
function RendererSetting() {
  const pref = useUi((s) => s.rendererPref);
  const setPref = useUi((s) => s.setRendererPref);
  const opts: { id: 'auto' | 'native' | 'web'; label: string }[] = [
    { id: 'auto', label: 'Auto' }, { id: 'native', label: 'Native 3D' }, { id: 'web', label: 'Web (compat)' },
  ];
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      <Body size={12} color={C.dimOnWood} bold>ARENA RENDERER</Body>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {opts.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => { haptic.tap(); setPref(o.id); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: pref === o.id }}
            style={{ flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: pref === o.id ? C.gold : 'rgba(0,0,0,0.3)' }}
          >
            <Body size={12} bold color={pref === o.id ? C.ink : '#fff'}>{o.label}</Body>
          </Pressable>
        ))}
      </View>
      <Body size={11} color={C.dimOnWood}>
        Auto uses the native 3D arena on a phone and switches to the web arena if the GPU cannot keep up. Simulators use the web arena.
      </Body>
    </View>
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
  scrim: { flex: 1, backgroundColor: 'rgba(6,16,38,0.94)' },
  centerScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 },
  drops: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 3 },
  input: { flex: 1, minHeight: 40, borderRadius: 10, paddingHorizontal: 10, color: '#fff', backgroundColor: 'rgba(0,0,0,0.35)', fontSize: 14 },
  mono: { fontFamily: 'Courier', fontSize: 10, color: '#cfe0ff', backgroundColor: 'rgba(0,0,0,0.35)', padding: 8, borderRadius: 8 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 30 },
  toast: {
    position: 'absolute', top: 58, left: 16, right: 16, borderRadius: 14, padding: 12,
    borderWidth: 2, borderColor: 'rgba(0,0,0,0.4)', zIndex: 50,
  },
});
