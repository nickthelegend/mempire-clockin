import * as THREE from 'three';
import { newCanvas, toTexture } from './canvasTex';

/**
 * A soft radial alpha mask, drawn once and shared.
 *
 * The card art is a character on a radial glow, not a cut-out — dropping it
 * straight onto a quad would put a visible rectangle on the grass. Fading the
 * outer edge removes the rectangle, and the glow that survives inside the mask
 * reads as an aura around the fighter rather than a background.
 */
export function makeAlphaMask(): THREE.Texture {
  const S = 128;
  const [c, g] = newCanvas('unit-mask', S);
  // Generous and soft: a tight mask eats heads and feet off a portrait, and a
  // hard edge reads as a sticker cut out of the grass.
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.30, S / 2, S / 2, S * 0.70);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(0.80, '#fff');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = toTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
