/**
 * Arena skins: cosmetic re-themes of the 3D arena (Neon Night, Golden Hour,
 * Frozen Ledger). Nothing here touches the simulation.
 *
 * Two halves, both shared by the native and the web arena:
 *  - textures: `paintSkin` repaints a default texture for a skin, pixels and
 *    overlays: a glowing grid on the neon field, frost and ice cracks on the
 *    frozen one, a sunset sky. The native bake script
 *    (mobile/scripts/bake-textures.ts) runs it and writes `<name>__<skin>.png`;
 *    the web arena runs it on its live canvases (canvasTex.ts).
 *  - materials: `look()` is the skin's fog, lights, sun angle, trim, tower
 *    stone, crowd palette and field glow, read by the scene components.
 *
 * The skin is a module-level setting read when the scene mounts (textures are
 * made once per mount), so it is set before a battle opens.
 */
export type ArenaSkinId = 'default' | 'neon' | 'golden' | 'frozen';
export const ARENA_SKIN_IDS: ArenaSkinId[] = ['default', 'neon', 'golden', 'frozen'];

let active: ArenaSkinId = 'default';
export function setArenaSkin(id: string | null | undefined): void {
  active = ARENA_SKIN_IDS.includes(id as ArenaSkinId) ? (id as ArenaSkinId) : 'default';
}
export function arenaSkin(): ArenaSkinId { return active; }

export interface SkinLook {
  fog: string;
  ambient: string; ambientI: number;
  sun: string; sunI: number;
  /** Sun position; a low sun casts the long shadows of Golden Hour. */
  sunPos: [number, number, number];
  fill: string; fillI: number;
  /** The gold rule, corner caps and bridge finials. */
  trim: string; trimEmissive: string; trimGlow: number;
  /** Tower stone, upper and lower. */
  stone: string; stoneDark: string;
  /** Emissive strength of the team bands on the towers. */
  towerGlow: number;
  /** Field glow: the grass texture is also its own emissive map. */
  fieldGlow: number;
  riverBed: string;
  torch: string;
  crowd: { blue: string[]; red: string[]; neutral: string[] };
}

const DEFAULT_CROWD = {
  blue: ['#3f6fc9', '#5b8ae0', '#2b4f96'],
  red: ['#c9433f', '#e06b5b', '#96302b'],
  neutral: ['#c9c2b4', '#8d8477', '#e0d8c6', '#6d6152'],
};

export const SKIN_LOOK: Record<ArenaSkinId, SkinLook> = {
  default: {
    fog: '#cfe9ff', ambient: '#e8f2ff', ambientI: 1.35, sun: '#fff6e0', sunI: 2.6, sunPos: [22, 19, 4],
    fill: '#bfe4ff', fillI: 0.55,
    trim: '#ffc422', trimEmissive: '#4a3200', trimGlow: 1,
    stone: '#c9cbd2', stoneDark: '#9fa2ac', towerGlow: 0, fieldGlow: 0,
    riverBed: '#0d4a6b', torch: '#ffb02e', crowd: DEFAULT_CROWD,
  },
  neon: {
    fog: '#14072b', ambient: '#8f7cff', ambientI: 0.7, sun: '#d48cff', sunI: 1.2, sunPos: [22, 19, 4],
    fill: '#3ee6ff', fillI: 1.1,
    trim: '#ff4fd8', trimEmissive: '#ff4fd8', trimGlow: 1.6,
    stone: '#4a4380', stoneDark: '#2a2550', towerGlow: 1.4, fieldGlow: 0.9,
    riverBed: '#05122e', torch: '#3ee6ff',
    crowd: {
      blue: ['#1b1838', '#231d48', '#14112a'],
      red: ['#1e1534', '#2a1a40', '#130d24'],
      // Phone screens in a dark stadium.
      neutral: ['#3ee6ff', '#ff4fd8', '#ffffff', '#1a1630'],
    },
  },
  golden: {
    fog: '#ff9d5c', ambient: '#ffcf9a', ambientI: 1.05, sun: '#ff8a2a', sunI: 3.4, sunPos: [34, 6.5, 2],
    fill: '#ff6f91', fillI: 0.45,
    trim: '#ffae2e', trimEmissive: '#a04a00', trimGlow: 1.2,
    stone: '#f0cf9c', stoneDark: '#c6955c', towerGlow: 0.25, fieldGlow: 0,
    riverBed: '#5a2a0a', torch: '#ffd166',
    crowd: {
      blue: ['#e08a3c', '#f2a65a', '#b8682a'],
      red: ['#d9483b', '#f06a4a', '#a8322a'],
      neutral: ['#ffd9a0', '#c9884a', '#ffe9c4', '#8a5a2e'],
    },
  },
  frozen: {
    fog: '#eaf6ff', ambient: '#e4f2ff', ambientI: 1.55, sun: '#ffffff', sunI: 2.2, sunPos: [22, 19, 4],
    fill: '#9fd8ff', fillI: 0.9,
    trim: '#9fe0ff', trimEmissive: '#2f7fbf', trimGlow: 1.1,
    stone: '#f6fbff', stoneDark: '#d3e6f5', towerGlow: 0.2, fieldGlow: 0,
    riverBed: '#9ccbe8', torch: '#c8f0ff',
    crowd: {
      blue: ['#dbeaff', '#b9d4f5', '#f2f8ff'],
      red: ['#ffe2e2', '#f5c2c8', '#fff4f4'],
      neutral: ['#ffffff', '#e6f0fa', '#c9dcee', '#f7fbff'],
    },
  },
};

export const look = (): SkinLook => SKIN_LOOK[active];

/** Textures that get a skinned variant. Unit sprites, masks and VFX dots stay as they are. */
export const SKINNED_TEXTURES = ['grass', 'meadow', 'sky', 'cloud', 'water', 'caustic', 'wood', 'sand', 'stone', 'masonry'];

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Recolour one RGB pixel (0..255) of texture `name` for a skin. Pure, deterministic. */
export function recolor(skin: Exclude<ArenaSkinId, 'default'>, r: number, g: number, b: number, name = 'grass'): [number, number, number] {
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const field = name === 'grass' || name === 'meadow';
  const wet = name === 'water' || name === 'caustic';
  switch (skin) {
    case 'neon':
      // Night: near-black violet, keeping the checker's contrast.
      if (field) return [clamp(14 + l * 70), clamp(6 + l * 26), clamp(38 + l * 110)];
      if (wet) return [clamp(4 + l * 40), clamp(18 + l * 150), clamp(60 + l * 190)];
      return [clamp(18 + l * 70), clamp(14 + l * 50), clamp(40 + l * 110)];
    case 'golden':
      // Late sun: everything warm and amber.
      if (field) return [clamp(120 + l * 135), clamp(80 + l * 110), clamp(18 + l * 40)];
      if (wet) return [clamp(150 + l * 105), clamp(70 + l * 120), clamp(20 + l * 60)];
      return [clamp(r * 1.15 + 30), clamp(g * 0.9 + 12), clamp(b * 0.5)];
    case 'frozen':
      // Ice and snow: pale blue-white.
      if (field) return [clamp(150 + l * 105), clamp(178 + l * 80), clamp(214 + l * 45)];
      if (wet) return [clamp(150 + l * 90), clamp(196 + l * 55), clamp(225 + l * 30)];
      return [clamp(l * 70 + 180), clamp(l * 60 + 196), clamp(l * 40 + 214)];
  }
}

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Repaint a default texture's canvas for a skin: recolour every pixel, then
 * draw the skin's overlay. Works on any 2D context (browser canvas or the
 * bake script's @napi-rs/canvas).
 */
export function paintSkin(name: string, ctx: CanvasRenderingContext2D, w: number, h: number, skin: ArenaSkinId): void {
  if (skin === 'default' || !SKINNED_TEXTURES.includes(name)) return;

  if (name === 'sky') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const stops: Record<Exclude<ArenaSkinId, 'default'>, [number, string][]> = {
      neon: [[0, '#05010f'], [0.45, '#1a0636'], [0.75, '#3a0a5a'], [1, '#14072b']],
      golden: [[0, '#3b1c5a'], [0.35, '#b4407a'], [0.65, '#ff7a3c'], [1, '#ff9d5c']],
      frozen: [[0, '#9cc4e4'], [0.5, '#cfe6f7'], [1, '#eaf6ff']],
    };
    stops[skin].forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = recolor(skin, d[i], d[i + 1], d[i + 2], name);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);

  const rnd = prng(7 + name.length * 131);
  if (name === 'grass') {
    const half = w / 2;
    if (skin === 'neon') {
      // The glowing grid: magenta and cyan edges around every tile.
      ctx.lineWidth = 6;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          ctx.strokeStyle = (sx + sy) % 2 ? '#3ee6ff' : '#ff4fd8';
          ctx.strokeRect(sx * half + 3, sy * half + 3, half - 6, half - 6);
        }
      }
    } else if (skin === 'frozen') {
      // Frost: drifts of white specks and a few cracks.
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(170,215,245,0.8)';
        ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
      }
      ctx.strokeStyle = 'rgba(120,180,225,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) crack(ctx, rnd, w, h);
    } else {
      // Golden: low sun streaks across the field.
      ctx.fillStyle = 'rgba(255,240,180,0.22)';
      for (let i = 0; i < 6; i++) ctx.fillRect(0, (i / 6) * h + rnd() * 20, w, 10 + rnd() * 14);
    }
  } else if (name === 'water' && skin === 'frozen') {
    // A frozen river: white ice with cracks.
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,150,200,0.85)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 10; i++) crack(ctx, rnd, w, h);
  } else if (name === 'water' && skin === 'neon') {
    ctx.strokeStyle = 'rgba(62,230,255,0.85)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const y = rnd() * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (rnd() - 0.5) * 30); ctx.stroke();
    }
  } else if ((name === 'masonry' || name === 'sand' || name === 'stone' || name === 'meadow') && skin === 'frozen') {
    // Snow on every surface.
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 5, 2 + rnd() * 3);
    }
  } else if ((name === 'masonry' || name === 'meadow') && skin === 'neon') {
    // Light specks in the dark.
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = ['#3ee6ff', '#ff4fd8', '#ffffff'][i % 3];
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  }
}

function crack(ctx: CanvasRenderingContext2D, rnd: () => number, w: number, h: number) {
  let x = rnd() * w;
  let y = rnd() * h;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let j = 0; j < 5; j++) {
    x += (rnd() - 0.5) * 70;
    y += (rnd() - 0.5) * 70;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}
