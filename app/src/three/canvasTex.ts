import * as THREE from 'three';

/**
 * The one place the scene turns 2D drawing into a texture.
 *
 * On the web every procedural texture (grass, water, wood, sky, the soft dots
 * the particles use) is drawn on a canvas at runtime. React Native has no
 * canvas, so the native app ships the same drawings pre-rendered: Metro
 * resolves `canvasTex.native.ts` instead of this file, and there `newCanvas`
 * hands back an inert stand-in and `toTexture` returns the baked PNG with the
 * same name. The PNGs come from `mobile/scripts/bake-textures.ts`, which runs
 * these very generators in Node against a real canvas — same pixels, one
 * source of truth.
 */
export interface NamedCanvas { canvas: HTMLCanvasElement; name: string }

let makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** For the bake script: every canvas drawn, by name. */
export const baked = new Map<string, HTMLCanvasElement>();
/** For the bake script: draw onto Node canvases instead of DOM ones. */
export function setCanvasFactory(f: (w: number, h: number) => HTMLCanvasElement): void { makeCanvas = f; }

const names = new WeakMap<HTMLCanvasElement, string>();

/** A fresh canvas for the texture called `name`, and its 2D context. */
export function newCanvas(name: string, w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  names.set(c, name);
  baked.set(name, c);
  return [c, ctx as CanvasRenderingContext2D];
}

/** The texture for a canvas made by `newCanvas`. */
export function toTexture(c: HTMLCanvasElement): THREE.Texture {
  return new THREE.CanvasTexture(c);
}
