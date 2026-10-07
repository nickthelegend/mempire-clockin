import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { UI_ART, CARD_ART } from '../data/art';
import { BY_TICKER, COPIES_TO_LEVEL, MAX_LEVEL, type OwnedCard } from '../game/rules';
import { haptic } from '../notify';
import { EASE_OUT, reduceMotion } from '../motion';
import { sfx } from '../sound';
import { ARCH_ICONS, ARCH_NAMES, C, F, R, TIER_COLORS } from '../theme';

// ── type ────────────────────────────────────────────────────────────────────

export function Display({ children, size = 24, color = C.text, style }: {
  children: ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      maxFontSizeMultiplier={1.35}
      style={[{
        fontFamily: F.display, fontSize: size, color, letterSpacing: 0.5,
        textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
      }, style]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, size = 14, color = C.dim, style, bold, numberOfLines }: {
  children: ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle>; bold?: boolean; numberOfLines?: number;
}) {
  return (
    <Text maxFontSizeMultiplier={1.35} numberOfLines={numberOfLines} style={[{ fontFamily: bold ? F.uiBold : F.ui, fontSize: size, color }, style]}>
      {children}
    </Text>
  );
}

// ── surfaces ────────────────────────────────────────────────────────────────

/** Carved wood panel — the game's primary container. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.panelEdge, style]}>
      <LinearGradient colors={[C.woodHi, C.wood, C.woodDark]} style={s.panel}>
        {children}
      </LinearGradient>
    </View>
  );
}

/** Recessed navy well for secondary content. */
export function Well({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.well, style]}>{children}</View>;
}

// ── buttons ─────────────────────────────────────────────────────────────────

type Tone = 'gold' | 'blue' | 'green' | 'ghost' | 'skr';
const TONES: Record<Tone, { top: string; bottom: string; edge: string; text: string }> = {
  gold: { top: '#ffd766', bottom: C.btnGold, edge: C.btnGoldDark, text: C.ink },
  blue: { top: '#7cc6ff', bottom: C.btnBlue, edge: C.btnBlueDark, text: '#fff' },
  green: { top: '#8ce85a', bottom: C.btnGreen, edge: C.btnGreenDark, text: '#fff' },
  skr: { top: '#e6ff8a', bottom: C.skr, edge: '#6f8f00', text: C.ink },
  ghost: { top: 'rgba(255,255,255,0.14)', bottom: 'rgba(255,255,255,0.06)', edge: 'rgba(0,0,0,0.35)', text: '#fff' },
};

/**
 * The fat arcade button: presses down into its own base edge, with a haptic
 * tick. Every primary action in the app is one of these.
 */
export function Btn({
  label, onPress, tone = 'gold', disabled, busy, size = 'md', style, sub,
}: {
  label: string; onPress?: () => void; tone?: Tone; disabled?: boolean; busy?: boolean;
  size?: 'sm' | 'md' | 'lg'; style?: StyleProp<ViewStyle>; sub?: string;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const t = TONES[tone];
  const h = size === 'lg' ? 64 : size === 'sm' ? 38 : 50;
  const fs = size === 'lg' ? 26 : size === 'sm' ? 15 : 19;
  const off = disabled || busy;
  const to = (v: number) => Animated.spring(press, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={off}
      onPressIn={() => { to(1); haptic.light(); sfx('click'); }}
      onPressOut={() => to(0)}
      onPress={onPress}
      style={[{ opacity: off ? 0.55 : 1 }, style]}
    >
      <View style={{ minHeight: h + 5, paddingBottom: 5, borderRadius: R.pill, backgroundColor: t.edge }}>
        <Animated.View style={{ transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }}>
          <LinearGradient
            colors={[t.top, t.bottom]}
            style={{
              minHeight: h, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 14, paddingVertical: 6,
            }}
          >
            {busy ? <ActivityIndicator color={t.text} /> : (
              <>
                <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.display, fontSize: fs, color: t.text, letterSpacing: 0.6, textAlign: 'center' }}>{label}</Text>
                {sub ? <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.uiBold, fontSize: 11, color: t.text, opacity: 0.85, textAlign: 'center' }}>{sub}</Text> : null}
              </>
            )}
          </LinearGradient>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ── chips ───────────────────────────────────────────────────────────────────

/**
 * Anything pressable that is not a Btn: scales to 0.97 on press (ease-out,
 * ~120 ms), so every tap is acknowledged. No movement under Reduce Motion,
 * just a dim.
 */
export function PressScale({
  children, onPress, style, containerStyle, accessibilityLabel, accessibilityRole = 'button', accessibilityState, hitSlop, disabled,
}: {
  children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
  /** Layout for the touch target itself (e.g. flex: 1 in a row). */
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab' | 'radio' | 'link' | 'switch'; accessibilityState?: object; hitSlop?: number; disabled?: boolean;
}) {
  const v = useRef(new Animated.Value(0)).current;
  const to = (x: number) => Animated.timing(v, { toValue: x, duration: x ? 90 : 160, easing: EASE_OUT, useNativeDriver: true }).start();
  const rm = reduceMotion();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      disabled={disabled}
      hitSlop={hitSlop}
      style={containerStyle}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
    >
      <Animated.View
        style={[style, rm
          ? { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }
          : { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }] }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

export function Chip({ label, value, color = C.gold, onPress, tag }: {
  label: string; value: string; color?: string; onPress?: () => void; tag?: string;
}) {
  return (
    <PressScale onPress={onPress} style={s.chip} accessibilityLabel={`${label} ${value}${tag ? `, ${tag}` : ''}`}>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.uiBold, fontSize: 11, color, letterSpacing: 0.5 }}>{label}</Text>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.display, fontSize: 16, color: '#fff' }}>{value}</Text>
      {tag ? <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.ui, fontSize: 9, color: C.dim }}>{tag}</Text> : null}
    </PressScale>
  );
}

export function Tag({ text, color = C.teal }: { text: string; color?: string }) {
  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: color, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.uiBold, fontSize: 10, color, letterSpacing: 0.4 }}>{text}</Text>
    </View>
  );
}

// ── game pieces ─────────────────────────────────────────────────────────────

export function ArchIcon({ arch, size = 18 }: { arch: number; size?: number }) {
  return <Image source={UI_ART[ARCH_ICONS[arch]]} style={{ width: size, height: size }} accessibilityLabel={ARCH_NAMES[arch]} />;
}

/** A fighter card: art, level, archetype, copy progress. */
export function CardTile({
  ticker, owned, width = 100, onPress, selected, dim,
}: {
  ticker: string; owned?: OwnedCard; width?: number; onPress?: () => void; selected?: boolean; dim?: boolean;
}) {
  const f = BY_TICKER.get(ticker);
  if (!f) return null;
  const need = owned && owned.level < MAX_LEVEL ? COPIES_TO_LEVEL[owned.level] : 0;
  const pct = owned && need ? Math.min(1, owned.copies / need) : 1;
  const ready = !!owned && need > 0 && owned.copies >= need;
  const h = width * 1.33;
  return (
    <PressScale
      onPress={onPress ? () => { haptic.tap(); onPress(); } : undefined}
      disabled={!onPress}
      style={{ width, opacity: dim ? 0.38 : 1 }}
      accessibilityLabel={`${ticker}${owned ? ` level ${owned.level}` : ' not owned'}`}
    >
      <View style={[s.card, { height: h, borderColor: selected ? C.gold : 'rgba(0,0,0,0.55)', borderWidth: selected ? 3 : 2 }]}>
        <LinearGradient colors={[`hsl(${f.hue},70%,55%)`, `hsl(${f.hue},60%,22%)`]} style={StyleSheet.absoluteFill} />
        <Image source={CARD_ART[ticker]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        <View style={s.cardTop}>
          <ArchIcon arch={f.archetype} size={18} />
        </View>
        {owned ? (
          <View style={s.cardLevel}><Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.display, fontSize: 12, color: '#fff' }}>Lv {owned.level}</Text></View>
        ) : null}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={s.cardFoot}>
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={{ fontFamily: F.display, fontSize: width > 90 ? 14 : 12, color: '#fff' }}>${ticker}</Text>
        </LinearGradient>
      </View>
      {owned ? (
        <View style={s.bar}>
          <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: ready ? C.teal : C.bluePale, borderRadius: 4 }} />
          <Text maxFontSizeMultiplier={1.2} style={s.barText}>{owned.level >= MAX_LEVEL ? 'MAX' : `${owned.copies}/${need}`}</Text>
        </View>
      ) : null}
    </PressScale>
  );
}

export function ChestArt({ tier, size = 64 }: { tier: string; size?: number }) {
  const key = `chest_${tier}` as keyof typeof UI_ART;
  return <Image source={UI_ART[key] ?? UI_ART.chest_silver} style={{ width: size, height: size }} resizeMode="contain" />;
}

export function TierGlow({ tier }: { tier: string }) {
  const [a, b] = TIER_COLORS[tier] ?? TIER_COLORS.silver;
  return <LinearGradient colors={[a, b]} style={[StyleSheet.absoluteFill, { opacity: 0.22, borderRadius: R.card }]} />;
}

/** Fade + rise on mount — how every screen and sheet arrives. */
export function Rise({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[style, {
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion() ? 0 : 14, 0] }) }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

export function Progress({ value, color = C.teal, height = 10 }: { value: number; color?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: C.recess, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

const s = StyleSheet.create({
  panelEdge: { borderRadius: R.panel, backgroundColor: C.woodEdge, padding: 3 },
  panel: {
    borderRadius: R.panel - 2, padding: 14,
    borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.25)',
  },
  well: { backgroundColor: C.recess, borderRadius: R.card, padding: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' },
  chip: {
    minHeight: 44, justifyContent: 'center',
    backgroundColor: 'rgba(9,22,48,0.7)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.5)', alignItems: 'center', minWidth: 62,
  },
  card: { borderRadius: R.card, overflow: 'hidden', backgroundColor: C.ink },
  cardTop: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, padding: 2 },
  cardLevel: {
    position: 'absolute', top: 4, right: 4, backgroundColor: C.blueLit, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.5)',
  },
  cardFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingBottom: 4, paddingTop: 14 },
  bar: { height: 14, marginTop: 4, borderRadius: 4, backgroundColor: C.recess, overflow: 'hidden', justifyContent: 'center' },
  barText: { position: 'absolute', alignSelf: 'center', fontFamily: F.uiBold, fontSize: 10, color: '#fff' },
});
