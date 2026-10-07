// @vitest-environment happy-dom
/**
 * Drag-to-deploy input: a finger position must land on the ground point it is
 * drawn over, and the placement rules must accept/forgive/refuse exactly as on
 * the web. Uses the real camera pose the scene gives seat 0 and the native
 * screen→NDC mapping (mobile/src/arena/screen.ts).
 *
 *   cd app && npx vitest run tests/arena-raycast.test.ts
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SCENE_CAMERA, dropDecision, groundHitNdc, isLegalDrop, poseCamera, setViewSeat,
} from '../src/three/BattleScene';
import { pageToNdc, type Frame } from '../../mobile/src/arena/screen';

// The arena view on an iPhone 17 (402 x 874 pt) minus the HUD tray.
const FRAME: Frame = { x: 0, y: 0, w: 402, h: 690 };

function camera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(SCENE_CAMERA.fov, FRAME.w / FRAME.h, SCENE_CAMERA.near, SCENE_CAMERA.far);
  poseCamera(cam, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** World ground point → the page point a finger would be at. */
function toPage(cam: THREE.Camera, x: number, z: number): { px: number; py: number } {
  const v = new THREE.Vector3(x, 0, z).project(cam);
  return { px: FRAME.x + ((v.x + 1) / 2) * FRAME.w, py: FRAME.y + ((1 - v.y) / 2) * FRAME.h };
}

describe('screen → ground mapping', () => {
  const cam = camera();
  setViewSeat(0);

  it('round-trips ground points across the board through page coordinates', () => {
    for (const [x, z] of [[3.5, 6.5], [14.5, 6.5], [9, 2.5], [9, 16], [4, 25], [16, 29], [1, 1], [17, 14]]) {
      const { px, py } = toPage(cam, x, z);
      const ndc = pageToNdc(px, py, FRAME);
      const hit = groundHitNdc(ndc.x, ndc.y, cam)!;
      expect(hit.x).toBeCloseTo(x, 3);
      expect(hit.z).toBeCloseTo(z, 3);
    }
  });

  it('own half is the near half of the screen, the river is the line', () => {
    const near = toPage(cam, 9, 4);
    const far = toPage(cam, 9, 28);
    expect(near.py).toBeGreaterThan(far.py); // own side is lower on screen
    expect(isLegalDrop(9, 4)).toBe(true);
    expect(isLegalDrop(9, 28)).toBe(false);
  });

  it('accepts a legal drop, forgives a slip over the line, refuses a deep drop', () => {
    expect(dropDecision(5, 8)).toEqual({ x: 5, z: 8 });
    const slip = dropDecision(5, 15.2)!; // just past the river edge of our half
    expect(slip).not.toBeNull();
    expect(isLegalDrop(slip.x, slip.z)).toBe(true);
    expect(dropDecision(5, 24)).toBeNull();
  });
});
