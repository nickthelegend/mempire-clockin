import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { reduceMotion } from '../motion';
import { C } from '../theme';

/**
 * Screen art is a hero header, never a full-screen wallpaper: the top ~38% of
 * the screen, anchored top, drifting slowly (scale 1.02 → 1.06 over 20 s),
 * fading over its last 40% into the solid page colour. Body text never sits
 * on the art; titles on the hero sit on a ribbon.
 */
export const HERO_FRACTION = 0.38;

export function useHeroHeight(): number {
  const { height } = useWindowDimensions();
  return Math.round(height * HERO_FRACTION);
}

export function Hero({ source, dim = 0, top = 0 }: { source: ImageSourcePropType; dim?: number; top?: number }) {
  const { width } = useWindowDimensions();
  const h = useHeroHeight();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 10_000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 10_000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [drift]);
  // The art is 941×1672 with its subject in the top ~45%: cover the hero box
  // from the top, so the castle/vault/colosseum fills it.
  const artH = width * (1672 / 941);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
      <View style={{ position: 'absolute', left: 0, right: 0, top, height: h, overflow: 'hidden' }}>
        <Animated.Image
          source={source}
          resizeMode="cover"
          style={{
            width, height: artH, transformOrigin: 'top',
            transform: [{ scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.06] }) }],
          }}
        />
        {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(6,10,30,${dim})` }]} /> : null}
        <LinearGradient
          colors={['rgba(10,16,40,0)', 'rgba(10,16,40,0.85)', C.bg]}
          locations={[0, 0.7, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 0.4 }}
        />
      </View>
      {/* A faint radial glow behind the first panel. */}
      <View style={{ position: 'absolute', top: top + h - 60, alignSelf: 'center', width: width * 1.2, height: width * 0.9, borderRadius: width, backgroundColor: 'rgba(27,42,94,0.3)' }} />
    </View>
  );
}

/**
 * The space a screen gives its hero: content placed inside sits at the
 * bottom of the art (a ribbon title, a logo), and whatever follows overlaps
 * the hero's lower edge by 40 px.
 */
export function HeroSpace({ children, style, offset = 0 }: { children?: ReactNode; style?: StyleProp<ViewStyle>; offset?: number }) {
  const h = useHeroHeight();
  return <View style={[{ height: h - 40 - offset, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 14 }, style]}>{children}</View>;
}

/** Older call sites: a hero for sheets (with a darker overlay). */
export function DriftBackground({ source, dim = 0 }: { source: ImageSourcePropType; dim?: number }) {
  return <Hero source={source} dim={dim} />;
}
