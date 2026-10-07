import * as THREE from 'three';
import { BAKED } from '../../../mobile/src/arena/baked';

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

export function toTexture(c: HTMLCanvasElement): THREE.Texture {
  const name = (c as unknown as Inert).__baked;
  const asset = BAKED[name];
  if (asset === undefined) throw new Error(`no baked texture "${name}" — run mobile/scripts/bake-textures.ts`);
  return loader.load(asset as unknown as string);
}
