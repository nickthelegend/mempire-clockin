/**
 * The arena camera fits the board to the free area on every phone shape:
 * near edge on the bottom, far king tower under the HUD, side walls inside.
 *
 *   cd app && npx vitest run tests/arena-fit.test.ts
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitArenaCamera } from '../src/three/fit';

const W = 18; const H = 32; const FOV = 52;

// [name, canvas w, canvas h (pt/dp, area above the card tray), HUD top fraction]
const SHAPES: [string, number, number, number][] = [
  ['iPhone SE 375x667', 375, 667 - 190, 0.16],
  ['Android 360x740', 360, 740 - 190, 0.15],
  ['iPhone 17 402x874', 402, 874 - 200, 0.2],
  ['iPhone 17 Pro Max 440x956', 440, 956 - 210, 0.19],
  ['iPhone 17, largest text', 402, 874 - 240, 0.24],
  ['web arena full-screen 390x844 (HUD overlays both ends)', 390, 844, 0.12],
];

function project(res: ReturnType<typeof fitArenaCamera>, aspect: number, p: THREE.Vector3) {
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.5, 400);
  cam.position.copy(res.position);
  cam.lookAt(res.target);
  cam.updateMatrixWorld(true);
  return p.clone().project(cam);
}

describe('fitArenaCamera', () => {
  for (const [name, w, h, top] of SHAPES) {
    const bottom = name.startsWith('web') ? 0.24 : 0;
    it(`frames the whole board with no dead band: ${name}`, () => {
      const aspect = w / h;
      const r = fitArenaCamera(W, H, aspect, FOV, { top, bottom }, 0);
      const yBottom = -1 + 2 * bottom;
      const yTop = 1 - 2 * top;
      const near = project(r, aspect, new THREE.Vector3(W / 2, 0, -0.9));
      const farTower = project(r, aspect, new THREE.Vector3(W / 2, 5.2, H - 2.5));
      const corners = [[-0.9, -0.9], [W + 0.9, -0.9], [-0.9, H + 0.9], [W + 0.9, H + 0.9]]
        .map(([x, z]) => project(r, aspect, new THREE.Vector3(x, 0, z)));
      // Near edge sits on the bottom of the free area (no crowd band above the hand).
      expect(near.y).toBeGreaterThan(yBottom - 0.001);
      expect(near.y).toBeLessThan(yBottom + 0.05);
      // Far king tower is visible, below the top HUD.
      expect(farTower.y).toBeLessThan(yTop);
      // Both side walls on screen.
      for (const c of corners) { expect(Math.abs(c.x)).toBeLessThanOrEqual(1); }
      // The free area is used: little vertical slack left over.
      expect(r.slack).toBeLessThan(0.12);
    });
  }

  it('seat 1 is the mirror of seat 0 about the river', () => {
    const a = fitArenaCamera(W, H, 0.6, FOV, { top: 0.2, bottom: 0 }, 0);
    const b = fitArenaCamera(W, H, 0.6, FOV, { top: 0.2, bottom: 0 }, 1);
    expect(b.position.z).toBeCloseTo(H - a.position.z, 5);
    expect(b.target.z).toBeCloseTo(H - a.target.z, 5);
    expect(b.position.y).toBeCloseTo(a.position.y, 5);
  });
});
