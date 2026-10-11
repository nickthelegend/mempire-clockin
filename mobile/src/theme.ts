/**
 * Royale Arcade, native edition — the same tokens as app/src/styles/tokens.css
 * so the native screens and the 3D arena read as one game.
 */
export const C = {
  // One palette (Supercell-style cohesion): deep navy, gold rims, purple accents.
  bg: '#0A1028',
  panel: '#121B3D',
  panelRaised: '#18234D',
  rimHi: '#F7D774',
  rimLo: '#B8862B',
  // Legacy names, remapped onto the palette so every screen adopts it.
  blueDeep: '#0A1028',
  blue: '#121B3D',
  blueLit: '#18234D',
  bluePale: '#9DB2FF',
  wood: '#121B3D',
  woodLit: '#18234D',
  woodHi: '#1E2A5A',
  woodDark: '#0E1533',
  woodEdge: '#B8862B',
  gold: '#F7C948',
  goldHi: '#FFE08A',
  btnGold: '#F2B33D',
  btnGoldDark: '#8A5A0C',
  btnBlue: '#6A3FE0',
  btnBlueDark: '#3F2399',
  btnGreen: '#3DDC97',
  btnGreenDark: '#1E8F5E',
  purple: '#9B6CFF',
  teal: '#3DDC97',
  red: '#FF5C7A',
  text: '#FFFFFF',
  dim: '#A9B4D9',
  dimOnWood: '#A9B4D9',
  ink: '#3A2200',
  recess: 'rgba(24, 35, 77, 0.9)',
  scrim: 'rgba(5, 8, 22, 0.86)',
  skr: '#FFD45E',
} as const;

export const F = {
  display: 'LilitaOne_400Regular',
  ui: 'HankenGrotesk_600SemiBold',
  uiBold: 'HankenGrotesk_800ExtraBold',
  uiReg: 'HankenGrotesk_500Medium',
} as const;

export const R = { panel: 20, card: 14, pill: 14, sheet: 24 } as const;

export const TIER_COLORS: Record<string, [string, string]> = {
  silver: ['#dfe8f5', '#8b9dbb'],
  golden: ['#ffd766', '#c8890b'],
  magic: ['#c77dff', '#6a2fb5'],
  legendary: ['#7cf6d8', '#12a88a'],
};

export const ARCH_NAMES = ['Tank', 'Swarm', 'Ranged', 'Splash', 'Support', 'Spell'] as const;
export const ARCH_ICONS = ['icon_tank', 'icon_swarm', 'icon_ranged', 'icon_splash', 'icon_support', 'icon_spell'] as const;
