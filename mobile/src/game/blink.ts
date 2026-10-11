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

// ── Ghost Duels ─────────────────────────────────────────────────────────────

export const duelActionUrl = (sig: string) => `${ACTIONS_BASE}/api/actions/duel?c=${sig}`;
export const duelBlinkUrl = (sig: string) =>
  `https://dial.to/?action=${encodeURIComponent(`solana-action:${duelActionUrl(sig)}`)}&cluster=devnet`;
/** The deep link carries the ghost too, so it plays even before the chain is read. */
export const duelDeepLink = (sig: string | null, payload: string) =>
  `mempire://duel?${sig ? `c=${sig}&` : ''}d=${payload}`;

export function duelMessage(sig: string | null, payload: string, rush: boolean): string {
  const head = `Mempire Ghost Duel: beat my ${rush ? '30-second Rush' : '3-minute'} match. You fight a replay of my exact deploys, same seed. No stake.`;
  return sig
    ? `${head}\n\nBlink (Solana devnet): ${duelBlinkUrl(sig)}\n\nIn the app: ${duelDeepLink(sig, payload)}`
    : `${head}\n\nIn the app: ${duelDeepLink(null, payload)}\n(not posted on chain: the result can still be replayed, but not answered on chain)`;
}

// ── Scan to duel ────────────────────────────────────────────────────────────

/**
 * Solana Pay transaction request for a ghost duel: the duel Action answers GET
 * with { label, icon } and POST { account } with a transaction (the accept
 * memo), which is exactly the Solana Pay transaction-request shape. The link
 * is URL-encoded after `solana:` because it carries a query string (spec).
 */
export const solanaPayDuelUrl = (sig: string) => `solana:${encodeURIComponent(duelActionUrl(sig))}`;
/** The short app link: the ghost itself is read from chain by its signature. */
export const duelScanLink = (sig: string) => `mempire://duel?c=${sig}`;
