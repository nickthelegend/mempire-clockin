import { Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Modal, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { finishMatch } from '../game/actions';
import { useUi } from '../state/ui';
import { injectedBridge } from '../injected';
import { C } from '../theme';
import { Body, Display } from '../ui/kit';

/**
 * The 3D arena, and nothing else, in a WebView.
 *
 * The battle is React Three Fiber over the deterministic fixed-point sim — the
 * same code the web game and the on-chain match log use, which is why it is
 * not rewritten natively: a second implementation would desync. It ships in
 * the binary (mobile/web/www, file://), so it works offline and needs no
 * hosted site. Everything around the battle is native.
 */
function bundledGameUrl(): string {
  if (Platform.OS === 'android') return 'file:///android_asset/www/index.html';
  const root = Paths.bundle.uri.endsWith('/') ? Paths.bundle.uri : `${Paths.bundle.uri}/`;
  return `${root}www/index.html`;
}
export const GAME_URL = process.env.EXPO_PUBLIC_GAME_URL || bundledGameUrl();
const GAME_ROOT = GAME_URL.replace(/[^/]*$/, '');
const BRIDGE = injectedBridge(Platform.OS === 'android' ? 'android' : 'ios');

export function ArenaHost() {
  const match = useUi((s) => s.battle);
  const closeBattle = useUi((s) => s.closeBattle);
  const say = useUi((s) => s.say);
  const [ready, setReady] = useState(false);
  const done = useRef(false);

  useEffect(() => { done.current = false; setReady(false); }, [match]);

  const leave = useCallback(() => {
    Alert.alert('Leave the battle?', 'The match counts as a loss.', [
      { text: 'Keep fighting', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          if (match && !done.current) {
            done.current = true;
            void finishMatch(match, { won: false, draw: false, crowns: [0, 0] });
          }
          closeBattle();
        },
      },
    ]);
  }, [match, closeBattle]);

  useEffect(() => {
    if (!match) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true; });
    return () => sub.remove();
  }, [match, leave]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.channel === 'ready') setReady(true);
    if (msg.channel === 'result' && match && !done.current) {
      done.current = true;
      const crowns = (Array.isArray(msg.crowns) ? msg.crowns : [0, 0]) as [number, number];
      // A beat on the arena's own victory moment, then the native result.
      setTimeout(() => {
        closeBattle();
        void finishMatch(match, { won: !!msg.won, draw: !!msg.draw, crowns });
      }, 1800);
    }
    if (msg.channel === 'exit') {
      if (match && !done.current) {
        done.current = true;
        void finishMatch(match, { won: false, draw: false, crowns: [0, 0] });
      }
      if (typeof msg.reason === 'string' && msg.reason !== 'left') say(`Arena: ${msg.reason}`, 'err');
      closeBattle();
    }
  }, [match, closeBattle, say]);

  if (!match) return null;
  // The match spec is planted before any page script runs.
  const inject = `window.__MEMPIRE_MATCH__ = ${JSON.stringify({
    player: match.player, bot: match.bot, tier: match.tier, opponent: match.rival, rush: match.rush,
  })};\n${BRIDGE}`;

  return (
    <Modal visible animationType="fade" onRequestClose={leave} statusBarTranslucent>
      <View style={st.fill}>
        <WebView
          source={{ uri: GAME_URL }}
          injectedJavaScriptBeforeContentLoaded={inject}
          onMessage={onMessage}
          originWhitelist={['*']}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          allowingReadAccessToURL={GAME_ROOT}
          javaScriptEnabled
          domStorageEnabled
          androidLayerType="hardware"
          bounces={false}
          overScrollMode="never"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(r) => r.url.startsWith(GAME_ROOT) || r.url.startsWith('about:') || r.url.startsWith('data:') || r.url.startsWith('blob:')}
          onError={(e) => { say(`Arena failed to load: ${e.nativeEvent.description}`, 'err'); closeBattle(); }}
          style={st.fill}
        />
        {!ready ? (
          <View style={st.loading} pointerEvents="none">
            <Display size={26} color={C.gold}>vs {match.rival}</Display>
            <ActivityIndicator size="large" color={C.gold} style={{ marginVertical: 14 }} />
            <Body>Entering the arena…</Body>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.blueDeep },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blueDeep },
});
