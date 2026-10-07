import * as THREE from 'three';
import roster from '../../../mobile/src/data/roster.json';
import { CARD_ART, UI_ART } from '../../../mobile/src/data/art';

/**
 * Native twin of unitArt.ts. The card art is chroma-keyed at build time
 * (mobile/scripts/key-art.py) and bundled, so a unit's picture is already a
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
    const src = CARD_ART[url] ?? UI_ART.avatar_guest;
    t = loader.load(src as unknown as string);
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
