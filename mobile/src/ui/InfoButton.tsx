import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { MASCOT } from '../data/cosmeticArt';
import { haptic } from '../notify';
import { C, R } from '../theme';
import { Body, Btn, Display } from './kit';

/** A small round "i" that opens the rules in a sheet, so screens stay one line. */
export function InfoButton({ title, lines, art, inline }: { title: string; lines: string[]; art?: ImageSourcePropType; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => { haptic.tap(); setOpen(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={title} style={[st.i, inline && st.inline]}>
        <Body size={13} bold color={C.goldHi}>i</Body>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.scrim }} onPress={() => setOpen(false)} />
        <View style={st.sheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={art ?? MASCOT.wave} style={{ width: 64, height: 64 }} resizeMode="contain" />
            <Display size={24} style={{ flex: 1 }}>{title}</Display>
          </View>
          <View style={st.rules}>
            {lines.map((l, i) => (
              <View key={l} style={[st.rule, i > 0 && st.ruleSep]}>
                <View style={st.gem} />
                <Body size={14} color="#fff" style={{ flex: 1 }}>{l}</Body>
              </View>
            ))}
          </View>
          <Btn label="GOT IT" tone="gold" size="sm" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  i: { position: 'absolute', right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(247,215,116,0.7)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  inline: { position: 'relative', right: undefined, bottom: undefined },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, padding: 18, paddingBottom: 40, gap: 14, borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderColor: C.rimLo },
  rules: { backgroundColor: C.recess, borderRadius: R.card, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  ruleSep: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  gem: { width: 10, height: 10, borderRadius: 2, transform: [{ rotate: '45deg' }], backgroundColor: C.gold, borderWidth: 1, borderColor: C.rimHi },
});
