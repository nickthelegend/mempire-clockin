import { LinearGradient } from 'expo-linear-gradient';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CARD_ART } from '../data/art';
import { SEASON_WAR, assetBoard, warPoints, type WarSide } from '../game/board';
import { BY_TICKER } from '../game/rules';
import { haptic } from '../notify';
import { useGame } from '../state/game';
import { useUi } from '../state/ui';
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

export function BoardSheet() {
  const open = useUi((s) => s.boardOpen);
  const setBoard = useUi((s) => s.setBoard);
  const history = useGame((s) => s.history);
  const side = useGame((s) => s.warSide);
  const pledges = useGame((s) => s.warPledges ?? {});
  const setWarSide = useGame((s) => s.setWarSide);
  const say = useUi((s) => s.say);
  const rows = assetBoard(history);
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

          <Panel>
            <Display size={20}>Season War · {SEASON_WAR.title}</Display>
            <Body size={12} color={C.dimOnWood} style={{ marginTop: 4 }}>
              Pick a coin. Every Clock-In you sign carries your pledge in its devnet memo, and battles won with that coin in your deck add points.
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
              Global tally: not computed in the app yet. The pledges are public in each wallet&apos;s signed Clock-In memos, so a season indexer can count them from chain. Points: 3 per win and 1 per draw with the coin in your deck, plus 2 per pledged Clock-In.
            </Body>
          </Panel>

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
