import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert, Animated, AppState, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View,
  type GestureResponderEvent, type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Device from 'expo-device';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as THREE from 'three';
import {
  SCENE_CAMERA, SCENE_GL, SceneContents, dropDecision, groundHitNdc, isLegalDrop, setViewSeat,
} from '../../../app/src/three/BattleScene';
import { ARCHETYPES } from '../../../app/src/sim/archetypes';
import { FP, fp } from '../../../app/src/sim/fixed';
import { HAND_SIZE } from '../../../app/src/sim/types';
import { CARD_ART } from '../data/art';
import { pageToNdc } from './screen';
import { onTextureError } from '../../../app/src/three/canvasTex.native';
import { finishMatch } from '../game/actions';
import { haptic } from '../notify';
import { useUi } from '../state/ui';
import { sfx, startMusic, stopMusic, useSound } from '../sound';
import { CoachMarks } from '../screens/CoachMarks';
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

/** Frames per second over each second; shown small in the HUD and fed to the watchdog. */
let lastFps = 0;
function FpsProbe({ onSecond }: { onSecond: (fps: number) => void }) {
  const acc = useRef({ frames: 0, t: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.t += dt;
    if (a.t >= 1) {
      lastFps = Math.round(a.frames / a.t);
      a.frames = 0; a.t = 0;
      onSecond(lastFps);
    }
  });
  return null;
}

/** Any throw inside the GL scene (context, shader, texture) lands here. */
class SceneBoundary extends Component<{ onFail: (why: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { this.props.onFail(e instanceof Error ? e.message : String(e)); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * The watchdog's rules. Only in Auto mode — choosing Native in settings means
 * "show me native even if it is slow" (that is how the simulator captures run).
 */
const WATCH_WINDOW_S = 15;
const MIN_FPS = 20;
const SLOW_STREAK_S = 5;
const CONTEXT_TIMEOUT_MS = 25_000;

function toLambert(m: THREE.Material): THREE.Material {
  const sm = m as THREE.MeshStandardMaterial;
  if (!sm.isMeshStandardMaterial) return m;
  const l = new THREE.MeshLambertMaterial({
    color: sm.color, map: sm.map, alphaMap: sm.alphaMap, transparent: sm.transparent, opacity: sm.opacity,
    side: sm.side, vertexColors: sm.vertexColors, alphaTest: sm.alphaTest, depthWrite: sm.depthWrite,
    emissive: sm.emissive, emissiveIntensity: sm.emissiveIntensity, emissiveMap: sm.emissiveMap,
  });
  sm.dispose();
  return l;
}

/**
 * Takes over rendering (priority 1) so each frame waits for the GL thread to
 * finish the previous one: expo-gl queues GL calls for its own thread, and on
 * slow GL an unthrottled loop queues frames faster than they draw (memory
 * climbs, input lags seconds behind). `getError()` is a synchronous call, so
 * it is the backpressure. On a phone's GPU it costs well under a millisecond.
 * Also applies simulator-lite, and reports when the first frame — with every
 * shader compiled — is on screen, so the match clock starts only then.
 */
function RenderControl({ onReady }: { onReady: () => void }) {
  const { gl } = useThree();
  const state = useRef({ lite: false, ready: false });
  useEffect(() => {
    if (!LITE) return;
    gl.toneMapping = THREE.NoToneMapping;
    gl.shadowMap.enabled = false;
  }, [gl]);
  useFrame(({ gl: renderer, scene, camera }) => {
    if (LITE && !state.current.lite) {
      state.current.lite = true;
      scene.fog = null;
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.material) return;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toLambert) : toLambert(mesh.material);
      });
    }
    renderer.render(scene, camera);
    (renderer.getContext() as WebGL2RenderingContext).getError();
    if (!state.current.ready) { state.current.ready = true; onReady(); }
  }, 1);
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

/**
 * Render budget.
 *
 * expo-gl draws at the screen's full native resolution (3x on an iPhone, ~2.6x
 * on a Seeker). The arena renders at half that and is scaled up by the
 * compositor — still above 1x on any phone, and a quarter of the fragments.
 * On a simulator (software GL) shadows and MSAA are dropped as well; real
 * devices keep the sun's shadow map, which is the scene's main depth cue.
 */
const RENDER_SCALE = 0.5;
const ON_DEVICE = Device.isDevice;
/**
 * Simulator-lite. The iOS Simulator implements OpenGL ES in software (Apple's
 * LLVM pipeline, one CPU core), so the full-quality scene compiles for tens of
 * seconds and then draws at ~1 fps there. On a simulator the arena swaps the
 * physically-based materials for Lambert, drops fog and tone mapping, and
 * keeps everything else — same geometry, same textures, same match.
 */
const LITE = !ON_DEVICE;
const GL = { ...SCENE_GL, antialias: ON_DEVICE && SCENE_GL.antialias };

const fmtClock = (ticks: number) => {
  const s = Math.max(0, Math.ceil(ticks / 20));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Drag { handIndex: number; deckIndex: number; x: number; y: number }

function MuteButton() {
  const muted = useSound((s) => s.muted);
  const setMuted = useSound((s) => s.setMuted);
  return (
    <Pressable
      onPress={() => { haptic.tap(); setMuted(!muted); if (muted) startMusic(); }}
      style={st.mute}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: !muted }}
      accessibilityLabel="Sound"
    >
      <Text style={st.muteText} maxFontSizeMultiplier={1.2}>{muted ? 'SOUND OFF' : 'SOUND ON'}</Text>
    </Pressable>
  );
}

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
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
      <View style={st.crowns}>
        <Text style={[st.crown, { color: C.teal }]}>{crowns[0]}</Text>
        <Text style={st.crownVs}>CROWNS</Text>
        <Text style={[st.crown, { color: C.red }]}>{crowns[1]}</Text>
      </View>
      <MuteButton />
      </View>
    </View>
  );
}

export function NativeArena() {
  const battle = useUi((s) => s.battle);
  const match = battle?.renderer === 'native' ? battle : null;
  const autoMode = useUi((s) => s.rendererPref === 'auto');
  const closeBattle = useUi((s) => s.closeBattle);
  const insets = useSafeAreaInsets();
  const view = useRef<View>(null);
  const frame = useRef({ x: 0, y: 0, w: 1, h: 1 });
  const [marker, setMarker] = useState<{ x: number; z: number; legal: boolean } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [paused, setPausedUi] = useState(false);
  const [ended, setEnded] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  useNativeMatch((s) => s.version);
  const sim = useNativeMatch((s) => s.sim);
  const playerDeck = useNativeMatch((s) => s.playerDeck);
  const towerFell = useNativeMatch((s) => s.towerFell);
  const deployed = useNativeMatch((s) => s.deployed);
  const plays = useNativeMatch((s) => s.plays);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (!match) setSceneReady(false); }, [match]);

  /**
   * Fall back: abandon the native scene and replay the SAME match (same seed,
   * decks, rival) in the web arena. Nothing has been recorded yet, so the
   * player loses nothing but a few seconds.
   */
  const fellBack = useRef(false);
  const fallBack = useCallback((why: string) => {
    if (!match || fellBack.current || useNativeMatch.getState().result) return;
    fellBack.current = true;
    teardown();
    useUi.getState().say('Switched to the compatibility arena', 'info');
    console.warn(`[arena] native renderer fell back: ${why}`); // eslint-disable-line no-console
    useUi.getState().openBattle({ ...match, renderer: 'web', fellBack: true });
  }, [match]);
  useEffect(() => { fellBack.current = false; }, [match]);

  // Watchdog 0: a texture failed to load (renders blank, not slow).
  useEffect(() => {
    if (!match || !autoMode) return undefined;
    return onTextureError((why) => fallBack(why));
  }, [match, autoMode, fallBack]);

  // Watchdog 1: the GL context never produced a frame.
  useEffect(() => {
    if (!match || sceneReady || !autoMode) return undefined;
    const t = setTimeout(() => fallBack('no frame within 25 s'), CONTEXT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [match, sceneReady, autoMode, fallBack]);

  // Watchdog 2: under 20 fps for 5 straight seconds inside the first 15.
  const watch = useRef({ seconds: 0, slow: 0 });
  useEffect(() => { watch.current = { seconds: 0, slow: 0 }; }, [match, sceneReady]);
  const onSecond = useCallback((fps: number) => {
    if (!sceneReady || !autoMode) return;
    const w = watch.current;
    w.seconds += 1;
    if (w.seconds > WATCH_WINDOW_S) return;
    w.slow = fps < MIN_FPS ? w.slow + 1 : 0;
    if (w.slow >= SLOW_STREAK_S) fallBack(`${fps} fps for ${SLOW_STREAK_S}s`);
  }, [sceneReady, autoMode, fallBack]);

  // Start the match once the arena's first frame is on screen (shaders
  // compiled); tear it down when it closes.
  useEffect(() => {
    if (!match || !sceneReady) return undefined;
    setEnded(false);
    setViewSeat(0);
    startNativeArena({
      player: match.player.map(toMatchCard),
      bot: match.bot.map(toMatchCard),
      tier: match.tier,
      rush: match.rush,
      seed: match.seed,
      onEnd: (r) => {
        setEnded(true);
        stopMusic();
        if (r.won) haptic.success(); else haptic.warn();
        // A beat on the arena for the last tower to fall, then the native result.
        setTimeout(() => {
          closeBattle();
          void finishMatch(match, { won: r.won, draw: r.draw, crowns: r.crowns, plays: r.plays });
          teardown();
        }, 1600);
      },
    });
    startMusic();
    return () => { stopMusic(); teardown(); };
  }, [match, sceneReady, closeBattle]);

  // A crown is the biggest moment in a match: feel it.
  useEffect(() => {
    if (!towerFell) return;
    haptic.heavy();
    sfx('tower');
    shake.setValue(1);
    Animated.timing(shake, { toValue: 0, duration: 380, useNativeDriver: true }).start();
  }, [towerFell, shake]);
  useEffect(() => { if (deployed) { haptic.light(); sfx('deploy'); } }, [deployed]);

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
    const ndc = pageToNdc(pageX, pageY, frame.current);
    const hit = groundHitNdc(ndc.x, ndc.y);
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

  /*
   * One responder per hand SLOT, created once. They read the live hand through
   * a ref and remember the card picked up at grant time. Keying responders (or
   * the slot views) by card instead meant a hand rotation mid-drag — your
   * previous play landing — unmounted the view under the finger, the release
   * never arrived, and the hand stayed stuck in "dragging" for the rest of the
   * match (caught in the simulator recording).
   */
  const handRef = useRef(hand);
  handRef.current = hand;
  const responders = useMemo(() => [0, 1, 2, 3].map((handIndex) => {
    let picked = -1;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        picked = handRef.current[handIndex] ?? -1;
        if (picked < 0) return;
        haptic.tap();
        setDrag({ handIndex, deckIndex: picked, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
      },
      onPanResponderMove: (e) => {
        if (picked < 0) return;
        const { pageX, pageY } = e.nativeEvent;
        setDrag({ handIndex, deckIndex: picked, x: pageX, y: pageY });
        setMarker(pageY < frame.current.y + frame.current.h ? hitAt(pageX, pageY) : null);
      },
      onPanResponderRelease: (e, g) => {
        setDrag(null);
        setMarker(null);
        const deckIndex = picked;
        picked = -1;
        if (deckIndex < 0) return;
        if (Math.hypot(g.dx, g.dy) < 10) {
          // A tap arms the card; the next tap on the arena deploys it.
          setSelected((cur) => (cur === handIndex ? null : handIndex));
          return;
        }
        deploy(deckIndex, e.nativeEvent.pageX, e.nativeEvent.pageY);
        setSelected(null);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => { picked = -1; setDrag(null); setMarker(null); },
    });
  }), [deploy, hitAt]);

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
          <View style={st.lowres}>
          <SceneBoundary onFail={(why) => (autoMode ? fallBack(why) : useUi.getState().say(`Arena error: ${why}`, 'err'))}>
          <Canvas
            camera={SCENE_CAMERA}
            gl={GL}
            shadows={ON_DEVICE ? { type: THREE.PCFShadowMap } : false}
            style={{ flex: 1 }}
          >
            <SceneContents perspective={0} placing={drag !== null || selected !== null} marker={marker} />
            <RenderControl onReady={onSceneReady} />
            <FpsProbe onSecond={onSecond} />
            <DisposeOnUnmount />
          </Canvas>
          </SceneBoundary>
          </View>
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
                  key={`slot-${i}`}
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

        {match.tutorial && sceneReady ? <CoachMarks mode="native" deployed={plays} /> : null}
        {paused && !ended ? <View pointerEvents="none" style={st.pausedVeil} /> : null}
        {!sceneReady ? (
          <View pointerEvents="none" style={st.preparing}>
            <Text style={st.prepTitle}>vs {match.rival}</Text>
            <Text style={st.prepSub}>Preparing the arena…</Text>
          </View>
        ) : null}
        {lastFps ? <Text pointerEvents="none" style={[st.fps, { top: insets.top + 54 }]}>{lastFps} fps</Text> : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#cfe9ff' },
  scene: { flex: 1, overflow: 'hidden' },
  lowres: {
    position: 'absolute', left: 0, top: 0,
    width: `${RENDER_SCALE * 100}%`, height: `${RENDER_SCALE * 100}%`,
    transformOrigin: 'top left', transform: [{ scale: 1 / RENDER_SCALE }],
  },
  top: {
    position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 6, backgroundColor: 'rgba(9,22,48,0.35)',
  },
  mute: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, paddingHorizontal: 8, minHeight: 28, justifyContent: 'center' },
  muteText: { color: '#fff', fontFamily: F.uiBold, fontSize: 10, letterSpacing: 0.5 },
  quit: { width: 44, height: 44, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
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
  preparing: { ...StyleSheet.absoluteFill, backgroundColor: C.blueDeep, alignItems: 'center', justifyContent: 'center', gap: 8 },
  prepTitle: { color: C.gold, fontFamily: F.display, fontSize: 28 },
  prepSub: { color: C.dim, fontFamily: F.ui, fontSize: 14 },
  pausedVeil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,16,38,0.45)' },
  fps: { position: 'absolute', right: 12, color: 'rgba(255,255,255,0.7)', fontFamily: F.uiBold, fontSize: 10 },
});
