import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatch, startNativeMatch } from '../state/match';
import type { MatchCard } from '../sim/types';
import { archetypeForMint } from '../sim/archetypes';
import { traitForMint } from '../sim/traits';
import { hashState } from '../sim/engine';

/** One match per page load: returning to `/` after a match must not start another. */
let startedOnce = false;

/**
 * The page's whole job inside the Seeker / iOS app: be the arena.
 *
 * Collection, deck, chests, Clock-In streak and SKR shop are native screens.
 * When the player taps BATTLE the native side opens this page with the match
 * written into `window.__MEMPIRE_MATCH__` (before any script runs), this
 * component starts it on the real sim, and the outcome goes back over the
 * bridge as `{channel: 'result'}` — the native result screen pays the reward.
 */
export interface NativeMatchSpec {
  player: { mint: string; ticker: string; level: number }[];
  bot: { mint: string; ticker: string; level: number }[];
  tier: number;
  opponent: string;
  /** 30-second Rush format instead of the 3-minute standard match. */
  rush?: boolean;
}

declare global {
  interface Window {
    __MEMPIRE_MATCH__?: NativeMatchSpec;
    ReactNativeWebView?: { postMessage(msg: string): void };
  }
}

export const isEmbedded = (): boolean =>
  typeof window !== 'undefined' && !!window.__MEMPIRE_MATCH__ && !!window.ReactNativeWebView;

function post(msg: Record<string, unknown>): void {
  try { window.ReactNativeWebView?.postMessage(JSON.stringify(msg)); } catch { /* not in the app */ }
}

const toCards = (list: NativeMatchSpec['player']): MatchCard[] => list.map((c) => ({
  coinId: c.mint,
  name: c.ticker,
  archetype: archetypeForMint(c.mint),
  trait: traitForMint(c.mint),
  level: Math.max(1, Math.min(10, Math.round(c.level))),
}));

export function NativeHost() {
  const nav = useNavigate();
  const status = useMatch((s) => s.status);
  useEffect(() => {
    if (startedOnce) return;
    startedOnce = true;
    const spec = window.__MEMPIRE_MATCH__;
    if (!spec) { post({ channel: 'exit', reason: 'no match' }); return; }
    const err = startNativeMatch(toCards(spec.player), toCards(spec.bot), {
      tier: spec.tier, opponent: spec.opponent, rush: !!spec.rush,
    });
    if (err) post({ channel: 'exit', reason: err });
  }, []);

  useEffect(() => {
    if (status === 'battle') nav('/battle', { replace: true });
  }, [status, nav]);

  return (
    <div style={{
      height: '100dvh', display: 'grid', placeItems: 'center',
      background: 'var(--ink, #0d2a5c)', color: '#ffc422',
      fontFamily: 'Lilita One, system-ui', fontSize: 22, letterSpacing: 1,
    }}
    >
      Entering the arena…
    </div>
  );
}

/**
 * Mounted above the router for the whole embedded session (NativeHost itself
 * unmounts once the arena route takes over): reports the settled result, and
 * hands control back to the app on a forfeit or "return".
 */
export function useNativeExit(): void {
  const status = useMatch((s) => s.status);
  const seen = useRef(false);
  const reported = useRef(false);
  useEffect(() => {
    if (status === 'battle') seen.current = true;
    if (status === 'settled' && !reported.current) {
      reported.current = true;
      seen.current = true;
      const s = useMatch.getState();
      const sim = s.sim;
      post({
        channel: 'result',
        won: !!s.result?.won,
        draw: !!s.result?.draw,
        crowns: s.result?.crowns ?? [0, 0],
        hashes: s.result?.hashes ?? 0,
        ticks: sim?.tick ?? 0,
        finalHash: sim ? (hashState(sim) >>> 0) : 0,
      });
    }
    if (status === 'idle' && seen.current && !reported.current) post({ channel: 'exit', reason: 'left' });
  }, [status]);
}
