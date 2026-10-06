import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_ART } from '../data/art';
import { CHESTS, CHEST_SLOTS, RIVALS, WEEK, dayKey, streakState } from '../game/rules';
import { doClockIn, openChest, prepareMatch, startUnlock } from '../game/actions';
import { explorerTx, short } from '../chain/solana';
import { SKR_LABEL, SKR_LIVE } from '../chain/skr';
import { useGame, avgDeckLevel } from '../state/game';
import { useUi } from '../state/ui';
import { C, R } from '../theme';
import { Body, Btn, ChestArt, Display, Panel, Rise, Tag, TierGlow, Well } from '../ui/kit';
import { haptic } from '../notify';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
};

/** The daily loop: one tap a day, a week-long ladder, proof on devnet. */
function ClockIn() {
  const streak = useGame((s) => s.streak);
  const last = useGame((s) => s.clockIns[0]);
  const sgt = useUi((s) => s.sgt);
  const say = useUi((s) => s.say);
  const [busy, setBusy] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  const state = streakState(streak);
  const doneToday = state === 'done';
  // Which day of the 7-day ladder today is (or would be).
  const nextCount = doneToday ? streak.count : state === 'lapsed' || state === 'new' ? 1 : streak.count + 1;
  const ladderDay = ((nextCount - 1) % 7) + 1;

  const go = async () => {
    setBusy(true);
    try {
      const r = await doClockIn(!!sgt);
      if (!r) { say('Already clocked in today'); return; }
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 14 }).start();
      const bits = [`Day ${r.streak}`, `+${r.skr} SKR`];
      if (r.chestTier) bits.push(r.chestStored ? `${CHESTS[r.chestTier as keyof typeof CHESTS].name}` : 'chest slots full');
      if (r.shieldsUsed) bits.push(`${r.shieldsUsed} shield used`);
      say(`${bits.join(' · ')}${r.sig ? ' · proof on devnet' : ''}`, 'ok');
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <View style={st.rowBetween}>
        <View>
          <Display size={26}>Daily Clock-In</Display>
          <Body size={13} color={C.dimOnWood}>
            {doneToday ? 'Clocked in. Come back tomorrow.' : state === 'lapsed' ? 'Streak lapsed — start a new one.' : 'One tap keeps your streak alive.'}
          </Body>
        </View>
        <Animated.View style={[st.streakBadge, { transform: [{ scale: pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.25, 1] }) }] }]}>
          <Display size={30} color={C.gold}>{streak.count}</Display>
          <Body size={10} color="#fff" bold>DAY STREAK</Body>
        </Animated.View>
      </View>

      <View style={st.week}>
        {WEEK.map((d) => {
          const claimed = doneToday ? d.day <= ladderDay : d.day < ladderDay;
          const today = d.day === ladderDay && !doneToday;
          return (
            <View key={d.day} style={[st.day, claimed && st.dayDone, today && st.dayToday]}>
              <Body size={10} color={today ? C.ink : '#fff'} bold>D{d.day}</Body>
              {d.chest ? <ChestArt tier={d.chest} size={26} /> : <View style={st.skrDot}><Body size={9} color={C.ink} bold>SKR</Body></View>}
              <Body size={10} color={today ? C.ink : C.dim} bold>+{sgt ? d.skr * 2 : d.skr}</Body>
            </View>
          );
        })}
      </View>

      <Btn
        label={doneToday ? 'CLOCKED IN ✓' : 'CLOCK IN'}
        sub={doneToday ? undefined : `Day ${ladderDay} reward · signed on Solana devnet`}
        size="lg"
        tone={doneToday ? 'ghost' : 'gold'}
        disabled={doneToday}
        busy={busy}
        onPress={go}
      />

      <View style={[st.rowBetween, { marginTop: 10 }]}>
        <Body size={12} color={C.dimOnWood}>
          Best {streak.best} · Shields {streak.shields} {sgt ? '· Seeker ×2 SKR' : ''}
        </Body>
        {last?.day === dayKey() && last.sig ? (
          <Pressable onPress={() => void Linking.openURL(explorerTx(last.sig!))}>
            <Tag text={`proof ${short(last.sig, 4)} ↗`} color={C.teal} />
          </Pressable>
        ) : last?.day === dayKey() && last.offlineReason ? (
          <Tag text="saved on device" color={C.goldHi} />
        ) : null}
      </View>
      {last?.day === dayKey() && last.offlineReason ? (
        <Body size={11} color={C.dimOnWood} style={{ marginTop: 4 }}>
          Not on-chain: {last.offlineReason}. Your streak and chest are kept{SKR_LIVE ? '; the SKR is owed — claim it in the Shop once you have devnet SOL.' : `; ${SKR_LABEL} was credited.`}
        </Body>
      ) : null}
    </Panel>
  );
}

function Chests() {
  const chests = useGame((s) => s.chests);
  const say = useUi((s) => s.say);
  const now = useNow();
  const busy = chests.some((c) => c.unlockAt !== null && c.unlockAt > now);
  const slots = Array.from({ length: CHEST_SLOTS }, (_, i) => chests[i] ?? null);
  return (
    <View style={st.chestRow}>
      {slots.map((c, i) => {
        if (!c) {
          return (
            <View key={`empty${i}`} style={[st.chest, st.chestEmpty]}>
              <Body size={11} color={C.dim}>Win a battle</Body>
            </View>
          );
        }
        const ready = c.unlockAt !== null && c.unlockAt <= now;
        const running = c.unlockAt !== null && c.unlockAt > now;
        return (
          <Pressable
            key={c.id}
            style={st.chest}
            accessibilityLabel={`${CHESTS[c.tier].name}${ready ? ', ready' : ''}`}
            onPress={() => {
              if (ready) openChest(c.id);
              else if (running) say(`Opens in ${fmtLeft(c.unlockAt! - now)} — or Rush it in the Shop`);
              else if (busy) { haptic.warn(); say('One chest unlocks at a time'); }
              else if (startUnlock(c.id)) say(`Unlocking — ${CHESTS[c.tier].unlockMin} min. We'll ping you.`, 'ok');
            }}
          >
            <TierGlow tier={c.tier} />
            <ChestArt tier={c.tier} size={54} />
            <Body size={11} color="#fff" bold numberOfLines={1}>
              {ready ? 'OPEN!' : running ? fmtLeft(c.unlockAt! - now) : `${CHESTS[c.tier].unlockMin}m`}
            </Body>
            {ready ? <View style={st.readyDot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Battle() {
  const [rival, setRival] = useState(1);
  const [rush, setRush] = useState(false);
  const openBattle = useUi((s) => s.openBattle);
  const avg = useGame((s) => avgDeckLevel(s));
  const wins = useGame((s) => s.wins);
  const losses = useGame((s) => s.losses);
  return (
    <Panel>
      <View style={st.rowBetween}>
        <Display size={24}>Battle</Display>
        <Body size={12} color={C.dimOnWood}>Deck Lv {avg.toFixed(1)} · {wins}W {losses}L</Body>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }} contentContainerStyle={{ gap: 8 }}>
        {RIVALS.map((r, i) => (
          <Pressable
            key={r.name}
            onPress={() => { haptic.tap(); setRival(i); }}
            style={[st.rival, rival === i && st.rivalOn]}
            accessibilityLabel={`Rival ${r.name}`}
          >
            <Body size={12} color="#fff" bold>{r.name.replace(' (AI)', '')}</Body>
            <Body size={10} color={C.dim}>
              {r.levelDelta < 0 ? 'Easier' : r.levelDelta > 0 ? 'Harder' : 'Even'} · AI pilot
            </Body>
          </Pressable>
        ))}
      </ScrollView>
      <View style={st.modes}>
        {[{ id: false, label: 'Standard · 3:00' }, { id: true, label: 'Rush · 0:30' }].map((m) => (
          <Pressable
            key={m.label}
            onPress={() => { haptic.tap(); setRush(m.id); }}
            style={[st.mode, rush === m.id && st.modeOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: rush === m.id }}
          >
            <Body size={12} bold color={rush === m.id ? C.ink : '#fff'}>{m.label}</Body>
          </Pressable>
        ))}
      </View>
      <Btn
        label="BATTLE"
        sub={`3D arena · ${rush ? '30 s rush' : '3 min'} · chest + SKR on a win`}
        size="lg"
        tone="blue"
        onPress={() => openBattle(prepareMatch(rival, rush))}
      />
    </Panel>
  );
}

function CoachTeaser() {
  const setCoach = useUi((s) => s.setCoach);
  const runs = useGame((s) => s.coachRuns);
  return (
    <Pressable onPress={() => { haptic.tap(); setCoach(true); }} accessibilityLabel="Open the AI coach">
      <LinearGradient colors={['#2b1a5e', '#14418f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.coach}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Display size={20}>AI Coach</Display>
            <Tag text="ON-DEVICE" color={C.teal} />
          </View>
          <Body size={12} color={C.dim}>
            Plays your deck against every rival with the real battle engine, then finds the swap that wins more.
          </Body>
          {runs > 0 ? <Body size={11} color={C.teal}>{runs} scouting runs so far</Body> : null}
        </View>
        <Display size={30} color={C.gold}>›</Display>
      </LinearGradient>
    </Pressable>
  );
}

export function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
      <Rise><Image source={UI_ART.logo} style={st.logo} resizeMode="contain" accessibilityLabel="Mempire" /></Rise>
      <Rise delay={40}><ClockIn /></Rise>
      <Rise delay={80}>
        <Well style={{ gap: 8 }}>
          <View style={st.rowBetween}>
            <Display size={18}>Chests</Display>
            <Body size={11} color={C.dim}>Tap to unlock · one at a time</Body>
          </View>
          <Chests />
        </Well>
      </Rise>
      <Rise delay={120}><Battle /></Rise>
      <Rise delay={160}><CoachTeaser /></Rise>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scroll: { padding: 14, gap: 14, paddingBottom: 120 },
  logo: { width: '70%', height: 84, alignSelf: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streakBadge: {
    backgroundColor: C.ink, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4,
    alignItems: 'center', borderWidth: 2, borderColor: C.gold,
  },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 12, gap: 4 },
  day: {
    flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, gap: 2,
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.4)',
  },
  dayDone: { backgroundColor: 'rgba(20,241,149,0.25)', borderColor: C.teal },
  dayToday: { backgroundColor: C.gold, borderColor: '#fff' },
  skrDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.skr, alignItems: 'center', justifyContent: 'center' },
  chestRow: { flexDirection: 'row', gap: 8 },
  chest: {
    flex: 1, height: 96, borderRadius: R.card, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.45)', overflow: 'hidden',
  },
  chestEmpty: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)' },
  readyDot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: C.teal },
  rival: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 2, borderColor: 'transparent',
  },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mode: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)' },
  modeOn: { backgroundColor: C.gold },
  rivalOn: { borderColor: C.gold, backgroundColor: 'rgba(255,196,34,0.15)' },
  coach: {
    borderRadius: R.panel, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 2, borderColor: 'rgba(153,69,255,0.6)',
  },
});

