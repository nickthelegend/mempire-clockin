/**
 * The per-asset board and the Season War. Pure functions.
 *
 * Mempire has no game server, so there is no global ranking yet. What is real:
 *  - your per-coin record, from your battles on this device (which fighters
 *    were in the deck, and whether you won);
 *  - your Season War pledge, written into each signed Clock-In memo
 *    (`...:war=1:side=BONK`), so a global tally can be rebuilt from chain by
 *    anyone. The app says plainly that it does not compute one yet.
 */
export const SEASON_WAR = { id: 1, sides: ['BONK', 'POPCAT'] as const, title: 'BONK vs POPCAT' };
export type WarSide = (typeof SEASON_WAR.sides)[number];
export const isWarSide = (s: unknown): s is WarSide => SEASON_WAR.sides.includes(s as WarSide);

export interface BoardBattle { won: boolean; draw: boolean; deck?: string[] }
export interface AssetRow { ticker: string; battles: number; wins: number; score: number }

/** Score per coin: 3 per win, 1 per draw, over every battle it was in the deck. */
export function assetBoard(history: BoardBattle[]): AssetRow[] {
  const m = new Map<string, AssetRow>();
  for (const b of history) {
    for (const t of new Set(b.deck ?? [])) {
      const r = m.get(t) ?? { ticker: t, battles: 0, wins: 0, score: 0 };
      r.battles += 1;
      if (b.won) { r.wins += 1; r.score += 3; } else if (b.draw) r.score += 1;
      m.set(t, r);
    }
  }
  return [...m.values()].sort((a, b) => b.score - a.score || b.wins - a.wins || a.ticker.localeCompare(b.ticker));
}

/** Your war points for a side: 3 per win and 1 per draw with that coin in the deck, plus 2 per pledged Clock-In. */
export function warPoints(history: BoardBattle[], side: WarSide, pledgedClockIns: number): number {
  const row = assetBoard(history).find((r) => r.ticker === side);
  return (row?.score ?? 0) + 2 * pledgedClockIns;
}

/** The memo suffix a pledged Clock-In carries. */
export const warMemo = (side: WarSide | null | undefined) => (side ? `:war=${SEASON_WAR.id}:side=${side}` : '');
