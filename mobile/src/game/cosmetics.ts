import type { ArenaSkinId } from '../../../app/src/three/skin';
import { ARENA_SKINS, FRAME_SKINS, ownsSkin, usePassChain } from '../chain/pass';
import { useGame, type Equipped } from '../state/game';
import { PASS_FRAMES } from './season';

/**
 * What is actually worn. An equipped on-chain skin only applies while the
 * live chain read says this wallet holds it; a pass frame only while it is
 * unlocked on this device. Anything else falls back to the default look.
 */
type ChainView = Parameters<typeof ownsSkin>[0];

export function arenaSkinFor(eq: Equipped, chain: ChainView): ArenaSkinId {
  const s = ARENA_SKINS.find((x) => x.key === eq.arena);
  return s && ownsSkin(chain, s.id) ? (s.key as ArenaSkinId) : 'default';
}

export function frameColorsFor(eq: Equipped, chain: ChainView, unlocked: string[]): [string, string] | null {
  const chainFrame = FRAME_SKINS.find((x) => x.key === eq.frame);
  if (chainFrame) return ownsSkin(chain, chainFrame.id) ? chainFrame.colors : null;
  const passFrame = PASS_FRAMES[eq.frame];
  return passFrame && unlocked.includes(eq.frame) ? passFrame.colors : null;
}

export function activeArenaSkin(): ArenaSkinId {
  return arenaSkinFor(useGame.getState().equipped, usePassChain.getState());
}

/** The equipped card frame's two colours, or null for the default frame. */
export function useFrameColors(): [string, string] | null {
  const eq = useGame((s) => s.equipped);
  const unlocked = useGame((s) => s.cosmetics.frames);
  const status = usePassChain((s) => s.status);
  const held = usePassChain((s) => s.held);
  return frameColorsFor(eq, { status, held }, unlocked);
}
