import { RIVALS } from './rules';

/**
 * "Share as Blink": the Challenge-a-friend Solana Action, hosted on Vercel
 * (actions/ in this repo, devnet only). A Blink-aware client (dial.to,
 * Phantom, Backpack, X with a Blinks extension) renders it as a card with an
 * "Accept" button that signs `mempire:challenge:v1:<rival>` on devnet and
 * hands back the app deep link.
 */
export const ACTIONS_BASE = 'https://mempire-actions.vercel.app';
const SLUGS = ['doggo-pack', 'blue-chips', 'degen-swarm', 'whale-court'];

export const actionUrl = (rivalIndex: number) =>
  `${ACTIONS_BASE}/api/actions/challenge?rival=${SLUGS[rivalIndex] ?? SLUGS[1]}`;

export const blinkUrl = (rivalIndex: number) =>
  `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl(rivalIndex)}`)}&cluster=devnet`;

export function blinkMessage(rivalIndex: number): string {
  const rival = (RIVALS[rivalIndex] ?? RIVALS[1]).name.replace(' (AI)', '');
  return `Mempire challenge: beat ${rival}. Accept it on Solana (devnet) from this Blink:\n${blinkUrl(rivalIndex)}\n\nsolana-action:${actionUrl(rivalIndex)}`;
}
