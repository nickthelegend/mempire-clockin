import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View,
  type ImageSourcePropType, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { UI_ART, CARD_ART } from '../data/art';
import { FRAME_ART, PREMIUM_UI, REWARD_ART, UI_ICON } from '../data/cosmeticArt';
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
        textShadowColor: 'rgba(10,6,30,0.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
      }, style]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, size = 14, color = C.dim, style, bold, numberOfLines }: {
  children: ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle>; bold?: boolean; numberOfLines?: number;
}) {
  // System font for body copy, 15 px at most.
  return (
    <Text maxFontSizeMultiplier={1.35} numberOfLines={numberOfLines} style={[{ fontSize: Math.min(size, 15), fontWeight: bold ? '700' : '500', color }, style]}>
      {children}
    </Text>
  );
}

// ── surfaces ────────────────────────────────────────────────────────────────

/**
 * The panel: navy, radius 20, a thin gold gradient rim, an inner top
 * highlight and a soft drop shadow. The one container for primary content.
 */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.panelShadow, style]}>
      <LinearGradient colors={['rgba(247,215,116,0.6)', 'rgba(184,134,43,0.6)']} style={s.panelRim}>
        <View style={s.panel}>
          <View pointerEvents="none" style={s.panelLip} />
          {children}
        </View>
      </LinearGradient>
    </View>
  );
}

/** A raised tile (or secondary panel): radius 14, one step lighter. */
export function Well({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.well, style]}>
      <View pointerEvents="none" style={s.wellLip} />
      {children}
    </View>
  );
}

// ── buttons ─────────────────────────────────────────────────────────────────

type Tone = 'gold' | 'blue' | 'green' | 'ghost' | 'skr';
const TONES: Record<Tone, { top: string; mid?: string; bottom: string; edge: string; text: string }> = {
  // Primary: gold. Secondary: purple. Prices (skr) are gold too, never olive.
  gold: { top: '#FFE08A', mid: '#F2B33D', bottom: '#C98316', edge: '#8A5A0C', text: '#3A2200' },
  skr: { top: '#FFE08A', mid: '#F2B33D', bottom: '#C98316', edge: '#8A5A0C', text: '#3A2200' },
  blue: { top: '#9B6CFF', bottom: '#6A3FE0', edge: '#3F2399', text: '#fff' },
  green: { top: '#6CF2B5', bottom: '#2DB57A', edge: '#1A6E4A', text: '#fff' },
  ghost: { top: '#26336A', bottom: '#18234D', edge: '#0B1230', text: '#fff' },
};
/** Disabled: a flat slate pill. A faded gold or purple reads as olive or grey-brown on navy. */
const OFF_TONE = { top: '#1E2850', bottom: '#161E40', edge: '#0B1230', text: '#8E9AC4' };

/**
 * The fat arcade button: presses down into its own base edge, with a haptic
 * tick. Every primary action in the app is one of these.
 */
export function Btn({
  label, onPress, tone = 'gold', disabled, busy, size = 'md', style, sub, icon, pulse,
}: {
  label: string; onPress?: () => void; tone?: Tone; disabled?: boolean; busy?: boolean;
  size?: 'sm' | 'md' | 'lg'; style?: StyleProp<ViewStyle>; sub?: string;
  /** Art drawn before the label (feature icons). */
  icon?: ImageSourcePropType;
  /** The icon breathes gently (the PLAY emblem). */
  pulse?: boolean;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse || reduceMotion()) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, breathe]);
  const t: { top: string; mid?: string; bottom: string; edge: string; text: string } = disabled && !busy ? OFF_TONE : TONES[tone];
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
      style={[{ opacity: busy ? 0.8 : 1 }, style]}
    >
      <View style={{ minHeight: h + 5, paddingBottom: 5, borderRadius: R.pill, backgroundColor: t.edge }}>
        <Animated.View style={{ transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }}>
          <LinearGradient
            colors={t.mid ? [t.top, t.mid, t.bottom] : [t.top, t.bottom]}
            style={{
              minHeight: h, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 14, paddingVertical: 6,
            }}
          >
            {busy ? <ActivityIndicator color={t.text} /> : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {icon ? <Animated.Image source={icon} style={{ width: fs * (pulse ? 2 : 1.4), height: fs * (pulse ? 2 : 1.4), marginVertical: pulse ? -8 : 0, transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }} resizeMode="contain" /> : null}
                  <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: F.display, fontSize: fs, color: t.text, letterSpacing: 0.6, textAlign: 'center' }}>{label}</Text>
                </View>
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

export function Chip({ label, value, color = C.gold, onPress, tag, icon }: {
  label: string; value: string; color?: string; onPress?: () => void; tag?: string;
  /** A small coin/badge drawn before the value (e.g. the SKR coin). */
  icon?: ImageSourcePropType;
}) {
  return (
    <PressScale onPress={onPress} style={s.chip} accessibilityLabel={`${label} ${value}${tag ? `, ${tag}` : ''}`}>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.uiBold, fontSize: 11, color, letterSpacing: 0.5 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {icon ? <Image source={icon} style={{ width: 15, height: 15 }} /> : null}
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.display, fontSize: 16, color: '#fff' }}>{value}</Text>
      </View>
      {tag ? <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.ui, fontSize: 9, color: C.dim }}>{tag}</Text> : null}
    </PressScale>
  );
}

export function Tag({ text, color = C.teal }: { text: string; color?: string }) {
  if (!text.trim()) return null;
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
/**
 * A card frame cosmetic: the frame art stretched over the card it decorates
 * (the art is portrait with a hollow centre, so it scales to any card shape).
 */
export function FrameOverlay({ frame, inset = -3 }: { frame: string; inset?: number }) {
  const src = FRAME_ART[frame];
  if (!src) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: inset, right: inset, top: inset, bottom: inset }} accessibilityElementsHidden importantForAccessibility="no">
      <Image source={src} resizeMode="stretch" style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

/** The SKR coin. */
export function SkrIcon({ size = 18, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={REWARD_ART.skr} style={[{ width: size, height: size }, style]} accessibilityLabel="SKR" />;
}

export function CardTile({
  ticker, owned, width = 100, onPress, selected, dim, frame,
}: {
  ticker: string; owned?: OwnedCard; width?: number; onPress?: () => void; selected?: boolean; dim?: boolean;
  /** The equipped card frame's key (cosmetic art drawn over the card). */
  frame?: string | null;
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
      style={{ width }}
      accessibilityLabel={`${ticker}${owned ? ` level ${owned.level}` : ' not owned'}`}
    >
      <View style={[s.card, { height: h, borderColor: selected ? C.gold : 'rgba(0,0,0,0.55)', borderWidth: selected ? 3 : 2 }]}>
        <LinearGradient colors={[`hsl(${f.hue},70%,55%)`, `hsl(${f.hue},60%,22%)`]} style={StyleSheet.absoluteFill} />
        <Image source={CARD_ART[ticker]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        <View style={s.cardTop}>
          <ArchIcon arch={f.archetype} size={18} />
        </View>
        {frame && !selected ? <FrameOverlay frame={frame} inset={0} /> : null}
        {dim ? (
          // Not found yet: a solid navy veil (not see-through, so the hero art never shows through) and a lock.
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,16,40,0.72)', alignItems: 'center', justifyContent: 'center' }]}>
            <Image source={UI_ICON.lock} style={{ width: width * 0.3, height: width * 0.3, opacity: 0.9 }} resizeMode="contain" accessibilityLabel="Not found yet" />
          </View>
        ) : null}
        {owned ? (
          <View style={s.cardLevel}><Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.display, fontSize: 12, color: '#fff' }}>Lv {owned.level}</Text></View>
        ) : null}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={s.cardFoot}>
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={{ fontFamily: F.display, fontSize: width > 90 ? 14 : 12, color: '#fff' }}>${ticker}</Text>
        </LinearGradient>
      </View>
      {owned ? (
        <View style={s.bar}>
          <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: ready ? C.teal : C.purple, borderRadius: 4 }} />
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
  // A lit navy tile with a tier-coloured rim and floor glow. (A flat tint of
  // gold over navy reads as olive/brown, so the colour stays on the edges.)
  const [a, b] = TIER_COLORS[tier] ?? TIER_COLORS.silver;
  return (
    <>
      <LinearGradient colors={[C.panelRaised, C.panel]} style={[StyleSheet.absoluteFill, { borderRadius: R.card }]} />
      <LinearGradient colors={['rgba(255,255,255,0)', `${a}38`]} start={{ x: 0.5, y: 0.45 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: R.card, borderWidth: 2, borderColor: b }]} />
      <View style={{ position: 'absolute', top: 2, left: 10, right: 10, height: 1.5, borderRadius: 1, backgroundColor: `${a}AA` }} />
    </>
  );
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
  panelShadow: { borderRadius: R.panel, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  panelRim: { borderRadius: R.panel, padding: 1.5 },
  panel: { borderRadius: R.panel - 1.5, padding: 16, backgroundColor: C.panel, overflow: 'hidden' },
  panelLip: { position: 'absolute', left: 0, right: 0, top: 0, height: 1.5, backgroundColor: 'rgba(255,255,255,0.08)' },
  well: { borderRadius: R.card, padding: 12, backgroundColor: C.panelRaised, borderWidth: 1, borderColor: 'rgba(247,215,116,0.14)' },
  wellLip: { position: 'absolute', left: 10, right: 10, top: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
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

// ── banners ─────────────────────────────────────────────────────────────────

/**
 * The title ribbon (painted art): sized to fit its title, the title centred on
 * the band in the display face with a dark stroke. `tone` is kept for older
 * call sites; the ribbon art is the one look.
 */
export function Ribbon({ text, size = 24, style, color = '#fff' }: {
  text: string; tone?: string; size?: number; style?: StyleProp<ViewStyle>; color?: string;
}) {
  const h = Math.round(size * 2.7);
  const natural = h * (504 / 190);
  const textW = text.length * size * 0.6;
  const w = Math.max(natural, textW / 0.5);
  return (
    <View style={[{ width: w, height: h, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }, style]} accessibilityRole="header" accessibilityLabel={text}>
      <Image source={PREMIUM_UI.ribbon} resizeMode="stretch" style={{ position: 'absolute', width: w, height: h }} />
      <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={{
        fontFamily: F.display, fontSize: size, color, marginTop: -h * 0.12, maxWidth: w * 0.62,
        textShadowColor: '#2a0f5c', textShadowOffset: { width: 0, height: 2.5 }, textShadowRadius: 3,
      }}
      >{text}</Text>
    </View>
  );
}

/**
 * A ring of dots that empties as time runs out (no SVG): `left` is the share
 * of the period still to go, 0..1. Lit dots are the time remaining.
 */
export function CountdownRing({ left, size = 64, dots = 36, color = C.gold, children }: {
  left: number; size?: number; dots?: number; color?: string; children?: ReactNode;
}) {
  const r = size / 2 - 4;
  const lit = Math.round(Math.max(0, Math.min(1, left)) * dots);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: dots }, (_, i) => {
        const a = (i / dots) * Math.PI * 2 - Math.PI / 2;
        const on = i < lit;
        return (
          <View key={i} style={{
            position: 'absolute', width: on ? 5 : 4, height: on ? 5 : 4, borderRadius: 3,
            left: size / 2 + Math.cos(a) * r - (on ? 2.5 : 2), top: size / 2 + Math.sin(a) * r - (on ? 2.5 : 2),
            backgroundColor: on ? color : 'rgba(255,255,255,0.18)',
          }}
          />
        );
      })}
      {children}
    </View>
  );
}
