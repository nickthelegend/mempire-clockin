import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BY_TICKER } from '../game/rules';
import { useGame, avgDeckLevel } from '../state/game';
import { useUi } from '../state/ui';
import { haptic } from '../notify';
import { ARCH_NAMES, C } from '../theme';
import { ArchIcon, Body, Btn, CardTile, Display, Panel, Rise, Tag, Well, Ribbon } from '../ui/kit';
import { ARENA_SKINS, FRAME_SKINS, ownsSkin, usePassChain } from '../chain/pass';
import { useFrameKey } from '../game/cosmetics';
import { EMOTE_ART, UI_ICON } from '../data/cosmeticArt';
import { Image } from 'react-native';
import { EMOTES, PASS_FRAMES } from '../game/season';
import { SkinPreview } from './Shop';

/**
 * Wardrobe: equip what you own. On-chain skins show as owned only while the
 * chain says so; pass frames and emotes are unlocked on the pass.
 */
function Wardrobe() {
  const pc = usePassChain();
  const equipped = useGame((s) => s.equipped);
  const unlocked = useGame((s) => s.cosmetics);
  const equip = useGame((s) => s.equip);
  const setTab = useUi((s) => s.setTab);
  const opt = (key: string, label: string, on: boolean, owned: boolean, onPress: () => void, preview?: React.ReactNode) => (
    <Pressable
      key={key}
      onPress={owned ? onPress : undefined}
      disabled={!owned}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !owned }}
      accessibilityLabel={`${label}${on ? ', equipped' : owned ? '' : ', not owned'}`}
      style={[st.opt, on && st.optOn]}
    >
      <View style={{ height: 52, alignItems: 'center', justifyContent: 'center', opacity: owned ? 1 : 0.4 }}>
        {preview ?? <Image source={UI_ICON.crown} style={{ width: 36, height: 36 }} resizeMode="contain" />}
      </View>
      {!owned ? <Image source={UI_ICON.lock} style={st.optLock} resizeMode="contain" /> : null}
      <Body size={11} color={owned ? '#fff' : C.dim} bold numberOfLines={1}>{label}</Body>
      <Body size={9} color={on ? C.gold : owned ? C.teal : C.dim} bold>{on ? 'EQUIPPED' : owned ? 'EQUIP' : 'LOCKED'}</Body>
    </Pressable>
  );
  return (
    <Well style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Display size={18}>Wardrobe</Display>
        {pc.status === 'live' ? <Tag text="✓ YOURS ON CHAIN" color={C.teal} /> : pc.status === 'offline' ? <Tag text="OFFLINE" color={C.dim} /> : null}
      </View>
      <Body size={11} color={C.dim} bold>ARENA SKIN</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.opts}>
        {opt('a-default', 'Classic', equipped.arena === 'default', true, () => equip({ arena: 'default' }))}
        {ARENA_SKINS.map((s) => opt(`a-${s.key}`, s.name, equipped.arena === s.key, ownsSkin(pc, s.id), () => equip({ arena: s.key }), <SkinPreview skin={s} kind="arena" size={40} />))}
      </ScrollView>
      <Body size={11} color={C.dim} bold>CARD FRAME</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.opts}>
        {opt('f-default', 'Classic', equipped.frame === 'default', true, () => equip({ frame: 'default' }))}
        {FRAME_SKINS.map((s) => opt(`f-${s.key}`, s.name, equipped.frame === s.key, ownsSkin(pc, s.id), () => equip({ frame: s.key }), <SkinPreview skin={s} kind="frame" size={52} />))}
        {Object.entries(PASS_FRAMES).map(([k, f]) => opt(`p-${k}`, f.name, equipped.frame === k, unlocked.frames.includes(k), () => equip({ frame: k }),
          <SkinPreview skin={{ id: 0, key: k, name: f.name, symbol: '', price: 0, colors: f.colors }} kind="frame" size={52} />))}
      </ScrollView>
      <Body size={11} color={C.dim} bold>EMOTE · ON YOUR RESULT CARD</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.opts}>
        {Object.entries(EMOTES).map(([k, e]) => opt(`e-${k}`, e.label, equipped.emote === k, unlocked.emotes.includes(k), () => equip({ emote: k }),
          <Image source={EMOTE_ART[k]} style={{ width: 40, height: 40 }} accessibilityLabel={`${e.label} emote`} />))}
      </ScrollView>
      <Btn label="GET SKINS IN THE SHOP" tone="ghost" size="sm" onPress={() => setTab('shop')} />
    </Well>
  );
}
import { ARCHETYPES } from '../../../app/src/sim/archetypes';
import { HeroCaption, HeroSpace } from '../ui/Backdrop';

export function DeckScreen() {
  const deck = useGame((s) => s.deck);
  const cards = useGame((s) => s.cards);
  const setDeckSlot = useGame((s) => s.setDeckSlot);
  const setCoach = useUi((s) => s.setCoach);
  const frame = useFrameKey();
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
    <ScrollView contentContainerStyle={{ paddingHorizontal: 14, gap: 12, paddingBottom: 120 }}>
      <Rise>
        <HeroSpace offset={30}>
          <Ribbon text="BATTLE DECK" size={26} />
          <HeroCaption>Avg Lv {avg.toFixed(1)} · {elixir.toFixed(1)} elixir</HeroCaption>
        </HeroSpace>
      </Rise>
      <Rise delay={40}>
        <Panel>
          <View style={st.grid}>
            {deck.map((t, i) => (
              <CardTile key={`${t}-${i}`} ticker={t} owned={cards[t]} width={tile - 6} selected={slot === i} frame={frame} onPress={() => setSlot(i)} />
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
      <Rise delay={100}><Wardrobe /></Rise>
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
  opts: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  optLock: { position: 'absolute', top: 6, right: 6, width: 18, height: 18 },
  opt: {
    width: 92, minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 3, padding: 6, borderRadius: 12,
    backgroundColor: C.panelRaised, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
  },
  optOn: { borderColor: C.gold, borderWidth: 2.5 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 30 },
});
