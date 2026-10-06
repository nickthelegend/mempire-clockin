import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BY_TICKER } from '../game/rules';
import { useGame, avgDeckLevel } from '../state/game';
import { useUi } from '../state/ui';
import { haptic } from '../notify';
import { ARCH_NAMES, C } from '../theme';
import { ArchIcon, Body, Btn, CardTile, Display, Panel, Rise, Well } from '../ui/kit';
import { ARCHETYPES } from '../../../app/src/sim/archetypes';

export function DeckScreen() {
  const deck = useGame((s) => s.deck);
  const cards = useGame((s) => s.cards);
  const setDeckSlot = useGame((s) => s.setDeckSlot);
  const setCoach = useUi((s) => s.setCoach);
  const [slot, setSlot] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 520) - 28 - 3 * 10) / 4);
  const avg = avgDeckLevel({ deck, cards });
  const elixir = deck.reduce((n, t) => n + ARCHETYPES[BY_TICKER.get(t)!.archetype as keyof typeof ARCHETYPES].elixir, 0) / 8;
  const spread = useMemo(() => {
    const m = new Map<number, number>();
    deck.forEach((t) => { const a = BY_TICKER.get(t)!.archetype; m.set(a, (m.get(a) ?? 0) + 1); });
    return m;
  }, [deck]);
  const bench = Object.keys(cards).filter((t) => !deck.includes(t))
    .sort((a, b) => cards[b].level - cards[a].level);

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 120 }}>
      <Rise>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Display size={28}>Battle Deck</Display>
          <Body size={13}>Avg Lv {avg.toFixed(1)} · {elixir.toFixed(1)} elixir</Body>
        </View>
      </Rise>
      <Rise delay={40}>
        <Panel>
          <View style={st.grid}>
            {deck.map((t, i) => (
              <CardTile key={`${t}-${i}`} ticker={t} owned={cards[t]} width={tile - 6} selected={slot === i} onPress={() => setSlot(i)} />
            ))}
          </View>
          <Body size={12} color={C.dimOnWood} style={{ marginTop: 8 }}>Tap a card to swap it out.</Body>
        </Panel>
      </Rise>
      <Rise delay={80}>
        <Well style={{ gap: 8 }}>
          <Display size={16}>Archetype spread</Display>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ARCH_NAMES.map((n, a) => (
              <View key={n} style={st.arch}>
                <ArchIcon arch={a} size={20} />
                <Body size={12} color={spread.get(a) ? '#fff' : C.red} bold>{n} ×{spread.get(a) ?? 0}</Body>
              </View>
            ))}
          </View>
        </Well>
      </Rise>
      <Rise delay={120}>
        <Btn label="ASK THE AI COACH" sub="simulates your deck vs every rival, on this phone" tone="blue" onPress={() => setCoach(true)} />
      </Rise>

      <Modal transparent animationType="slide" visible={slot !== null} onRequestClose={() => setSlot(null)}>
        <Pressable style={{ flex: 1, backgroundColor: C.scrim }} onPress={() => setSlot(null)} />
        <View style={st.sheet}>
          <Panel>
            <Display size={20}>Swap ${slot !== null ? deck[slot] : ''} for…</Display>
            <ScrollView style={{ maxHeight: 360, marginTop: 10 }} contentContainerStyle={st.grid}>
              {bench.length ? bench.map((t) => (
                <CardTile
                  key={t}
                  ticker={t}
                  owned={cards[t]}
                  width={tile - 6}
                  onPress={() => {
                    if (slot === null) return;
                    setDeckSlot(slot, t);
                    haptic.success();
                    setSlot(null);
                  }}
                />
              )) : <Body color="#fff">Every fighter you own is already in the deck. Open chests to find more.</Body>}
            </ScrollView>
          </Panel>
        </View>
      </Modal>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  arch: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '30%' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 30 },
});
