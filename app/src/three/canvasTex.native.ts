import * as THREE from 'three';
import { BAKED } from '../../../mobile/src/arena/baked';
import { arenaSkin } from './skin';

/**
 * Native twin of canvasTex.ts (Metro picks this file on iOS/Android).
 *
 * There is no 2D canvas in React Native. The generators still run — their draw
 * calls land on an inert context — and the texture each one returns is the PNG
 * that mobile/scripts/bake-textures.ts rendered from the same code, loaded
 * through @react-three/fiber/native's expo-asset TextureLoader. The sampler
 * settings (wrap, repeat, colour space) are applied by the generator exactly
 * as on the web.
 */
interface Inert { __baked: string; width: number; height: number }

const gradient = { addColorStop: () => undefined };
const INERT_CTX = new Proxy({}, {
  get: (_t, prop) => (
    prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern'
      ? () => gradient
      : () => undefined
  ),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

export const baked = new Map<string, HTMLCanvasElement>();
export function setCanvasFactory(): void { /* the bake script only runs on Node */ }

export function newCanvas(name: string, w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c: Inert = { __baked: name, width: w, height: h };
  return [c as unknown as HTMLCanvasElement, INERT_CTX];
}

const loader = new THREE.TextureLoader();

/**
 * A texture that fails to load does not throw: the scene would just render
 * blank surfaces at full frame rate, which no fps watchdog can see. Failures
 * are reported here instead, and the native arena falls back on them.
 */
type Listener = (what: string) => void;
const listeners = new Set<Listener>();
export function onTextureError(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function reportTextureError(what: string, e: unknown): void {
  const msg = `${what}: ${e instanceof Error ? e.message : String(e)}`;
  listeners.forEach((fn) => fn(msg));
}

export function toTexture(c: HTMLCanvasElement): THREE.Texture {
  const base = (c as unknown as Inert).__baked;
  // An equipped arena skin swaps in its baked variant when there is one.
  const skin = arenaSkin();
  const name = skin !== 'default' && BAKED[`${base}__${skin}`] !== undefined ? `${base}__${skin}` : base;
  const asset = BAKED[name];
  if (asset === undefined) throw new Error(`no baked texture "${name}" — run mobile/scripts/bake-textures.ts`);
  return loader.load(asset as unknown as string, undefined, undefined, (e) => reportTextureError(`texture ${name}`, e));
}
