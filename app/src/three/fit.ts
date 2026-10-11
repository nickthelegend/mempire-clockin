import * as THREE from 'three';

/**
 * Frame the whole board in whatever space the HUD leaves.
 *
 * The old pose was one fixed camera (y 38, 52° fov) for every screen. On a
 * tall phone that left a band of crowd between the near king tower and the
 * card hand; on a narrow one the board's edges ran off the sides. This solves
 * the pose per viewport instead: for the canvas aspect and the fraction of it
 * covered by HUD at the top and bottom, it finds the camera tilt and distance
 * that put the near edge of the board on the bottom of the free area, the far
 * king tower just under the top HUD, and both side walls inside the screen.
 *
 * Pure (no React, no renderer): the native and web hosts call it from the
 * camera rig, and tests call it for a range of phone shapes.
 */

export interface FitInsets {
  /** Fraction of the canvas height covered by HUD at the top (0..0.5). */
  top: number;
  /** Fraction covered at the bottom (0..0.5). */
  bottom: number;
}

export interface FitResult {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Tilt below the horizon, degrees. */
  pitch: number;
  /** Unused vertical space inside the free area, in NDC units (0 = filled). */
  slack: number;
}

const PITCH_MIN = 50;
const PITCH_MAX = 70;
const SIDE_PAD = 0.02;
const EDGE_PAD = 0.015;

const scratchCam = new THREE.PerspectiveCamera();
const v = new THREE.Vector3();

/**
 * Points that must be on screen, for seat 0 (camera at the z = 0 end). The
 * board is W x H tiles; the wood frame adds about a tile; towers stand ~4-5
 * tiles tall, so the far ones' tops are what touch the top of the frame.
 */
function keyPoints(W: number, H: number): THREE.Vector3[] {
  return [
    new THREE.Vector3(-0.9, 0, -0.9), new THREE.Vector3(W + 0.9, 0, -0.9),
    new THREE.Vector3(-0.9, 0, H + 0.9), new THREE.Vector3(W + 0.9, 0, H + 0.9),
    new THREE.Vector3(W / 2, 5.2, H - 2.5),
    new THREE.Vector3(3.5, 4.2, H - 6.5), new THREE.Vector3(W - 3.5, 4.2, H - 6.5),
  ];
}

function bounds(cam: THREE.PerspectiveCamera, pts: THREE.Vector3[]) {
  cam.updateMatrixWorld(true);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const p of pts) {
    v.copy(p).project(cam);
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, maxX, minY, maxY };
}

function place(cam: THREE.PerspectiveCamera, W: number, pitchDeg: number, dist: number, tz: number): void {
  const p = THREE.MathUtils.degToRad(pitchDeg);
  cam.position.set(W / 2, Math.sin(p) * dist, tz - Math.cos(p) * dist);
  cam.lookAt(W / 2, 0, tz);
}

/** Ground target z that puts the lowest key point exactly on `yBottom`. */
function solveTarget(cam: THREE.PerspectiveCamera, pts: THREE.Vector3[], W: number, H: number, pitch: number, dist: number, yBottom: number): number {
  // Moving the target further away slides the board down the screen.
  let lo = -H; let hi = 2 * H;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    place(cam, W, pitch, dist, mid);
    if (bounds(cam, pts).minY > yBottom) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function fitArenaCamera(
  W: number, H: number, aspect: number, fovDeg: number, insets: FitInsets, seat: 0 | 1,
): FitResult {
  const cam = scratchCam;
  cam.fov = fovDeg;
  cam.aspect = Math.max(0.2, aspect);
  cam.near = 0.5;
  cam.far = 400;
  cam.updateProjectionMatrix();
  const pts = keyPoints(W, H);
  const top = Math.min(0.5, Math.max(0, insets.top));
  const bottom = Math.min(0.5, Math.max(0, insets.bottom));
  const yBottom = -1 + 2 * bottom + EDGE_PAD;
  const yTop = 1 - 2 * top - EDGE_PAD;
  const xLim = 1 - SIDE_PAD;

  let best: { pitch: number; dist: number; tz: number; slack: number } | null = null;
  for (let pitch = PITCH_MIN; pitch <= PITCH_MAX; pitch += 1) {
    // Smallest distance at which the board fits both across and up the free area.
    let lo = 8; let hi = 300; let tz = H / 2;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const t = solveTarget(cam, pts, W, H, pitch, mid, yBottom);
      place(cam, W, pitch, mid, t);
      const b = bounds(cam, pts);
      const fits = b.maxY <= yTop && b.maxX <= xLim && b.minX >= -xLim;
      if (fits) { hi = mid; tz = t; } else lo = mid;
    }
    place(cam, W, pitch, hi, tz);
    const slack = Math.max(0, yTop - bounds(cam, pts).maxY);
    // Prefer the lowest tilt (the original, most "3D" look) that fills the
    // space; a tall screen tilts further over the board instead of showing crowd.
    if (!best || slack < best.slack - 0.01) best = { pitch, dist: hi, tz, slack };
    if (slack < 0.02) break;
  }
  const b = best!;
  place(cam, W, b.pitch, b.dist, b.tz);
  const position = cam.position.clone();
  const target = new THREE.Vector3(W / 2, 0, b.tz);
  if (seat === 1) {
    // The exact mirror about the river line.
    position.z = H - position.z;
    target.z = H - target.z;
  }
  return { position, target, pitch: b.pitch, slack: b.slack };
}
