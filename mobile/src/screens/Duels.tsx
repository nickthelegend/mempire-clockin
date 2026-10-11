import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, TextInput, View, Modal } from 'react-native';
import { CARD_ART } from '../data/art';
import { explorerTx, short } from '../chain/solana';
import { prepareDuel } from '../game/actions';
import { duelMessage } from '../game/blink';
import type { DuelPayload } from '../game/duel';
import { haptic } from '../notify';
import { useDuels, type Check } from '../state/duels';
import { useDisplayName } from '../state/identity';
import { useUi } from '../state/ui';
import { useWallet } from '../wallet/wallet';
import { C } from '../theme';
import { Body, Btn, Display, Panel, Tag, Well, Ribbon } from '../ui/kit';
import type { DuelTx } from '../chain/duels';
import { CHAR_ART, FEATURE_ART, ITEM_ART, MASCOT } from '../data/cosmeticArt';
import { UI_ART } from '../data/art';
import { ProofSeal } from '../ui/ProofSheet';
import { HeroSpace } from '../ui/Backdrop';
import { prepareMatch } from '../game/actions';

const ago = (t: number) => {
  if (!t) return '';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};

function Who({ address }: { address: string }) {
  const me = useWallet((s) => s.address);
  const { label, skr } = useDisplayName(address.length > 30 ? address : null);
  if (address === me) return <Body size={13} bold color={C.gold}>You</Body>;
  return <Body size={13} bold color={skr ? C.teal : '#fff'}>{address.length > 30 ? label : address}</Body>;
}

function DeckRow({ p }: { p: DuelPayload }) {
  return (
    <View style={st.deck}>
      {p.deck.map((c, i) => (
        <View key={`${c.ticker}${i}`} style={st.mini}>
          <Image source={CARD_ART[c.ticker]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
      ))}
    </View>
  );
}

/** The challenge a link (or a tap on the board) opened: fight it here. */
function OpenCard() {
  const open = useDuels((s) => s.open);
  const close = useDuels((s) => s.closeOpen);
  const openBattle = useUi((s) => s.openBattle);
  if (!open) return null;
  const p = open.payload;
  return (
    <Panel>
      <View style={st.row}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Image source={CHAR_ART.ghost} style={{ width: 52, height: 52 }} resizeMode="contain" accessibilityLabel="The ghost" />
          <Display size={22}>Ghost challenge</Display>
        </View>
        <Btn label="✕" tone="ghost" size="sm" onPress={close} />
      </View>
      <View style={[st.row, { justifyContent: 'center', gap: 10, marginVertical: 4 }]}>
        <View style={{ alignItems: 'center', gap: 2, flex: 1 }}><Body size={11} color={C.dim} bold>YOU</Body><Image source={UI_ART.avatar_guest} style={{ width: 52, height: 52, borderRadius: 12 }} /></View>
        <Image source={ITEM_ART.vs} style={{ width: 72, height: 72 }} resizeMode="contain" accessibilityLabel="versus" />
        <View style={{ alignItems: 'center', gap: 2, flex: 1 }}><Body size={11} color={C.dim} bold>GHOST OF</Body><Who address={open.challenger} /></View>
      </View>
      {p ? (
        <>
          <Body size={12} color={C.dimOnWood}>
            {p.rush ? 'Rush · 0:30' : 'Standard · 3:00'} · {p.inputs.length} recorded moves
          </Body>
          <DeckRow p={p} />
          <Tag
            text={open.source === 'chain' ? '✓ VERIFIED ON CHAIN' : 'FROM A LINK'}
            color={open.source === 'chain' ? C.teal : C.goldHi}
          />
          <Body size={12} color={C.dimOnWood} style={{ marginTop: 6 }}>
            You play the top seat. Their side replays exactly what they did, tick for tick, on the same seed. Your deck, no stake.
          </Body>
          <Btn
            label="FIGHT THE GHOST"
            sub="native 3D arena"
            size="lg"
            tone="gold"
            style={{ marginTop: 10 }}
            onPress={() => {
              haptic.tap();
              openBattle(prepareDuel({ sig: open.sig, challenger: open.challenger, payload: p, payloadB64: open.payloadB64! }));
            }}
          />
        </>
      ) : (
        <Body size={12} color={open.error ? C.red : C.dimOnWood}>{open.error ?? 'Loading the ghost…'}</Body>
      )}
    </Panel>
  );
}

function ResultLine({ t, check }: { t: DuelTx; check?: Check }) {
  const verify = useDuels((s) => s.verify);
  if (t.memo.kind !== 'result') return null;
  const w = t.memo.winner;
  return (
    <View style={st.result}>
      <View style={{ flex: 1 }}>
        <View style={[st.row, { justifyContent: 'flex-start', gap: 6 }]}>
          <Who address={t.signer} />
          <Body size={12} color={C.dim}>{w === 'o' ? 'beat the ghost' : w === 'c' ? 'lost to the ghost' : 'drew'} · {ago(t.time)}</Body>
        </View>
      </View>
      <Pressable onPress={() => void verify(t.sig)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Verify by replay">
        {check?.state === 'ok' ? <Tag text="✓ REPLAY CONFIRMS" color={C.teal} />
          : check?.state === 'bad' ? <Tag text={`✗ ${check.why ?? 'MISMATCH'}`.slice(0, 40)} color={C.red} />
          : check?.state === 'busy' ? <Tag text="REPLAYING…" color={C.dim} />
          : <Tag text="VERIFY BY REPLAY" color={C.goldHi} />}
      </Pressable>
    </View>
  );
}

function Board() {
  const board = useDuels((s) => s.board);
  const loading = useDuels((s) => s.loading);
  const error = useDuels((s) => s.error);
  const checks = useDuels((s) => s.checks);
  const refresh = useDuels((s) => s.refresh);
  const openLink = useDuels((s) => s.openLink);
  const me = useWallet((s) => s.address);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  useEffect(() => { void refresh(); }, [refresh]);
  const challenges = board.filter((t) => t.memo.kind === 'challenge');
  const results = board.filter((t) => t.memo.kind === 'result');
  const resultsFor = (sig: string) => results.filter((r) => r.memo.kind === 'result' && r.memo.challengeSig === sig);
  const shown = challenges.filter((c) => tab === 'all' || c.signer === me || resultsFor(c.sig).some((r) => r.signer === me));
  return (
    <Well style={{ gap: 10 }}>
      <View style={st.row}>
        <Display size={18}>Duel board</Display>
        <Btn label="REFRESH" tone="ghost" size="sm" busy={loading} onPress={() => void refresh()} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['all', 'mine'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[st.seg, tab === k && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Body size={12} bold color={tab === k ? C.ink : '#fff'}>{k === 'all' ? 'All duels' : 'Incoming & outgoing'}</Body>
          </Pressable>
        ))}
      </View>
      {error && !shown.length ? (
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 10 }}>
          <Image source={MASCOT.sleep} style={{ width: 110, height: 110 }} resizeMode="contain" />
          <Body size={14}>The board is offline. It refreshes on its own.</Body>
          <Btn label="TRY NOW" tone="gold" size="sm" style={{ alignSelf: 'stretch' }} onPress={() => void refresh()} />
        </View>
      ) : null}
      {!loading && !error && !shown.length ? (
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 10 }}>
          <Image source={MASCOT.sleep} style={{ width: 120, height: 120 }} resizeMode="contain" />
          <Display size={20}>No duels yet</Display>
          <Body size={13}>Send your first ghost</Body>
          <Btn label="SEND A GHOST" tone="gold" size="sm" style={{ alignSelf: 'stretch', marginTop: 4 }} onPress={sendGhost} />
        </View>
      ) : null}
      {shown.map((c) => {
        if (c.memo.kind !== 'challenge') return null;
        const rs = resultsFor(c.sig);
        const mine = c.signer === me;
        return (
          <View key={c.sig} style={st.challenge}>
            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <View style={[st.row, { justifyContent: 'flex-start', gap: 8 }]}>
                  <Image source={UI_ART.avatar_guest} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: mine ? C.gold : C.purple }} />
                  <View style={{ flexShrink: 1 }}>
                    <Who address={c.signer} />
                    <Body size={12} color={C.dim}>{ago(c.time)}</Body>
                  </View>
                  <Image source={ITEM_ART.vs} style={{ width: 26, height: 26 }} resizeMode="contain" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ProofSeal compact info={{ title: 'Ghost challenge', art: FEATURE_ART.ghostduel, glow: C.bluePale, about: 'This challenge is a transaction carrying the recorded moves. Every answer is replayed on your phone before it gets a ✓.', proofs: [{ label: `challenge ${short(c.sig, 6)}`, url: explorerTx(c.sig) }] }} />
                  <Body size={12} color={C.dim}>{rs.length ? `${rs.length} fight${rs.length === 1 ? '' : 's'}` : 'No fights yet'}</Body>
                </View>
              </View>
              {mine ? (
                <Btn label="SHARE" tone="blue" size="sm" style={{ width: 90 }} onPress={() => {
                  if (c.memo.kind === 'challenge' && c.memo.data) void Share.share({ message: duelMessage(c.sig, c.memo.data, false) }).catch(() => {});
                }} />
              ) : (
                <Btn label="FIGHT" tone="gold" size="sm" style={{ width: 90 }} onPress={() => { haptic.tap(); void openLink(c.sig, c.memo.kind === 'challenge' ? c.memo.data ?? null : null); }} />
              )}
            </View>
            {rs.map((r) => <ResultLine key={r.sig} t={r} check={checks[r.sig]} />)}
          </View>
        );
      })}
    </Well>
  );
}

function Paste() {
  const [v, setV] = useState('');
  const openLink = useDuels((s) => s.openLink);
  const say = useUi((s) => s.say);
  const go = () => {
    const t = v.trim();
    const m = /[?&]c=([1-9A-HJ-NP-Za-km-z]{64,90})/.exec(t);
    const d = /[?&]d=([A-Za-z0-9_-]+)/.exec(t)?.[1] ?? null;
    const sig = m?.[1] ?? (/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(t) ? t : null);
    if (!sig && !d) { say('Paste a duel link or a challenge signature', 'err'); return; }
    void openLink(sig, d);
    setV('');
  };
  const [open, setOpen] = useState(false);
  return (
    <>
    <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" style={{ alignSelf: 'center' }}>
      <Body size={14} bold color={C.goldHi}>Have a duel code?</Body>
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={{ flex: 1, backgroundColor: C.scrim }} onPress={() => setOpen(false)} />
      <View style={st.codeSheet}>
        <Display size={22}>Enter a duel code</Display>
        <Body size={13}>Paste the link a friend sent you.</Body>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TextInput
        value={v}
        onChangeText={setV}
        placeholder="paste a duel link"
        placeholderTextColor={C.dim}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={go}
        style={st.input}
        accessibilityLabel="Duel link"
      />
      <Btn label="OPEN" tone="gold" size="sm" style={{ width: 80 }} onPress={() => { setOpen(false); go(); }} />
    </View>
      </View>
    </Modal>
    </>
  );
}

/** A ghost is a recorded native-arena match: start one; its result offers Duel a friend. */
function sendGhost() {
  haptic.tap();
  const m = prepareMatch(1, false);
  m.renderer = 'native';
  m.forcedRenderer = true; // a ghost is recorded by the native arena only
  useUi.getState().openBattle(m);
}

export function DuelsScreen() {
  return (
    <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <HeroSpace>
        <Image source={CHAR_ART.ghost} style={st.floatGhost} resizeMode="contain" accessibilityLabel="The ghost" />
        <Ribbon text="GHOST DUELS" tone="purple" size={26} />
      </HeroSpace>
      <Btn label="SEND A GHOST" sub="friends fight your exact moves" tone="gold" size="lg" icon={FEATURE_ART.ghostduel} onPress={sendGhost} />
      <Paste />
      <OpenCard />
      <Board />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scroll: { paddingHorizontal: 14, gap: 14, paddingBottom: 120 },
  floatGhost: { position: 'absolute', right: 6, top: 30, width: 110, height: 110 },
  codeSheet: { backgroundColor: C.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 40, gap: 10, borderTopWidth: 1.5, borderColor: 'rgba(247,215,116,0.5)' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deck: { flexDirection: 'row', gap: 4, marginVertical: 8 },
  mini: { flex: 1, aspectRatio: 0.75, borderRadius: 6, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.5)' },
  challenge: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.15)' },
  seg: { flex: 1, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  segOn: { backgroundColor: C.gold },
  input: { flex: 1, minHeight: 40, borderRadius: 10, paddingHorizontal: 10, color: '#fff', backgroundColor: 'rgba(0,0,0,0.35)', fontSize: 14 },
});
