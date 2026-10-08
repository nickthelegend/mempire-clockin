/**
 * Fighters shown before a player owns anything: the Connect hero fan and the
 * Intro battle slide. Only visible (licensed-safe) fighters; a unit test checks
 * every id against the roster (app/tests/hidden-fighters.test.ts).
 */
export const HERO_FIGHTERS = ['BTC', 'BONK', 'SOL', 'WIF', 'GOAT'] as const;
export const INTRO_FIGHTERS = ['WIF', 'BTC', 'BONK'] as const;
