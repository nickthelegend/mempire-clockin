import { Canvas, useFrame } from '@react-three/fiber/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, AppState, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View,
  type GestureResponderEvent, type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as THREE from 'three';
import {
  SCENE_CAMERA, SCENE_GL, SceneContents, dropDecision, groundHitNdc, isLegalDrop, setViewSeat,
} from '../../../app/src/three/BattleScene';
import { ARCHETYPES } from '../../../app/src/sim/archetypes';
import { FP, fp } from '../../../app/src/sim/fixed';
import { HAND_SIZE } from '../../../app/src/sim/types';
import { CARD_ART } from '../data/art';
import { finishMatch } from '../game/actions';
import { haptic } from '../notify';
import { useUi } from '../state/ui';
import { C, F } from '../theme';
import {
  forfeit, playCard, setPaused, startNativeArena, teardown, toMatchCard, useNativeMatch,
} from './match';

/**
 * The 3D battle, fully native: the web game's own scene (app/src/three) in a
 * @react-three/fiber/native Canvas on expo-gl, the same deterministic sim and
 * bot pilot, and a native HUD — hand, elixir, timer, crowns — with
 * drag-to-deploy driven by PanResponder and a ground-plane raycast through the
 * scene camera. No WebView.
 */

/** Frames per second over a rolling second, logged and shown small in the HUD. */
let lastFps = 0;
function FpsProbe() {
  const acc = useRef({ frames: 0, t: 0, logged: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.t += dt;
    if (a.t >= 1) {
      lastFps = Math.round(a.frames / a.t);
      a.frames = 0; a.t = 0;
      a.logged += 1;
      if (a.logged % 5 === 0) console.log(`[arena] fps ${lastFps}`); // eslint-disable-line no-console
    }
  });
  return null;
}

/** Releases the GPU textures and geometry this scene allocated when the match ends. */
function DisposeOnUnmount() {
  const scene = useRef<THREE.Scene | null>(null);
  useFrame(({ scene: s }) => { scene.current = s; });
  useEffect(() => () => {
    scene.current?.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
  }, []);
  return null;
}

const fmtClock = (ticks: number) => {
  const s = Math.max(0, Math.ceil(ticks / 20));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Drag { handIndex: number; deckIndex: number; x: number; y: number }

function Hud({ onQuit }: { onQuit: () => void }) {
  const insets = useSafeAreaInsets();
  useNativeMatch((s) => s.version); // re-render at the sim's 20 Hz
  const sim = useNativeMatch((s) => s.sim);
  const crowns = useNativeMatch((s) => s.crowns);
  const rival = useUi((s) => s.battle?.rival ?? '');
  if (!sim) return null;
  const f = sim.format;
  const overtime = sim.phase === 'overtime' || sim.tick >= f.regulationTicks;
  const left = overtime ? f.regulationTicks + f.overtimeTicks - sim.tick : f.regulationTicks - sim.tick;
  const double = sim.tick >= f.doubleElixirAt;
  return (
    <View pointerEvents="box-none" style={[st.top, { paddingTop: insets.top + 4 }]}>
      <Pressable onPress={onQuit} style={st.quit} accessibilityLabel="Leave battle" hitSlop={10}>
        <Text style={st.quitX}>✕</Text>
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Text style={[st.clock, overtime && { color: C.red }]}>{fmtClock(left)}</Text>
        <Text style={st.sub}>{overtime ? 'OVERTIME' : double ? '2× ELIXIR' : `vs ${rival}`}</Text>
      </View>
      <View style={st.crowns}>
        <Text style={[st.crown, { color: C.teal }]}>{crowns[0]}</Text>
        <Text style={st.crownVs}>CROWNS</Text>
        <Text style={[st.crown, { color: C.red }]}>{crowns[1]}</Text>
      </View>
    </View>
  );
}

export function NativeArena() {
  const match = useUi((s) => s.battle);
  const closeBattle = useUi((s) => s.closeBattle);
  const insets = useSafeAreaInsets();
  const view = useRef<View>(null);
  const frame = useRef({ x: 0, y: 0, w: 1, h: 1 });
  const [marker, setMarker] = useState<{ x: number; z: number; legal: boolean } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [paused, setPausedUi] = useState(false);
  const [ended, setEnded] = useState(false);
  useNativeMatch((s) => s.version);
  const sim = useNativeMatch((s) => s.sim);
  const playerDeck = useNativeMatch((s) => s.playerDeck);
  const towerFell = useNativeMatch((s) => s.towerFell);
  const deployed = useNativeMatch((s) => s.deployed);
  const shake = useRef(new Animated.Value(0)).current;

  // Start the match when the arena opens; tear it down when it closes.
  useEffect(() => {
    if (!match) return undefined;
    setEnded(false);
    setViewSeat(0);
    startNativeArena({
      player: match.player.map(toMatchCard),
      bot: match.bot.map(toMatchCard),
      tier: match.tier,
      rush: match.rush,
      onEnd: (r) => {
        setEnded(true);
        if (r.won) haptic.success(); else haptic.warn();
        // A beat on the arena for the last tower to fall, then the native result.
        setTimeout(() => {
          closeBattle();
          void finishMatch(match, { won: r.won, draw: r.draw, crowns: r.crowns });
          teardown();
        }, 1600);
      },
    });
    return () => teardown();
  }, [match, closeBattle]);

  // A crown is the biggest moment in a match: feel it.
  useEffect(() => {
    if (!towerFell) return;
    haptic.heavy();
    shake.setValue(1);
    Animated.timing(shake, { toValue: 0, duration: 380, useNativeDriver: true }).start();
  }, [towerFell, shake]);
  useEffect(() => { if (deployed) haptic.light(); }, [deployed]);

  // Leaving the app pauses the match rather than letting the bot win it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && useNativeMatch.getState().sim && !useNativeMatch.getState().result) {
        setPaused(true); setPausedUi(true);
      }
    });
    return () => sub.remove();
  }, []);

  const quit = useCallback(() => {
    if (ended) return;
    setPaused(true); setPausedUi(true);
    Alert.alert('Leave the battle?', 'It counts as a loss. Nothing is staked.', [
      { text: 'Keep fighting', style: 'cancel', onPress: () => { setPaused(false); setPausedUi(false); } },
      { text: 'Leave', style: 'destructive', onPress: () => { setPaused(false); setPausedUi(false); forfeit(); } },
    ]);
  }, [ended]);

  const onLayout = useCallback((_e: LayoutChangeEvent) => {
    view.current?.measureInWindow((x, y, w, h) => { frame.current = { x, y, w, h }; });
  }, []);

  /** Screen point → world point on the ground, through the live scene camera. */
  const hitAt = useCallback((pageX: number, pageY: number) => {
    const f = frame.current;
    const ndcX = ((pageX - f.x) / f.w) * 2 - 1;
    const ndcY = -(((pageY - f.y) / f.h) * 2 - 1);
    const hit = groundHitNdc(ndcX, ndcY);
    return hit ? { ...hit, legal: isLegalDrop(hit.x, hit.z) } : null;
  }, []);

  const me = sim?.players[0];
  const elixir = me ? me.elixirFP / FP : 0;
  const hand = me ? me.cycle.slice(0, HAND_SIZE) : [];
  const next = me ? me.cycle[HAND_SIZE] : undefined;
  const costOf = (deckIndex: number) => ARCHETYPES[playerDeck[deckIndex]?.archetype as keyof typeof ARCHETYPES]?.elixir ?? 99;

  const deploy = useCallback((deckIndex: number, pageX: number, pageY: number) => {
    const hit = hitAt(pageX, pageY);
    const at = hit ? dropDecision(hit.x, hit.z) : null;
    if (!at) { haptic.warn(); return false; }
    const s = useNativeMatch.getState().sim;
    const cost = ARCHETYPES[useNativeMatch.getState().playerDeck[deckIndex].archetype as keyof typeof ARCHETYPES].elixir;
    if (!s || s.players[0].elixirFP < cost * FP) { haptic.warn(); return false; }
    if (playCard(deckIndex, fp(at.x), fp(at.z))) { haptic.light(); return true; }
    return false;
  }, [hitAt]);

  // One responder per hand slot, rebuilt when the hand rotates.
  const responders = useMemo(() => hand.map((deckIndex, handIndex) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e: GestureResponderEvent) => {
      haptic.tap();
      setDrag({ handIndex, deckIndex, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    },
    onPanResponderMove: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      setDrag({ handIndex, deckIndex, x: pageX, y: pageY });
      setMarker(pageY < frame.current.y + frame.current.h ? hitAt(pageX, pageY) : null);
    },
    onPanResponderRelease: (e, g) => {
      setDrag(null);
      setMarker(null);
      if (Math.hypot(g.dx, g.dy) < 10) {
        // A tap arms the card; the next tap on the arena deploys it.
        setSelected((s) => (s === handIndex ? null : handIndex));
        return;
      }
      deploy(deckIndex, e.nativeEvent.pageX, e.nativeEvent.pageY);
      setSelected(null);
    },
    onPanResponderTerminate: () => { setDrag(null); setMarker(null); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [hand.join(','), deploy, hitAt]);

  if (!match) return null;
  const shakeX = shake.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -6, 5, -3, 0] });

  return (
    <Modal visible animationType="fade" onRequestClose={quit} statusBarTranslucent navigationBarTranslucent>
      <View style={st.fill}>
        <Animated.View
          ref={view}
          onLayout={onLayout}
          style={[st.scene, { transform: [{ translateX: shakeX }] }]}
          onStartShouldSetResponderCapture={() => selected !== null}
          onResponderRelease={(e) => {
            if (selected === null) return;
            const deckIndex = hand[selected];
            if (deckIndex !== undefined && deploy(deckIndex, e.nativeEvent.pageX, e.nativeEvent.pageY)) setSelected(null);
          }}
        >
          <Canvas
            camera={SCENE_CAMERA}
            gl={SCENE_GL}
            shadows={{ type: THREE.PCFShadowMap }}
            style={{ flex: 1 }}
          >
            <SceneContents perspective={0} placing={drag !== null || selected !== null} marker={marker} />
            <FpsProbe />
            <DisposeOnUnmount />
          </Canvas>
        </Animated.View>

        <Hud onQuit={quit} />

        <LinearGradient colors={['#8a5a2b', C.wood, C.woodDark]} style={[st.tray, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={st.elixirRow}>
            <View style={st.elixirBar}>
              {Array.from({ length: 10 }, (_, i) => (
                <View key={i} style={st.elixirCell}>
                  <View style={[st.elixirFill, { width: `${Math.max(0, Math.min(1, elixir - i)) * 100}%` }]} />
                </View>
              ))}
            </View>
            <Text style={st.elixirNum}>{Math.floor(elixir)}</Text>
          </View>
          <View style={st.hand}>
            {hand.map((deckIndex, i) => {
              const card = playerDeck[deckIndex];
              const cost = costOf(deckIndex);
              const ok = elixir >= cost;
              const lifted = drag?.handIndex === i;
              return (
                <View
                  key={`${deckIndex}-${i}`}
                  {...responders[i]?.panHandlers}
                  style={[st.card, !ok && { opacity: 0.5 }, selected === i && st.cardSel, lifted && { opacity: 0.35 }]}
                  accessibilityLabel={`${card?.name} costs ${cost}`}
                >
                  <Image source={CARD_ART[card?.name ?? '']} style={st.cardArt} resizeMode="contain" />
                  <View style={st.cost}><Text style={st.costText}>{cost}</Text></View>
                  <Text style={st.cardName} numberOfLines={1}>${card?.name}</Text>
                </View>
              );
            })}
            <View style={st.next}>
              <Text style={st.nextLabel}>NEXT</Text>
              {next !== undefined && playerDeck[next]
                ? <Image source={CARD_ART[playerDeck[next].name]} style={st.nextArt} resizeMode="contain" />
                : null}
            </View>
          </View>
          <Text style={st.help}>
            {selected !== null ? 'tap the arena to deploy' : drag ? (marker?.legal ? 'release to deploy' : 'drop on your half') : 'drag a card onto your half of the arena'}
          </Text>
        </LinearGradient>

        {drag ? (
          <View pointerEvents="none" style={[st.ghost, { left: drag.x - 34, top: drag.y - 46 }]}>
            <Image source={CARD_ART[playerDeck[drag.deckIndex]?.name ?? '']} style={{ width: 68, height: 90 }} resizeMode="contain" />
          </View>
        ) : null}

        {paused && !ended ? <View pointerEvents="none" style={st.pausedVeil} /> : null}
        {lastFps ? <Text pointerEvents="none" style={[st.fps, { top: insets.top + 54 }]}>{lastFps} fps</Text> : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#cfe9ff' },
  scene: { flex: 1 },
  top: {
    position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 6, backgroundColor: 'rgba(9,22,48,0.35)',
  },
  quit: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  quitX: { color: '#fff', fontSize: 18, fontFamily: F.uiBold },
  clock: { color: '#fff', fontFamily: F.display, fontSize: 30, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  sub: { color: C.dim, fontFamily: F.uiBold, fontSize: 11, letterSpacing: 1 },
  crowns: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  crown: { fontFamily: F.display, fontSize: 22 },
  crownVs: { color: C.goldHi, fontFamily: F.uiBold, fontSize: 9, letterSpacing: 1 },
  tray: { paddingTop: 8, paddingHorizontal: 10, borderTopWidth: 3, borderTopColor: C.woodEdge },
  elixirRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  elixirBar: { flex: 1, height: 18, flexDirection: 'row', gap: 2, backgroundColor: C.ink, borderRadius: 9, padding: 2, borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' },
  elixirCell: { flex: 1, backgroundColor: 'rgba(216,56,216,0.18)', borderRadius: 4, overflow: 'hidden' },
  elixirFill: { height: '100%', backgroundColor: '#d838d8' },
  elixirNum: { color: '#ff9cff', fontFamily: F.display, fontSize: 24, width: 30, textAlign: 'center' },
  hand: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  card: {
    flex: 1, aspectRatio: 0.78, borderRadius: 10, backgroundColor: '#3a2a6e', borderWidth: 2.5, borderColor: '#1b2c55',
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible',
  },
  cardSel: { borderColor: C.gold, transform: [{ translateY: -8 }] },
  cardArt: { position: 'absolute', top: 4, left: 2, right: 2, bottom: 18, width: undefined, height: undefined },
  cost: { position: 'absolute', top: -8, left: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#d838d8', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  costText: { color: '#fff', fontFamily: F.display, fontSize: 13 },
  cardName: { color: '#fff', fontFamily: F.display, fontSize: 11, marginBottom: 3 },
  next: { width: 42, alignItems: 'center', paddingBottom: 8 },
  nextLabel: { color: C.dimOnWood, fontFamily: F.uiBold, fontSize: 10 },
  nextArt: { width: 38, height: 50, opacity: 0.8 },
  help: { color: C.dimOnWood, fontFamily: F.ui, fontSize: 12, textAlign: 'center', marginTop: 6 },
  ghost: { position: 'absolute', opacity: 0.9 },
  pausedVeil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,16,38,0.45)' },
  fps: { position: 'absolute', right: 12, color: 'rgba(255,255,255,0.7)', fontFamily: F.uiBold, fontSize: 10 },
});
