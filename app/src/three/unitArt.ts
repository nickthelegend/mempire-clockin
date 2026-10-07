import * as THREE from 'three';
import { keyedCanvas } from '../lib/chromaKey';
import { coinByMint } from '../lib/coins';

/**
 * Where a unit's picture comes from, on the web.
 *
 * The native app resolves `unitArt.native.ts` instead: its card art is keyed
 * once at build time (mobile/scripts/key-art.py) and bundled, so there is no
 * runtime chroma key and no coin registry to consult.
 */
export function artFor(coinId: string): { url: string; fallback: string } {
  const coin = coinByMint(coinId);
  const fallback = coin?.logoUrl ?? 'art/avatar_guest.webp';
  return { url: coin?.cardArt ?? fallback, fallback };
}

/** Resolves once the cut-out for `url` exists (or is known not to be needed). */
export function warmArt(url: string): Promise<unknown> {
  return keyedCanvas(url);
}

/** One loader + cache for every unit texture; the same coin recurs constantly. */
const loader = new THREE.TextureLoader();
const rawTexCache = new Map<string, THREE.Texture>();
const keyedTexCache = new Map<string, THREE.Texture>();

/**
 * Loads a unit texture, falling back when the file is not there yet.
 *
 * Card art arrives one file at a time, so `card_<ticker>.png` is requested
 * optimistically and the round coin badge is swapped in on a 404. The texture
 * object is reused either way, so the material never has to be rebuilt and a
 * unit already on the field just changes what it is showing.
 */
export function textureFor(
  url: string, fallback: string, onKeyed: (t: THREE.Texture) => void,
): THREE.Texture {
  // Chroma-keyed art becomes a true cut-out, which is the difference between a
  // character standing on the grass and a portrait in a locket. Un-keyed art
  // (the round coin badges) resolves null and keeps the soft radial mask.
  //
  // Subscribed for EVERY material, cached or not. Hanging this off the raw
  // cache miss instead meant only the first unit of a coin ever learned that
  // the cut-out was ready; a second copy deployed while keying was still in
  // flight took the raw texture and kept it — a character on flat magenta,
  // standing on the grass for the rest of the match.
  void keyedCanvas(url).then((c) => {
    if (!c) return;
    // A CanvasTexture is the right carrier for a keyed cut-out; assigning a
    // canvas onto the existing image-backed texture is not type-safe and can
    // skip the upload, so swap the whole map instead. One per URL, shared by
    // every material showing that coin.
    let keyedTex = keyedTexCache.get(url);
    if (!keyedTex) {
      keyedTex = new THREE.CanvasTexture(c);
      keyedTex.colorSpace = THREE.SRGBColorSpace;
      keyedTex.anisotropy = 4;
      keyedTexCache.set(url, keyedTex);
    }
    onKeyed(keyedTex);
  });

  const hit = rawTexCache.get(url);
  if (hit) return hit;
  const t = loader.load(url, undefined, undefined, () => {
    if (fallback === url) return;
    loader.load(fallback, (fb) => { t.image = fb.image; t.needsUpdate = true; });
  });
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  rawTexCache.set(url, t);
  return t;
}