import { useState, type ReactNode } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CLUSTER_LABEL } from '../chain/solana';
import { FEATURE_ART } from '../data/cosmeticArt';
import { haptic } from '../notify';
import { C, R } from '../theme';
import { Body, Btn, Display, PressScale } from './kit';

/**
 * The one place hashes, addresses and the cluster name are shown. Game
 * screens show an "ON CHAIN" seal; tapping it opens this sheet: the art, two
 * plain sentences, short proof chips and an Explorer button. It is its own
 * Modal, so it works from inside other sheets (a child Modal presents over
 * its parent on iOS).
 */
export interface ProofLink { label: string; url: string }
export interface ProofInfo {
  title: string;
  about: string;
  proofs: ProofLink[];
  art?: ImageSourcePropType;
  /** Glow colour behind the art. */
  glow?: string;
}

export function ProofSheet({ info, onClose }: { info: ProofInfo | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const primary = info?.proofs[0];
  return (
    <Modal visible={!!info} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: C.scrim }]} onPress={onClose} accessibilityLabel="Close" />
      {info ? (
        <View style={st.sheet}>
          <LinearGradient colors={['#1E2A5E', C.bg]} style={[st.inner, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={st.grab} />
            <View style={[st.glow, { backgroundColor: C.panelRaised, borderWidth: 2.5, borderColor: info.glow ?? C.teal, shadowColor: info.glow ?? C.teal, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } }]}>
              <Image source={info.art ?? FEATURE_ART.commit} style={{ width: 96, height: 96 }} resizeMode="contain" />
            </View>
            <Display size={24} style={{ textAlign: 'center' }}>{info.title}</Display>
            <Body size={14} color="#fff" style={{ textAlign: 'center', lineHeight: 20 }}>{info.about}</Body>
            {info.proofs.length ? (
              <View style={st.proof}>
                <Body size={11} bold color={C.goldHi}>PROOF ON SOLANA {CLUSTER_LABEL.toUpperCase()}</Body>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {info.proofs.map((x) => (
                    <Pressable key={x.url} onPress={() => void Linking.openURL(x.url)} accessibilityRole="link" accessibilityLabel={x.label} style={st.chip} hitSlop={6}>
                      <Body size={12} bold color={C.teal}>{x.label}</Body>
                    </Pressable>
                  ))}
                </View>
                {primary ? (
                  <Btn label={primary.url.includes('explorer.solana.com') ? 'VIEW ON EXPLORER' : 'OPEN'} tone="blue" size="sm" onPress={() => void Linking.openURL(primary.url)} />
                ) : null}
              </View>
            ) : null}
            <Btn label="CLOSE" tone="ghost" size="sm" onPress={onClose} />
          </LinearGradient>
        </View>
      ) : null}
    </Modal>
  );
}

/** A chunky "ON CHAIN ✓" seal that opens the proof sheet. */
export function ProofSeal({ info, label = 'ON CHAIN', tone = 'teal', children, compact }: {
  info: ProofInfo; label?: string; tone?: 'teal' | 'gold'; children?: ReactNode;
  /** A round medallion (art + check badge) instead of the labelled pill. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const col = tone === 'gold' ? C.gold : C.teal;
  return (
    <>
      <PressScale onPress={() => { haptic.tap(); setOpen(true); }} accessibilityLabel={`${label}. Show the proof`} hitSlop={8}>
        {children ?? (compact ? (
          <View style={st.medal}>
            <LinearGradient colors={tone === 'gold' ? ['#ffe38a', '#c8890b'] : ['#3dffb4', '#0c9e63']} style={st.medalRing}>
              <View style={st.medalCore}><Image source={info.art ?? FEATURE_ART.commit} style={{ width: 28, height: 28 }} resizeMode="contain" /></View>
            </LinearGradient>
            <View style={[st.medalCheck, { backgroundColor: col }]}><Body size={10} bold color={C.ink}>✓</Body></View>
          </View>
        ) : (
          <LinearGradient colors={tone === 'gold' ? ['#ffe38a', '#c8890b'] : ['#3dffb4', '#0c9e63']} style={st.seal}>
            <View style={[st.check, { borderColor: col }]}><Body size={11} bold color={col}>✓</Body></View>
            <Body size={12} bold color={C.ink}>{label}</Body>
          </LinearGradient>
        ))}
      </PressScale>
      <ProofSheet info={open ? info : null} onClose={() => setOpen(false)} />
    </>
  );
}

const st = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  inner: { borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, padding: 18, paddingTop: 10, gap: 12, borderTopWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  glow: { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  proof: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: R.card, padding: 12, gap: 10 },
  chip: { borderRadius: 10, borderWidth: 1.5, borderColor: C.teal, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(20,241,149,0.08)' },
  seal: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingLeft: 4, paddingRight: 10, height: 28, borderWidth: 2, borderColor: 'rgba(0,0,0,0.35)' },
  medal: { width: 44, height: 44 },
  medalRing: { width: 44, height: 44, borderRadius: 22, padding: 3, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.4)' },
  medalCore: { flex: 1, borderRadius: 19, backgroundColor: '#0d2350', alignItems: 'center', justifyContent: 'center' },
  medalCheck: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
