import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CARD_ART, UI_ART } from '../data/art';
import { INTRO_FIGHTERS } from '../data/showcase';
import { prepareMatch } from '../game/actions';
import { EASE_OUT, reduceMotion } from '../motion';
import { haptic } from '../notify';
import { sfx } from '../sound';
import { markFtue, useUi } from '../state/ui';
import { C } from '../theme';
import { Body, Btn, Display } from '../ui/kit';

/**
 * First run: three beats, then a guided battle. Skippable at every step.
 * The point is to get a new player into a match inside a minute, knowing the
 * three things that bring them back: the daily Clock-In, the battle, SKR.
 */
const SLIDES = [
  {
    kicker: 'EVERY DAY',
    title: 'Clock in, keep the streak',
    body: 'One tap a day. Seven days build to a Legendary chest, and your streak is signed on Solana devnet.',
    art: 'clockin',
  },
  {
    kicker: 'EVERY MATCH',
    title: 'Every coin is a fighter',
    body: 'Drag fighters into a real-time 3D arena. Topple towers for crowns. A Rush match is thirty seconds.',
    art: 'battle',
  },
  {
    kicker: 'SKR',
    title: 'Earn SKR by showing up',
    body: 'Clock-ins, wins and daily quests pay SKR. Spend it on Streak Shields so a missed day never resets you.',
    art: 'skr',
  },
] as const;

function Art({ kind }: { kind: (typeof SLIDES)[number]['art'] }) {
  if (kind === 'clockin') {
    return (
      <View style={st.artRow}>
        <Image source={UI_ART.chest_silver} style={st.chestSm} />
        <Image source={UI_ART.chest_golden} style={st.chestSm} />
        <Image source={UI_ART.chest_legendary} style={st.chestLg} />
      </View>
    );
  }
  if (kind === 'battle') {
    return (
      <View style={st.artRow}>
        {INTRO_FIGHTERS.map((t, i) => (
          <LinearGradient key={t} colors={['#3a2a6e', '#1b2c55']} style={[st.card, { transform: [{ rotate: `${(i - 1) * 10}deg` }, { translateY: i === 1 ? -10 : 4 }] }]}>
            <Image source={CARD_ART[t]} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          </LinearGradient>
        ))}
      </View>
    );
  }
  return (
    <View style={st.artRow}>
      <View style={st.skrCoin}><Display size={30} color={C.ink}>SKR</Display></View>
      <Image source={UI_ART.chest_magic} style={st.chestLg} />
    </View>
  );
}

export function Intro() {
  const open = useUi((s) => s.introOpen);
  const setIntro = useUi((s) => s.setIntro);
  const openBattle = useUi((s) => s.openBattle);
  const [i, setI] = useState(0);
  const v = useRef(new Animated.Value(1)).current;

  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 280, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [i, v]);

  if (!open) return null;
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  const skip = () => { haptic.tap(); markFtue(true); setIntro(false); };
  const play = () => {
    haptic.success();
    sfx('reward');
    setIntro(false);
    // Easiest rival, Rush format: a whole match in thirty seconds.
    openBattle(prepareMatch(0, true, true));
  };
  const move = reduceMotion() ? 0 : 24;

  return (
    <Modal visible animationType="fade" onRequestClose={skip} statusBarTranslucent>
      <LinearGradient colors={[C.blueLit, C.blue, C.blueDeep]} style={st.wrap}>
        <View style={st.top}>
          <Image source={UI_ART.logo} style={st.logo} resizeMode="contain" accessibilityLabel="Mempire" />
          <Pressable onPress={skip} hitSlop={12} style={st.skip} accessibilityRole="button" accessibilityLabel="Skip intro">
            <Body bold color={C.dim}>Skip</Body>
          </Pressable>
        </View>
        <Animated.View
          style={[st.body, { opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [move, 0] }) }] }]}
        >
          <Art kind={s.art} />
          <Body size={12} bold color={C.gold} style={{ letterSpacing: 1.5, textAlign: 'center' }}>{s.kicker}</Body>
          <Display size={32} style={{ textAlign: 'center' }}>{s.title}</Display>
          <Body size={16} style={{ textAlign: 'center' }}>{s.body}</Body>
        </Animated.View>
        <View style={st.dots} accessibilityLabel={`Step ${i + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, k) => <View key={k} style={[st.dot, k === i && st.dotOn]} />)}
        </View>
        <View style={{ gap: 10 }}>
          {last ? (
            <>
              <Btn label="PLAY YOUR FIRST BATTLE" sub="30-second guided match · Golden chest when it ends" size="lg" onPress={play} />
              <Btn label="Maybe later" tone="ghost" size="sm" onPress={skip} />
            </>
          ) : (
            <Btn label="NEXT" size="lg" onPress={() => { haptic.tap(); setI(i + 1); }} />
          )}
        </View>
      </LinearGradient>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, padding: 22, paddingTop: 64, paddingBottom: 40, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 170, height: 60 },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 12, alignItems: 'center' },
  artRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10, height: 200, marginBottom: 8 },
  chestSm: { width: 84, height: 84 },
  chestLg: { width: 140, height: 140 },
  card: { width: 100, height: 132, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)', marginHorizontal: -10, overflow: 'hidden' },
  skrCoin: { width: 110, height: 110, borderRadius: 55, backgroundColor: C.skr, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#6f8f00' },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { width: 22, backgroundColor: C.gold },
});
