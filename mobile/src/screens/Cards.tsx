import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CARD_ART } from '../data/art';
import { BY_TICKER, COPIES_TO_LEVEL, MAX_LEVEL, ROSTER } from '../game/rules';
import { useGame } from '../state/game';
import { useUi } from '../state/ui';
import { haptic } from '../notify';
import { ARCH_NAMES, C, R } from '../theme';
import { ArchIcon, Body, Btn, CardTile, Display, Panel, Rise, Tag } from '../ui/kit';
import { ARCHETYPES } from '../../../app/src/sim/archetypes';

const ALL_KINDS = [
  { id: 'all', label: 'All' },
  { id: 'meme', label: 'Memes' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'stock', label: 'Stocks' },
] as const;
/** Filter tabs only for kinds the visible roster has (no empty "Stocks" tab while those are hidden). */
const KINDS = ALL_KINDS.filter((k) => k.id === 'all' || ROSTER.some((f) => f.kind === k.id));

export function CardSheet({ ticker, onClose }: { ticker: string | null; onClose: () => void }) {
  const owned = useGame((s) => (ticker ? s.cards[ticker] : undefined));
  const inDeck = useGame((s) => (ticker ? s.deck.includes(ticker) : false));
  const upgrade = useGame((s) => s.upgrade);
  const say = useUi((s) => s.say);
  const f = ticker ? BY_TICKER.get(ticker) : null;
  if (!ticker || !f) return null;
  const def = ARCHETYPES[f.archetype as keyof typeof ARCHETYPES];
  const need = owned && owned.level < MAX_LEVEL ? COPIES_TO_LEVEL[owned.level] : 0;
  const canUp = !!owned && need > 0 && owned.copies >= need;
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={st.sheet}>
        <Panel>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Image source={CARD_ART[ticker]} style={st.art} />
            <View style={{ flex: 1, gap: 6 }}>
              <Display size={26}>${ticker}</Display>
              <Body size={13} color={C.dimOnWood}>{f.name}</Body>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ArchIcon arch={f.archetype} size={22} />
                <Body bold color="#fff">{ARCH_NAMES[f.archetype]}</Body>
              </View>
              {owned ? <Tag text={`LEVEL ${owned.level}${inDeck ? ' · IN DECK' : ''}`} color={C.gold} /> : <Tag text="NOT FOUND YET" color={C.dim} />}
            </View>
          </View>
          <View style={st.stats}>
            {[
              ['Elixir', String(def.elixir)],
              ['HP', def.hp ? String(def.hp) : '—'],
              ['Damage', String(def.damage)],
              ['Units', def.count ? String(def.count) : 'spell'],
            ].map(([k, v]) => (
              <View key={k} style={st.stat}><Body size={11} color={C.dimOnWood}>{k}</Body><Display size={18}>{v}</Display></View>
            ))}
          </View>
          <Body size={12} color={C.dimOnWood} style={{ marginBottom: 10 }}>
            Class and trait come from this coin&apos;s devnet mint ({f.mint.slice(0, 6)}…) by the same hash the on-chain program uses — nobody can reroll them.
          </Body>
          {owned ? (
            <Btn
              label={owned.level >= MAX_LEVEL ? 'MAX LEVEL' : canUp ? `UPGRADE TO LV ${owned.level + 1}` : `${owned.copies}/${need} COPIES`}
              tone={canUp ? 'green' : 'ghost'}
              disabled={!canUp}
              onPress={() => {
                if (upgrade(ticker)) { haptic.success(); say(`$${ticker} is now level ${owned.level + 1}`, 'ok'); }
              }}
            />
          ) : (
            <Body size={13} color="#fff">Open chests from daily Clock-Ins and wins to find this fighter.</Body>
          )}
        </Panel>
      </View>
    </Modal>
  );
}

export function CardsScreen() {
  const cards = useGame((s) => s.cards);
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('all');
  const [open, setOpen] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 520) - 28 - 3 * 10) / 4);
  const list = useMemo(() => {
    const rows = ROSTER.filter((f) => kind === 'all' || f.kind === kind);
    return rows.sort((a, b) => Number(!!cards[b.ticker]) - Number(!!cards[a.ticker])
      || (cards[b.ticker]?.level ?? 0) - (cards[a.ticker]?.level ?? 0));
  }, [cards, kind]);
  const found = Object.keys(cards).length;
  const upgradable = Object.entries(cards).filter(([, c]) => c.level < MAX_LEVEL && c.copies >= COPIES_TO_LEVEL[c.level]).length;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 120 }}>
      <Rise>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Display size={28}>Fighters</Display>
          <Body size={13}>{found}/{ROSTER.length} found{upgradable ? ` · ${upgradable} ready to upgrade` : ''}</Body>
        </View>
      </Rise>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {KINDS.map((k) => (
          <Pressable
            key={k.id}
            onPress={() => { haptic.tap(); setKind(k.id); }}
            style={({ pressed }) => [st.filter, kind === k.id && st.filterOn, pressed && { transform: [{ scale: 0.96 }] }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: kind === k.id }}
          >
            <Body size={13} bold color={kind === k.id ? C.ink : '#fff'}>{k.label}</Body>
          </Pressable>
        ))}
      </View>
      <View style={st.grid}>
        {list.map((f) => (
          <CardTile key={f.ticker} ticker={f.ticker} owned={cards[f.ticker]} width={tile} dim={!cards[f.ticker]} onPress={() => setOpen(f.ticker)} />
        ))}
      </View>
      <CardSheet ticker={open} onClose={() => setOpen(null)} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.scrim },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 30 },
  art: { width: 110, height: 146, borderRadius: R.card, borderWidth: 2, borderColor: 'rgba(0,0,0,0.6)' },
  stats: { flexDirection: 'row', gap: 6, marginVertical: 12 },
  stat: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 6, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filter: { paddingHorizontal: 14, paddingVertical: 7, minHeight: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)' },
  filterOn: { backgroundColor: C.gold },
});
