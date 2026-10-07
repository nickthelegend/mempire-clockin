import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { create } from 'zustand';

/**
 * The game's sound, native side: the same SFX and battle music the web arena
 * uses (app/public/sfx), played with expo-audio. Respects the phone's silent
 * switch and mixes with other audio. One persisted mute toggle covers both.
 */
const SOURCES = {
  click: require('../assets/sfx/sfx_click.mp3'),
  coin: require('../assets/sfx/sfx_coin.mp3'),
  reward: require('../assets/sfx/sfx_reward.mp3'),
  chest: require('../assets/sfx/sfx_chest.mp3'),
  deploy: require('../assets/sfx/sfx_deploy.mp3'),
  tower: require('../assets/sfx/sfx_tower.mp3'),
  victory: require('../assets/sfx/sfx_victory.mp3'),
  defeat: require('../assets/sfx/sfx_defeat.mp3'),
  error: require('../assets/sfx/sfx_error.mp3'),
} as const;
export type Sfx = keyof typeof SOURCES;

const VOLUME: Partial<Record<Sfx, number>> = { click: 0.35, deploy: 0.55, coin: 0.7 };
const MUTE_KEY = 'mempire.muted.v1';

interface SoundState { muted: boolean; setMuted: (m: boolean) => void }
export const useSound = create<SoundState>((set) => ({
  muted: false,
  setMuted: (muted) => {
    set({ muted });
    void AsyncStorage.setItem(MUTE_KEY, muted ? '1' : '0').catch(() => {});
    if (muted) stopMusic();
  },
}));

const players = new Map<Sfx, AudioPlayer>();
let music: AudioPlayer | null = null;
let ready = false;

export async function initSound(): Promise<void> {
  try {
    const m = await AsyncStorage.getItem(MUTE_KEY);
    if (m === '1') useSound.setState({ muted: true });
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
    ready = true;
  } catch { /* sound is never a dependency */ }
}

export function sfx(name: Sfx): void {
  if (!ready || useSound.getState().muted) return;
  try {
    let p = players.get(name);
    if (!p) {
      p = createAudioPlayer(SOURCES[name]);
      p.volume = VOLUME[name] ?? 0.8;
      players.set(name, p);
    }
    void p.seekTo(0);
    p.play();
  } catch { /* ignore */ }
}

export function startMusic(): void {
  if (!ready || useSound.getState().muted) return;
  try {
    music ??= createAudioPlayer(require('../assets/sfx/music_battle.m4a'));
    music.loop = true;
    music.volume = 0.22;
    void music.seekTo(0);
    music.play();
  } catch { /* ignore */ }
}

export function stopMusic(): void {
  try { music?.pause(); } catch { /* ignore */ }
}
