import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { BY_TICKER, RIVALS, rivalDeck } from '../game/rules';
import { bestSwap, evaluate, verdict, type Evaluation, type SwapSuggestion, type CoachCard } from '../game/coach';
import { useGame, avgDeckLevel } from '../state/game';
import { useUi } from '../state/ui';
import { haptic } from '../notify';
import { C } from '../theme';
import { Body, Btn, CardTile, Display, Panel, Progress, Tag, Well } from '../ui/kit';

/**
 * The coach's screen: run the scouting, show the measurements, offer a swap.
 *
 * Seeds are fixed per run so pressing "Scout" twice on the same deck gives the
 * same answer — a coach that changes its mind on a re-roll is not a coach.
 */
const SEEDS = 4;

export function CoachSheet() {
  const open = useUi((s) => s.coachOpen);
  const setCoach = useUi((s) => s.setCoach);
  const say = useUi((s) => s.say);
  const deck = useGame((s) => s.deck);
  const cards = useGame((s) => s.cards);
  const setDeckSlot = useGame((s) => s.setDeckSlot);
  const noteCoachRun = useGame((s) => s.noteCoachRun);
  const [phase, setPhase] = useState<'idle' | 'scouting' | 'searching' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 1, label: '' });
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [swap, setSwap] = useState<SwapSuggestion | null | undefined>(undefined);
  const cancelled = useRef(false);

  const toCoach = (t: string): CoachCard => ({ ticker: t, mint: BY_TICKER.get(t)!.mint, level: cards[t]?.level ?? 1 });
  const rivals = () => {
    const avg = avgDeckLevel({ deck, cards });
    return RIVALS.map((r) => ({ name: r.name.replace(' (AI)', ''), deck: rivalDeck(r, avg) }));
  };

  const scout = async () => {
    cancelled.current = false;
    setPhase('scouting'); setEv(null); setSwap(undefined);
    const r = rivals();
    const result = await evaluate(deck.map(toCoach), r, SEEDS, (done, total) => {
      if (!cancelled.current) setProgress({ done, total, label: `Simulating match ${done}/${total}` });
    });
    if (cancelled.current) return;
    setEv(result);
    noteCoachRun();
    haptic.success();
    setPhase('done');
  };

  const search = async () => {
    if (!ev) return;
    setPhase('searching');
    const pool = Object.keys(cards).map(toCoach);
    const s = await bestSwap(deck.map(toCoach), pool, rivals(), ev, { slots: 3, candidates: 3, seeds: SEEDS }, (label, done, total) => {
      if (!cancelled.current) setProgress({ done, total, label: `Trying ${label}` });
    });
    if (cancelled.current) return;
    setSwap(s);
    haptic.success();
    setPhase('done');
  };

  const close = () => { cancelled.current = true; setPhase('idle'); setCoach(false); };
  const running = phase === 'scouting' || phase === 'searching';

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
      <View style={st.wrap}>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingTop: 60, paddingBottom: 60 }}>
          <View style={st.between}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Display size={28}>AI Coach</Display>
              <Tag text="ON-DEVICE SIMULATION" color={C.teal} />
            </View>
            <Btn label="✕" tone="ghost" size="sm" onPress={close} />
          </View>
          <Body size={13}>
            The coach plays your eight cards against all {RIVALS.length} rival decks — {SEEDS} seeds each, every seed played from both sides of the arena — using the same deterministic battle engine as the 3D arena, with the game&apos;s AI pilot on both seats. 90-second matches, so it fits on a phone. Nothing leaves this device.
          </Body>

          {phase === 'idle' ? <Btn label="SCOUT MY DECK" size="lg" onPress={() => void scout()} /> : null}

          {running ? (
            <Well style={{ gap: 8 }}>
              <Body bold color="#fff">{progress.label}</Body>
              <Progress value={progress.done / Math.max(1, progress.total)} />
            </Well>
          ) : null}

          {ev ? (
            <Panel>
              <View style={st.between}>
                <Display size={22}>Scouting report</Display>
                <Display size={34} color={ev.winRate >= 0.5 ? C.teal : C.red}>{Math.round(ev.winRate * 100)}%</Display>
              </View>
              <Body size={11} color={C.dimOnWood}>{ev.games} simulated matches · {(ev.ms / 1000).toFixed(1)}s on this phone</Body>
              <View style={{ gap: 6, marginVertical: 10 }}>
                {ev.matchups.map((m) => {
                  const wr = (m.wins + m.draws / 2) / Math.max(1, m.games);
                  return (
                    <View key={m.rival} style={{ gap: 3 }}>
                      <View style={st.between}>
                        <Body size={13} bold color="#fff">vs {m.rival}</Body>
                        <Body size={12} color={C.dimOnWood}>{m.wins}W {m.draws}D {m.games - m.wins - m.draws}L</Body>
                      </View>
                      <Progress value={wr} color={wr >= 0.5 ? C.teal : C.red} height={8} />
                    </View>
                  );
                })}
              </View>
              {verdict(ev).map((l) => <Body key={l} size={13} color="#fff">• {l}</Body>)}
            </Panel>
          ) : null}

          {ev && phase === 'done' && swap === undefined ? (
            <Btn label="FIND A BETTER CARD" sub="tests swaps from your collection" tone="blue" onPress={() => void search()} />
          ) : null}

          {swap === null && phase === 'done' ? (
            <Well><Body color="#fff">No single swap from your collection beat this deck in the coach&apos;s tests. Level up your cards, or open chests for new fighters.</Body></Well>
          ) : null}

          {swap ? (
            <Panel>
              <Display size={20}>Suggested swap</Display>
              <View style={st.swapRow}>
                <CardTile ticker={swap.out.ticker} owned={cards[swap.out.ticker]} width={92} />
                <Display size={28} color={C.gold}>→</Display>
                <CardTile ticker={swap.in.ticker} owned={cards[swap.in.ticker]} width={92} />
              </View>
              <Body size={13} color="#fff">
                Win rate {Math.round(swap.before * 100)}% → {Math.round(swap.after * 100)}%, each measured over {swap.games} matches on the same seeds.
              </Body>
              <Btn
                label="APPLY SWAP"
                tone="green"
                style={{ marginTop: 10 }}
                onPress={() => {
                  const i = deck.indexOf(swap.out.ticker);
                  if (i >= 0) setDeckSlot(i, swap.in.ticker);
                  haptic.success();
                  say(`$${swap.in.ticker} is in your deck`, 'ok');
                  setSwap(undefined); setEv(null); setPhase('idle');
                }}
              />
            </Panel>
          ) : null}

          {ev && !running ? <Btn label="RUN AGAIN" tone="ghost" size="sm" onPress={() => void scout()} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1a3d' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginVertical: 10 },
});
