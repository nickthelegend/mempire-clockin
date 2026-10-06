/**
 * Royale Arcade, native edition — the same tokens as app/src/styles/tokens.css
 * so the native screens and the 3D arena read as one game.
 */
export const C = {
  blueDeep: '#0d2a5c',
  blue: '#14418f',
  blueLit: '#2160c4',
  bluePale: '#59a6f5',
  wood: '#7a4a22',
  woodLit: '#96602e',
  woodHi: '#b9793c',
  woodDark: '#4a2a11',
  woodEdge: '#2e1908',
  gold: '#ffc422',
  goldHi: '#ffe38a',
  btnGold: '#f5b423',
  btnGoldDark: '#a86e07',
  btnBlue: '#3aa0f7',
  btnBlueDark: '#17629f',
  btnGreen: '#52c41a',
  btnGreenDark: '#2c7a06',
  purple: '#9945ff',
  teal: '#14f195',
  red: '#ff4d6d',
  text: '#ffffff',
  dim: '#dbe8ff',
  dimOnWood: '#f6e6cc',
  ink: '#10203f',
  recess: 'rgba(9, 22, 48, 0.55)',
  scrim: 'rgba(6, 16, 38, 0.86)',
  skr: '#c8ff2e',
} as const;

export const F = {
  display: 'LilitaOne_400Regular',
  ui: 'HankenGrotesk_600SemiBold',
  uiBold: 'HankenGrotesk_800ExtraBold',
  uiReg: 'HankenGrotesk_500Medium',
} as const;

export const R = { panel: 16, card: 12, pill: 14, sheet: 24 } as const;

export const TIER_COLORS: Record<string, [string, string]> = {
  silver: ['#dfe8f5', '#8b9dbb'],
  golden: ['#ffd766', '#c8890b'],
  magic: ['#c77dff', '#6a2fb5'],
  legendary: ['#7cf6d8', '#12a88a'],
};

export const ARCH_NAMES = ['Tank', 'Swarm', 'Ranged', 'Splash', 'Support', 'Spell'] as const;
export const ARCH_ICONS = ['icon_tank', 'icon_swarm', 'icon_ranged', 'icon_splash', 'icon_support', 'icon_spell'] as const;
