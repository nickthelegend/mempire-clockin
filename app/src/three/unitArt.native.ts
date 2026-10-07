import * as THREE from 'three';
import roster from '../../../mobile/src/data/roster.json';
import { UNIT_ART, UNIT_FALLBACK } from '../../../mobile/src/arena/unitArt';
import { reportTextureError } from './canvasTex.native';

/**
 * Native twin of unitArt.ts. The card art is chroma-keyed at build time
 * (mobile/scripts/key-art.py) and bundled as PNG (scripts/unit-png.py — expo-gl
 * decodes with stb_image, which has no WebP), so a unit's picture is already a
 * cut-out: no runtime keyer, no coin registry, no network.
 */
const tickerByMint = new Map((roster as { mint: string; ticker: string }[]).map((r) => [r.mint, r.ticker]));
const FALLBACK = '__avatar';

export function artFor(coinId: string): { url: string; fallback: string } {
  return { url: tickerByMint.get(coinId) ?? FALLBACK, fallback: FALLBACK };
}

export function warmArt(_url?: string): Promise<unknown> {
  return Promise.resolve(null);
}

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

export function textureFor(
  url: string, _fallback: string, onKeyed: (t: THREE.Texture) => void,
): THREE.Texture {
  let t = cache.get(url);
  if (!t) {
    const src = UNIT_ART[url] ?? UNIT_FALLBACK;
    t = loader.load(src as unknown as string, undefined, undefined, (e) => reportTextureError(`unit ${url}`, e));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(url, t);
  }
  const keyed = t;
  // Already a cut-out. Deferred a microtask: the caller's callback closes over
  // the material it is in the middle of constructing.
  void Promise.resolve().then(() => onKeyed(keyed));
  return keyed;
}
