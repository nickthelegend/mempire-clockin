import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Image, Platform, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { CARD_ART, UI_ART } from '../data/art';
import { challengeMessage } from '../game/actions';
import { useFrameColors } from '../game/cosmetics';
import { EMOTES } from '../game/season';
import { useGame } from '../state/game';
import { useUi, type MatchResult } from '../state/ui';
import { C, R } from '../theme';
import { Body, Btn, Display } from '../ui/kit';

/**
 * The result as a picture: outcome, crowns, three of your fighters, your
 * emote and frame, and the challenge deep link. Captured with view-shot and
 * handed to the share sheet (image + link on iOS; on Android the image goes
 * through the share sheet and the link is copied for the caption).
 */
export function ShareCardButton({ r }: { r: MatchResult }) {
  const ref = useRef<View>(null);
  const deck = useGame((s) => s.deck);
  const emote = useGame((s) => EMOTES[s.equipped.emote] ?? EMOTES.gg);
  const side = useGame((s) => s.warSide);
  const frame = useFrameColors();
  const say = useUi((s) => s.say);
  const [busy, setBusy] = useState(false);
  const title = r.draw ? 'DRAW' : r.won ? 'VICTORY' : 'DEFEAT';
  const message = challengeMessage(r.rivalIndex, r.rush, { won: r.won, crowns: r.crowns });

  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
      if (Platform.OS === 'ios') {
        await Share.share({ url: uri, message });
      } else if (await Sharing.isAvailableAsync()) {
        await Clipboard.setStringAsync(message);
        say('Challenge link copied: paste it as the caption', 'info');
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Mempire result' });
      } else {
        await Share.share({ message });
      }
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ width: '88%', marginTop: 12, gap: 8 }}>
      <View ref={ref} collapsable={false}>
        <LinearGradient colors={frame ?? ['#ffc422', '#7a4a22']} style={st.edge}>
          <LinearGradient colors={['#14418f', '#0d2a5c']} style={st.card}>
            <View style={st.top}>
              <Image source={UI_ART.logo} style={{ width: 96, height: 30 }} resizeMode="contain" />
              <Body size={11} color={C.dim} bold>{r.rush ? 'RUSH' : 'STANDARD'}</Body>
            </View>
            <View style={st.mid}>
              <View>
                <Display size={30} color={r.won ? C.gold : r.draw ? '#fff' : C.red}>{title}</Display>
                <Body size={12} color="#fff">vs {r.rival.replace(' (AI)', '')} · {r.crowns[0]}–{r.crowns[1]} crowns</Body>
              </View>
              <Display size={36}>{emote.glyph}</Display>
            </View>
            <View style={st.fighters}>
              {deck.slice(0, 4).map((t) => (
                <View key={t} style={st.fighter}>
                  <Image source={CARD_ART[t]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </View>
              ))}
            </View>
            <Body size={10} color={C.dim}>
              {side ? `Fighting for $${side} in the Season War · ` : ''}mempire://battle?rival={r.rivalIndex}{r.rush ? '&rush=1' : ''}
            </Body>
          </LinearGradient>
        </LinearGradient>
      </View>
      <Btn label="SHARE CARD" sub="image + challenge link" tone="gold" size="sm" busy={busy} onPress={() => void share()} />
    </View>
  );
}

const st = StyleSheet.create({
  edge: { borderRadius: R.panel, padding: 3 },
  card: { borderRadius: R.panel - 3, padding: 12, gap: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fighters: { flexDirection: 'row', gap: 6 },
  fighter: { flex: 1, aspectRatio: 0.75, borderRadius: 8, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.5)' },
});
