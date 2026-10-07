import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_ART } from '../data/art';
import { CHESTS, CHEST_SLOTS, QUESTS, QUEST_BONUS, RIVALS, WEEK, dayKey, msToUtcMidnight, streakState } from '../game/rules';
import { challengeMessage, claimQuest, doClockIn, openChest, prepareMatch, startUnlock } from '../game/actions';
import { explorerTx, short } from '../chain/solana';
import { SKR_LABEL, SKR_LIVE } from '../chain/skr';
import { useGame, avgDeckLevel } from '../state/game';
import { useUi } from '../state/ui';
import { C, F, R } from '../theme';
import { Body, Btn, ChestArt, Display, Panel, PressScale, Progress, Rise, Tag, TierGlow, Well } from '../ui/kit';
import { EASE_OUT, reduceMotion, useCountUp } from '../motion';
import { sfx } from '../sound';
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
  const ledger = useUi((s) => s.chainLedger);
  const [busy, setBusy] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  const stampV = useRef(new Animated.Value(0)).current;
  const [stampDay, setStampDay] = useState<number | null>(null);
  const shownStreak = useCountUp(streak.count, 500);
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
      // The stamp: lands hard, holds, fades. The one moment a day this app
      // is allowed to be loud about itself.
      setStampDay(r.streak);
      stampV.setValue(0);
      setTimeout(() => { haptic.heavy(); sfx('coin'); }, reduceMotion() ? 0 : 170);
      Animated.sequence([
        reduceMotion()
          ? Animated.timing(stampV, { toValue: 1, duration: 150, useNativeDriver: true })
          : Animated.spring(stampV, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 9 }),
        Animated.delay(1100),
        Animated.timing(stampV, { toValue: 2, duration: 260, easing: EASE_OUT, useNativeDriver: true }),
      ]).start(() => setStampDay(null));
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
      <View style={[st.rowBetween, { gap: 10 }]}>
        <View style={{ flex: 1 }}>
          <Display size={26}>Daily Clock-In</Display>
          <Body size={13} color={C.dimOnWood}>
            {doneToday ? 'Clocked in. Come back tomorrow.' : state === 'lapsed' ? 'Streak lapsed — start a new one.' : 'One tap keeps your streak alive.'}
          </Body>
        </View>
        <Animated.View style={[st.streakBadge, { transform: [{ scale: pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.25, 1] }) }] }]}>
          <Text maxFontSizeMultiplier={1.15} style={st.streakNum}>{shownStreak}</Text>
          <Text maxFontSizeMultiplier={1.1} style={st.streakLbl}>DAY STREAK</Text>
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
          <Pressable onPress={() => void Linking.openURL(explorerTx(last.sig!))} hitSlop={14} accessibilityRole="link" accessibilityLabel="Open the Clock-In proof on Solana Explorer">
            <Tag text={`proof ${short(last.sig, 4)} ↗`} color={C.teal} />
          </Pressable>
        ) : last?.day === dayKey() && last.offlineReason ? (
          <Tag text="saved on device" color={C.goldHi} />
        ) : null}
      </View>
      <Body size={11} color={C.dimOnWood} style={{ marginTop: 4 }}>
        {ledger === undefined
          ? 'Chain ledger: reading devnet…'
          : ledger === null
          ? 'Chain ledger: could not reach devnet.'
          : ledger.length
            ? `Chain ledger: ${ledger.length} signed Clock-In${ledger.length === 1 ? '' : 's'} on devnet · latest day ${ledger[0].streak}`
            : 'Chain ledger: no signed Clock-Ins yet — they appear once the wallet has devnet SOL.'}
      </Body>
      {last?.day === dayKey() && last.offlineReason ? (
        <Body size={11} color={C.dimOnWood} style={{ marginTop: 4 }}>
          Not on-chain: {last.offlineReason}. Your streak and chest are kept{SKR_LIVE ? '; the SKR is owed — claim it in the Shop once you have devnet SOL.' : `; ${SKR_LABEL} was credited.`}
        </Body>
      ) : null}
      {stampDay !== null ? (
        <View pointerEvents="none" style={st.stampWrap}>
          <Animated.View
            style={[st.stamp, {
              opacity: stampV.interpolate({ inputRange: [0, 0.3, 1, 2], outputRange: [0, 1, 1, 0] }),
              transform: reduceMotion() ? [{ rotate: '-12deg' }] : [
                { rotate: '-12deg' },
                { scale: stampV.interpolate({ inputRange: [0, 1, 2], outputRange: [1.9, 1, 1.04] }) },
              ],
            }]}
            accessibilityLiveRegion="assertive"
            accessibilityLabel={`Clocked in. Day ${stampDay}`}
          >
            <Display size={16} color={C.red}>CLOCKED IN</Display>
            <Display size={44} color={C.red}>DAY {stampDay}</Display>
          </Animated.View>
        </View>
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
              <Body size={11} color={C.dim} style={{ textAlign: 'center' }}>Win a battle</Body>
            </View>
          );
        }
        const ready = c.unlockAt !== null && c.unlockAt <= now;
        const running = c.unlockAt !== null && c.unlockAt > now;
        return (
          <Pressable
            key={c.id}
            style={({ pressed }) => [st.chest, pressed && st.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${CHESTS[c.tier].name}${ready ? ', ready to open' : running ? `, opens in ${fmtLeft(c.unlockAt! - now)}` : ', tap to start unlocking'}`}
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

function fmtHours(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Three small things a day. Reset at UTC midnight for everyone. */
function Quests() {
  const quests = useGame((s) => s.quests);
  const refresh = useGame((s) => s.refreshQuests);
  const say = useUi((s) => s.say);
  const now = useNow(30_000);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { refresh(); }, [now, refresh]);
  const done = QUESTS.filter((q) => quests.claimed[q.id]).length;
  return (
    <Well style={{ gap: 10 }}>
      <View style={st.rowBetween}>
        <Display size={18}>Daily quests</Display>
        <Body size={11} color={C.dim}>new in {fmtHours(msToUtcMidnight())}</Body>
      </View>
      {QUESTS.map((q) => {
        const p = Math.min(q.goal, quests.progress[q.id]);
        const claimed = quests.claimed[q.id];
        const ready = !claimed && p >= q.goal;
        return (
          <View key={q.id} style={st.quest} accessible accessibilityLabel={`${q.title}. ${p} of ${q.goal}. ${claimed ? 'Claimed' : ready ? 'Ready to claim' : ''}`}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={st.rowBetween}>
                <Body size={13} bold color={claimed ? C.dim : '#fff'}>{q.title}</Body>
                <Body size={12} bold color={C.skr}>+{q.skr} SKR</Body>
              </View>
              <Progress value={p / q.goal} color={claimed ? C.dim : ready ? C.teal : C.bluePale} height={8} />
            </View>
            {ready ? (
              <Btn
                label="CLAIM"
                tone="skr"
                size="sm"
                busy={busy === q.id}
                style={{ width: 86 }}
                onPress={async () => {
                  setBusy(q.id);
                  try {
                    const r = await claimQuest(q.id);
                    say(`+${r.skr} ${SKR_LABEL}${r.bonus ? ` · all done: ${CHESTS[r.bonus.tier].name}!` : ''}`, 'ok');
                  } finally { setBusy(null); }
                }}
              />
            ) : (
              <Body size={12} bold color={claimed ? C.teal : C.dim} style={{ width: 86, textAlign: 'right' }}>
                {claimed ? 'Done' : `${p}/${q.goal}`}
              </Body>
            )}
          </View>
        );
      })}
      <Body size={11} color={C.dim}>
        {quests.bonusClaimed ? `All three done. ${CHESTS[QUEST_BONUS].name} earned — back tomorrow.` : `Finish all three for a ${CHESTS[QUEST_BONUS].name}. ${done}/3 done.`}
      </Body>
    </Well>
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
          <PressScale
            key={r.name}
            onPress={() => { haptic.tap(); setRival(i); }}
            style={[st.rival, rival === i && st.rivalOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: rival === i }}
            accessibilityLabel={`Rival ${r.name}, ${r.levelDelta < 0 ? 'easier' : r.levelDelta > 0 ? 'harder' : 'even'}`}
          >
            <Body size={12} color="#fff" bold>{r.name.replace(' (AI)', '')}</Body>
            <Body size={10} color={C.dim}>
              {r.levelDelta < 0 ? 'Easier' : r.levelDelta > 0 ? 'Harder' : 'Even'} · AI pilot
            </Body>
          </PressScale>
        ))}
      </ScrollView>
      <View style={st.modes}>
        {[{ id: false, label: 'Standard · 3:00' }, { id: true, label: 'Rush · 0:30' }].map((m) => (
          <PressScale
            key={m.label}
            onPress={() => { haptic.tap(); setRush(m.id); }}
            containerStyle={{ flex: 1 }}
            style={[st.mode, rush === m.id && st.modeOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: rush === m.id }}
            accessibilityLabel={m.label}
          >
            <Body size={12} bold color={rush === m.id ? C.ink : '#fff'}>{m.label}</Body>
          </PressScale>
        ))}
      </View>
      <Btn
        label="BATTLE"
        sub={`3D arena · ${rush ? '30 s rush' : '3 min'} · chest + SKR on a win`}
        size="lg"
        tone="blue"
        onPress={() => openBattle(prepareMatch(rival, rush))}
      />
      <Btn
        label="CHALLENGE A FRIEND"
        tone="ghost"
        size="sm"
        style={{ marginTop: 10 }}
        onPress={() => { void Share.share({ message: challengeMessage(rival, rush) }).catch(() => {}); }}
      />
    </Panel>
  );
}

function CoachTeaser() {
  const setCoach = useUi((s) => s.setCoach);
  const runs = useGame((s) => s.coachRuns);
  return (
    <Pressable onPress={() => { haptic.tap(); setCoach(true); }} accessibilityRole="button" accessibilityLabel="Open the AI coach" style={({ pressed }) => pressed && st.pressed}>
      <LinearGradient colors={['#2b1a5e', '#14418f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.coach}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Display size={20}>AI Coach</Display>
            <Tag text="ON-DEVICE" color={C.teal} />
          </View>
          <Body size={12} color={C.dim}>
            Plays your deck against every rival with the real battle engine, then finds the swap that wins more.
          </Body>
          {runs > 0 ? <Body size={11} color={C.teal}>{runs} scouting {runs === 1 ? 'run' : 'runs'} so far</Body> : null}
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
      <Rise delay={60}><Quests /></Rise>
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
  streakNum: { fontFamily: F.display, fontSize: 30, color: C.gold },
  streakLbl: { fontFamily: F.uiBold, fontSize: 10, color: '#fff' },
  streakBadge: {
    flexShrink: 0,
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
    minHeight: 44, justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 2, borderColor: 'transparent',
  },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mode: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  quest: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  stampWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  stamp: {
    borderWidth: 5, borderColor: C.red, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 6,
    alignItems: 'center', backgroundColor: 'rgba(255,248,236,0.92)',
  },
  modeOn: { backgroundColor: C.gold },
  rivalOn: { borderColor: C.gold, backgroundColor: 'rgba(255,196,34,0.15)' },
  coach: {
    borderRadius: R.panel, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 2, borderColor: 'rgba(153,69,255,0.6)',
  },
});

