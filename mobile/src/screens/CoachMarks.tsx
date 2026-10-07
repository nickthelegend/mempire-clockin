import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { EASE_IN_OUT, EASE_OUT, reduceMotion } from '../motion';
import { C, F } from '../theme';

/**
 * Coach marks for the guided first battle. Purely an overlay (pointerEvents
 * none) so every touch still reaches the arena underneath — the player learns
 * by doing, not by tapping "Next".
 *
 * Steps: 1) drag a card onto your half (a ghost finger shows the motion),
 * 2) what elixir is, 3) what wins the match. The native arena advances on the
 * player's first deploy; the web arena advances on a timer.
 */
const STEPS = [
  { title: 'Drag a card onto your half', body: 'Anywhere below the river. Your fighter walks the lane on its own.', at: 'field' },
  { title: 'Cards cost elixir', body: 'The purple bar refills by itself. The number on a card is its cost.', at: 'elixir' },
  { title: 'Knock down towers', body: 'Each tower you topple is a crown. Most crowns when time runs out wins.', at: 'top' },
] as const;

export function CoachMarks({ mode, deployed = 0 }: { mode: 'native' | 'web'; deployed?: number }) {
  const { width: W, height: H } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [gone, setGone] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const finger = useRef(new Animated.Value(0)).current;
  const start = useRef(deployed);

  // Advance: on the first deploy (native) or after a beat (web), then on a timer.
  useEffect(() => {
    if (mode === 'native' && step === 0 && deployed > start.current) setStep(1);
  }, [deployed, mode, step]);
  useEffect(() => {
    const ms = step === 0 ? (mode === 'web' ? 7000 : 15000) : 5500;
    const t = setTimeout(() => (step < STEPS.length - 1 ? setStep(step + 1) : setGone(true)), ms);
    return () => clearTimeout(t);
  }, [step, mode]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [step, fade]);

  // The ghost finger: card → field, on a loop. Still under Reduce Motion.
  useEffect(() => {
    if (step !== 0 || reduceMotion()) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(finger, { toValue: 1, duration: 1100, easing: EASE_IN_OUT, useNativeDriver: true }),
      Animated.delay(450),
      Animated.timing(finger, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(250),
    ]));
    loop.start();
    return () => loop.stop();
  }, [step, finger]);

  if (gone) return null;
  const s = STEPS[step];
  const bubbleTop = s.at === 'field' ? H * 0.36 : s.at === 'elixir' ? H * 0.58 : H * 0.16;
  const from = { x: W * 0.24, y: H * 0.86 };
  const to = { x: W * 0.62, y: H * (mode === 'native' ? 0.47 : 0.63) };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite">
      <Animated.View style={[st.bubble, { top: bubbleTop, opacity: fade }]} accessible accessibilityLabel={`${s.title}. ${s.body}`}>
        <Text style={st.step} maxFontSizeMultiplier={1.3}>TUTORIAL · {step + 1}/{STEPS.length}</Text>
        <Text style={st.title} maxFontSizeMultiplier={1.3}>{s.title}</Text>
        <Text style={st.body} maxFontSizeMultiplier={1.3}>{s.body}</Text>
      </Animated.View>
      {step === 0 ? (
        <>
          <View style={[st.target, { left: to.x - 34, top: to.y - 34 }]} />
          <Animated.View
            style={[st.finger, {
              opacity: finger.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0.2] }),
              transform: [
                { translateX: finger.interpolate({ inputRange: [0, 1], outputRange: [from.x - 18, to.x - 18] }) },
                { translateY: finger.interpolate({ inputRange: [0, 1], outputRange: [from.y - 18, to.y - 18] }) },
              ],
            }]}
          />
        </>
      ) : null}
      {step === 1 ? <View style={[st.ring, { left: 8, right: 8, top: H * 0.735, height: 36 }]} /> : null}
    </View>
  );
}

const st = StyleSheet.create({
  bubble: {
    position: 'absolute', left: 20, right: 20, backgroundColor: 'rgba(16,32,63,0.94)', borderRadius: 16,
    padding: 14, borderWidth: 2, borderColor: C.gold, gap: 4,
  },
  step: { color: C.gold, fontFamily: F.uiBold, fontSize: 11, letterSpacing: 1 },
  title: { color: '#fff', fontFamily: F.display, fontSize: 22 },
  body: { color: C.dim, fontFamily: F.ui, fontSize: 14, lineHeight: 19 },
  target: { position: 'absolute', width: 68, height: 68, borderRadius: 34, borderWidth: 3, borderColor: C.teal, backgroundColor: 'rgba(20,241,149,0.15)' },
  finger: { position: 'absolute', left: 0, top: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 3, borderColor: C.gold },
  ring: { position: 'absolute', borderRadius: 12, borderWidth: 3, borderColor: C.gold },
});
