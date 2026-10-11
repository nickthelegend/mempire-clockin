import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { reduceMotion } from '../motion';
import { C } from '../theme';

/**
 * A reward burst: sun rays that spin in behind the prize and a ring of
 * confetti that flies out and falls. Purely decorative (pointerEvents none);
 * fires once per `burst` value. With Reduce Motion on, only the rays fade in.
 */
const COLORS = [C.gold, C.goldHi, C.teal, '#ff7ae0', C.bluePale, '#ffffff', C.skr];

export function Celebrate({ burst, size = 320, colors = COLORS }: { burst: number | string | null; size?: number; colors?: string[] }) {
  const t = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const bits = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    a: (i / 22) * Math.PI * 2 + Math.random() * 0.3,
    d: size * (0.32 + Math.random() * 0.22),
    s: 6 + Math.random() * 8,
    c: colors[i % colors.length],
    r: Math.random() * 360,
  })), [burst, size, colors]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (burst === null) return undefined;
    t.setValue(0);
    const rm = reduceMotion();
    Animated.timing(t, { toValue: 1, duration: rm ? 300 : 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (rm) return undefined;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [burst, t, spin]);

  if (burst === null) return null;
  const rm = reduceMotion();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={{
        position: 'absolute', width: size, height: size,
        opacity: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0.55] }),
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={{
            position: 'absolute', left: size / 2 - 10, top: 0, width: 20, height: size / 2,
            backgroundColor: i % 2 ? 'rgba(255,227,138,0.22)' : 'rgba(255,196,34,0.12)',
            borderTopLeftRadius: 10, borderTopRightRadius: 10,
            transform: [{ translateY: size / 4 }, { rotate: `${i * 30}deg` }, { translateY: -size / 4 }],
          }}
          />
        ))}
      </Animated.View>
      {rm ? null : bits.map((b, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', width: b.s, height: b.s * 1.6, borderRadius: 2, backgroundColor: b.c,
          opacity: t.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(b.a) * b.d] }) },
            { translateY: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, Math.sin(b.a) * b.d, Math.sin(b.a) * b.d + 70] }) },
            { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`${b.r}deg`, `${b.r + 540}deg`] }) },
          ],
        }}
        />
      ))}
    </View>
  );
}

/** Pop-in for the prize itself: overshoot scale from 0.3 to 1. */
export function usePopIn(trigger: unknown): Animated.Value {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (trigger === null || trigger === undefined || trigger === false) return;
    if (reduceMotion()) { v.setValue(1); return; }
    v.setValue(0.3);
    Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [trigger, v]);
  return v;
}
