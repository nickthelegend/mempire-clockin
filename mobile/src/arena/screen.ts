/**
 * Screen → normalised device coordinates for the arena view.
 *
 * `frame` is the arena view's rectangle in window coordinates (measureInWindow).
 * The GL canvas may render at a reduced resolution and be scaled up, but NDC
 * is resolution-independent, so the mapping uses the on-screen rectangle only.
 */
export interface Frame { x: number; y: number; w: number; h: number }

export function pageToNdc(pageX: number, pageY: number, f: Frame): { x: number; y: number } {
  return {
    x: ((pageX - f.x) / f.w) * 2 - 1,
    y: -(((pageY - f.y) / f.h) * 2 - 1),
  };
}
