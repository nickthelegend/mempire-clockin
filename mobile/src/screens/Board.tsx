import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CARD_ART } from '../data/art';
import { SEASON_WAR, assetBoard, warPoints, type WarSide } from '../game/board';
import { BY_TICKER } from '../game/rules';
import { haptic } from '../notify';
import { useGame } from '../state/game';
import { useUi } from '../state/ui';
import { useDisplayName } from '../state/identity';
import { useWar } from '../state/war';
import { CLUSTER_LABEL } from '../chain/solana';
import { useWallet } from '../wallet/wallet';
import { C, R } from '../theme';
import { Body, Btn, Display, Panel, Tag, Well } from '../ui/kit';

function Coin({ t, size = 44 }: { t: string; size?: number }) {
  const f = BY_TICKER.get(t);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: f ? `hsl(${f.hue},60%,35%)` : C.ink }}>
      {CARD_ART[t] ? <Image source={CARD_ART[t]} style={{ width: size, height: size }} resizeMode="cover" /> : null}
    </View>
  );
}

/** Home banner: the featured pair and your side. */
export function SeasonWarBanner() {
  const side = useGame((s) => s.warSide);
  const setBoard = useUi((s) => s.setBoard);
  const [a, b] = SEASON_WAR.sides;
  return (
    <Pressable
      onPress={() => { haptic.tap(); setBoard(true); }}
      accessibilityRole="button"
      accessibilityLabel={`Season War, ${SEASON_WAR.title}. ${side ? `You fight for ${side}.` : 'Pick a side.'} Open the leaderboard.`}
    >
      <LinearGradient colors={['#ff7a2e', '#9945ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.banner}>
        <Coin t={a} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Body size={11} color="#fff" bold>SEASON WAR</Body>
          <Display size={22}>${a} vs ${b}</Display>
          <Body size={11} color="#fff">{side ? `You fight for $${side} · leaderboard ›` : 'Pick a side · leaderboard ›'}</Body>
        </View>
        <Coin t={b} />
      </LinearGradient>
    </Pressable>
  );
}

function StreakName({ wallet }: { wallet: string }) {
  const me = useWallet((s) => s.address);
  const { label, skr } = useDisplayName(wallet);
  return <Body size={14} bold color={wallet === me ? C.gold : skr ? C.teal : '#fff'} style={{ flex: 1 }} numberOfLines={1}>{wallet === me ? `${label} (you)` : label}</Body>;
}

/** Global Season War tally + streak board, computed from chain on this phone. */
function GlobalBoard() {
  const board = useWar((s) => s.board);
  const loading = useWar((s) => s.loading);
  const error = useWar((s) => s.error);
  const more = useWar((s) => s.more);
  const n = useWar((s) => s.raw.length);
  const refresh = useWar((s) => s.refresh);
  const loadOlder = useWar((s) => s.loadOlder);
  useEffect(() => { void refresh(); }, [refresh]);
  const [a, b] = SEASON_WAR.sides;
  const ta = board?.sides[a] ?? { wallets: 0, clockIns: 0 };
  const tb = board?.sides[b] ?? { wallets: 0, clockIns: 0 };
  const total = Math.max(1, ta.clockIns + tb.clockIns);
  return (
    <Well style={{ gap: 8 }}>
      <View style={st.between}>
        <Display size={18}>Global war · {CLUSTER_LABEL}</Display>
        <Tag text="COMPUTED FROM CHAIN ON THIS PHONE" color={C.teal} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Coin t={a} size={36} />
        <View style={{ flex: 1, height: 16, borderRadius: 8, overflow: 'hidden', flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <View style={{ flex: ta.clockIns / total, backgroundColor: '#ff7a2e' }} />
          <View style={{ flex: tb.clockIns / total, backgroundColor: '#9945ff' }} />
        </View>
        <Coin t={b} size={36} />
      </View>
      <View style={st.between}>
        <Body size={12} color="#fff" bold>${a}: {ta.clockIns} Clock-Ins · {ta.wallets} wallets</Body>
        <Body size={12} color="#fff" bold>${b}: {tb.clockIns} · {tb.wallets}</Body>
      </View>
      <Display size={16} style={{ marginTop: 6 }}>Top streaks</Display>
      {board && board.streaks.length ? board.streaks.slice(0, 10).map((r, i) => (
        <View key={r.wallet} style={st.row}>
          <Body size={14} bold color={i < 3 ? C.gold : '#fff'} style={{ width: 26 }}>{i + 1}</Body>
          <StreakName wallet={r.wallet} />
          {r.side ? <Coin t={r.side} size={22} /> : null}
          <Body size={11} color={C.dim}>{r.claimed !== r.streak ? `claims ${r.claimed}` : ''}</Body>
          <Display size={18} color={C.gold} style={{ width: 44, textAlign: 'right' }}>{r.streak}</Display>
        </View>
      )) : <Body size={12} color="#fff">{loading ? 'Reading Clock-Ins from chain…' : 'No Clock-Ins with the war reference yet.'}</Body>}
      {error ? <Body size={11} color={C.red}>{error}</Body> : null}
      <Body size={11} color={C.dim}>
        {n} transactions read from the war reference account{board ? ` · ${board.wallets} wallets · ${board.clockIns} Clock-Ins` : ''}. A streak is the run of consecutive days visible on chain (session Clock-Ins count only with a valid owner-signed link); the number a client wrote in its memo is shown as "claims".
      </Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label={loading ? '…' : 'REFRESH'} tone="ghost" size="sm" style={{ flex: 1 }} onPress={() => void refresh()} />
        {more ? <Btn label="LOAD OLDER" tone="ghost" size="sm" style={{ flex: 1 }} onPress={() => void loadOlder()} /> : null}
      </View>
    </Well>
  );
}

export function BoardSheet() {
  const open = useUi((s) => s.boardOpen);
  const setBoard = useUi((s) => s.setBoard);
  const history = useGame((s) => s.history);
  const side = useGame((s) => s.warSide);
  const pledges = useGame((s) => s.warPledges ?? {});
  const setWarSide = useGame((s) => s.setWarSide);
  const say = useUi((s) => s.say);
  const rows = assetBoard(history);
  const who = useDisplayName(useWallet((s) => s.address));
  const trophies = useGame((s) => s.trophies);
  const wins = useGame((s) => s.wins);
  const counted = history.filter((h) => h.deck?.length).length;

  const pick = (s: WarSide) => {
    setWarSide(s);
    haptic.success();
    say(`You fight for $${s}. Your next Clock-In memo carries the pledge.`, 'ok');
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setBoard(false)}>
      <View style={st.wrap}>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingTop: 60, paddingBottom: 60 }}>
          <View style={st.between}>
            <Display size={28}>Leaderboard</Display>
            <Btn label="✕" tone="ghost" size="sm" onPress={() => setBoard(false)} />
          </View>

          <Well style={[st.row, { paddingVertical: 10 }]}>
            <Body size={14} bold color={C.gold} style={{ width: 26 }}>You</Body>
            <View style={{ flex: 1 }}>
              <Body size={15} bold color={who.skr ? C.teal : '#fff'}>{who.label}</Body>
              <Body size={11} color={C.dim}>
                {who.skr ? '.skr name, resolved from mainnet' : 'no .skr name found · showing your address'}{side ? ` · fights for $${side}` : ''}
              </Body>
            </View>
            <Body size={12} color={C.dim}>{wins}W</Body>
            <Display size={18} color={C.gold} style={{ width: 52, textAlign: 'right' }}>{trophies}</Display>
          </Well>

          <Panel>
            <Display size={20}>Season War · {SEASON_WAR.title}</Display>
            <Body size={12} color={C.dimOnWood} style={{ marginTop: 4 }}>
              Pick a coin. Every Clock-In you sign carries your pledge in its on-chain memo, and battles won with that coin in your deck add points.
            </Body>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              {SEASON_WAR.sides.map((s) => {
                const on = side === s;
                const pts = warPoints(history, s, pledges[`${SEASON_WAR.id}:${s}`] ?? 0);
                return (
                  <Pressable
                    key={s}
                    onPress={() => pick(s)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Fight for ${s}. Your points: ${pts}`}
                    style={[st.side, on && { borderColor: C.gold, borderWidth: 3 }]}
                  >
                    <Coin t={s} size={56} />
                    <Display size={18}>${s}</Display>
                    <Body size={11} color="#fff" bold>your points {pts}</Body>
                    {on ? <Tag text="YOUR SIDE" color={C.gold} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <Body size={11} color={C.dimOnWood} style={{ marginTop: 8 }}>
              Your points: 3 per win and 1 per draw with the coin in your deck, plus 2 per pledged Clock-In.
            </Body>
          </Panel>

          <GlobalBoard />

          <Well style={{ gap: 8 }}>
            <View style={st.between}>
              <Display size={18}>Your board by coin</Display>
              <Tag text="THIS DEVICE" color={C.dim} />
            </View>
            {rows.length === 0 ? (
              <Body size={12} color="#fff">
                {counted === 0 ? 'Play a battle: each coin in your deck scores 3 for a win, 1 for a draw.' : 'No scores yet.'}
              </Body>
            ) : rows.slice(0, 20).map((r, i) => (
              <View key={r.ticker} style={st.row}>
                <Body size={14} bold color={i < 3 ? C.gold : '#fff'} style={{ width: 26 }}>{i + 1}</Body>
                <Coin t={r.ticker} size={32} />
                <Body size={14} bold color="#fff" style={{ flex: 1 }}>${r.ticker}</Body>
                <Body size={12} color={C.dim}>{r.wins}W / {r.battles}</Body>
                <Display size={18} color={C.skr} style={{ width: 52, textAlign: 'right' }}>{r.score}</Display>
              </View>
            ))}
            <Body size={11} color={C.dim}>Counts battles played since this board was added.</Body>
          </Well>
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1a3d' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: R.panel,
    borderWidth: 3, borderColor: 'rgba(0,0,0,0.45)',
  },
  side: {
    flex: 1, alignItems: 'center', gap: 4, padding: 10, borderRadius: R.card,
    backgroundColor: C.recess, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.4)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
});
