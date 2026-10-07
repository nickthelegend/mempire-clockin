/**
 * Arena skins: cosmetic recolours of the 3D arena (Neon Night, Golden Hour,
 * Frozen Ledger). Nothing here touches the simulation.
 *
 * Two halves:
 *  - textures: `recolor` turns a default texture's pixels into the skin's.
 *    The native bake script (mobile/scripts/bake-textures.ts) runs it over the
 *    baked PNGs and writes `<name>__<skin>.png`; the native canvas backend
 *    picks those when a skin is active. The web arena keeps the default look.
 *  - lighting: `SKIN_LOOK` sets fog, ambient, sun and fill light per skin.
 *
 * The skin is a module-level setting read when the scene mounts (textures are
 * made once per mount), so it is set before a battle opens.
 */
export type ArenaSkinId = 'default' | 'neon' | 'golden' | 'frozen';
export const ARENA_SKIN_IDS: ArenaSkinId[] = ['default', 'neon', 'golden', 'frozen'];

let active: ArenaSkinId = 'default';
export function setArenaSkin(id: ArenaSkinId): void { active = ARENA_SKIN_IDS.includes(id) ? id : 'default'; }
export function arenaSkin(): ArenaSkinId { return active; }

export interface SkinLook {
  fog: string;
  ambient: string; ambientI: number;
  sun: string; sunI: number;
  fill: string; fillI: number;
}

export const SKIN_LOOK: Record<ArenaSkinId, SkinLook> = {
  default: { fog: '#cfe9ff', ambient: '#e8f2ff', ambientI: 1.35, sun: '#fff6e0', sunI: 2.6, fill: '#bfe4ff', fillI: 0.55 },
  neon: { fog: '#1b1040', ambient: '#a58cff', ambientI: 1.05, sun: '#ff8ae6', sunI: 2.0, fill: '#3ee6ff', fillI: 1.25 },
  golden: { fog: '#ffcf96', ambient: '#ffe2b8', ambientI: 1.25, sun: '#ffb466', sunI: 2.9, fill: '#ff9a6a', fillI: 0.5 },
  frozen: { fog: '#e8f5ff', ambient: '#e4f2ff', ambientI: 1.5, sun: '#f2f9ff', sunI: 2.3, fill: '#9fd8ff', fillI: 0.85 },
};

/** Textures that get a skinned variant. Unit sprites, masks and VFX dots stay as they are. */
export const SKINNED_TEXTURES = ['grass', 'meadow', 'sky', 'cloud', 'water', 'caustic', 'wood', 'sand', 'stone', 'masonry'];

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Recolour one RGB pixel (0..255) for a skin. Pure, deterministic. */
export function recolor(skin: Exclude<ArenaSkinId, 'default'>, r: number, g: number, b: number): [number, number, number] {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  switch (skin) {
    case 'neon': {
      // Night: dark violet base, greens push to magenta, blues to cyan.
      const l = lum / 255;
      const greenish = Math.max(0, g - Math.max(r, b)) / 255;
      const blueish = Math.max(0, b - Math.max(r, g)) / 255;
      return [
        clamp(30 + l * 120 + greenish * 160),
        clamp(10 + l * 60 + blueish * 170),
        clamp(60 + l * 150 + greenish * 60 + blueish * 60),
      ];
    }
    case 'golden':
      // Late sun: warm everything, lift reds, sink blues.
      return [clamp(r * 1.12 + 28), clamp(g * 0.92 + 14), clamp(b * 0.55)];
    case 'frozen':
      // Ice: desaturated toward a pale blue-white.
      return [clamp(lum * 0.78 + 46), clamp(lum * 0.86 + 52), clamp(lum * 0.92 + 70)];
  }
}
