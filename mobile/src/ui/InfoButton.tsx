import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../notify';
import { C, R } from '../theme';
import { Body, Btn, Display } from './kit';

/** A small round "i" that opens the rules in a sheet, so screens stay one line. */
export function InfoButton({ title, lines }: { title: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => { haptic.tap(); setOpen(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={title} style={st.i}>
        <Body size={13} bold color={C.goldHi}>i</Body>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.scrim }} onPress={() => setOpen(false)} />
        <View style={st.sheet}>
          <Display size={22}>{title}</Display>
          {lines.map((l) => <Body key={l} size={14} color="#fff">{l}</Body>)}
          <Btn label="GOT IT" tone="gold" size="sm" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  i: { position: 'absolute', right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(247,215,116,0.7)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, padding: 18, paddingBottom: 40, gap: 10, borderTopWidth: 1.5, borderColor: 'rgba(247,215,116,0.5)' },
});
