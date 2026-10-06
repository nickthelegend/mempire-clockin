import { PublicKey } from '@solana/web3.js';
import { clockInMemo, explorerTx } from '../chain/solana';
import { SKR_LIVE, earnIxs, payIxs } from '../chain/skr';
import { askPermission, chestReminder, haptic, streakReminder } from '../notify';
import { useGame, avgDeckLevel } from '../state/game';
import { useUi, type PendingMatch } from '../state/ui';
import { useWallet } from '../wallet/wallet';
import {
  BY_TICKER, CHESTS, RIVALS, SHOP, dayKey, rivalDeck, type ShopItemId,
} from './rules';

/**
 * Everything that crosses from the game into the chain, in one place.
 *
 * The rule for every action here: do the on-chain part when the wallet can pay
 * for it, and when it cannot (no devnet SOL, wallet declined, RPC down) still
 * let the game move, record *why* it stayed off-chain, and say so on screen.
 * A Clock-In never fails because the faucet was dry.
 */
const FEE_FLOOR_SOL = 0.00002;

const canPayFees = () => {
  const { sol, address } = useWallet.getState();
  return !!address && (sol ?? 0) >= FEE_FLOOR_SOL;
};

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** SKR rewards owed to the player: minted on-chain when possible, else held as owed/simulated. */
async function payOutSkr(amount: number): Promise<{ sig?: string; owed: boolean }> {
  const { address, send } = useWallet.getState();
  if (SKR_LIVE && address && canPayFees()) {
    try {
      const sig = await send(earnIxs(new PublicKey(address), amount));
      return { sig, owed: false };
    } catch { /* fall through to owed */ }
  }
  useGame.getState().addSkrSim(amount);
  return { owed: true };
}

export interface ClockInResult {
  streak: number;
  skr: number;
  chestTier: string | null;
  chestStored: boolean;
  sig?: string;
  offlineReason?: string;
  shieldsUsed: number;
  broke: boolean;
}

export async function doClockIn(seeker: boolean): Promise<ClockInResult | null> {
  const game = useGame.getState();
  const preview = game.previewClockIn(seeker);
  if (!preview) return null;
  const { address, send } = useWallet.getState();
  const day = dayKey();

  let sig: string | undefined;
  let offlineReason: string | undefined;
  if (!address) offlineReason = 'no wallet connected';
  else if (!canPayFees()) offlineReason = 'no devnet SOL for the network fee';
  else {
    try {
      const owner = new PublicKey(address);
      // One transaction: the signed memo that *is* the Clock-In, plus the
      // day's stand-in SKR minted straight to the player by the public faucet.
      sig = await send([clockInMemo(owner, day, preview.outcome.streak.count), ...earnIxs(owner, preview.reward.skr)]);
    } catch (e) {
      offlineReason = errText(e);
    }
  }

  const done = game.commitClockIn(seeker, { sig, offlineReason });
  if (!done) return null;
  // SKR minted in the same transaction when it went through; otherwise owed.
  if (!sig || !SKR_LIVE) useGame.getState().addSkrSim(done.reward.skr);
  haptic.success();
  // Asked here, not at launch: the first Clock-In is when a reminder means something.
  void askPermission().then((ok) => { if (ok) void streakReminder(done.outcome.streak.count); });
  return {
    streak: done.outcome.streak.count,
    skr: done.reward.skr,
    chestTier: done.reward.chest,
    chestStored: !!done.chest || !done.reward.chest,
    sig,
    offlineReason,
    shieldsUsed: done.outcome.shieldsUsed,
    broke: done.outcome.broke,
  };
}

/** Claim SKR that was earned while the wallet could not pay the fee. */
export async function claimOwedSkr(): Promise<string> {
  const g = useGame.getState();
  const { address, send } = useWallet.getState();
  if (!SKR_LIVE) throw new Error('The SKR devnet stand-in is not deployed in this build');
  if (!address) throw new Error('Connect a wallet first');
  if (g.skrSim <= 0) throw new Error('Nothing to claim');
  const amount = g.skrSim;
  const sig = await send(earnIxs(new PublicKey(address), amount));
  useGame.getState().spendSkrSim(amount);
  return sig;
}

export async function buy(id: ShopItemId): Promise<{ sig?: string }> {
  const item = SHOP.find((i) => i.id === id)!;
  const g = useGame.getState();
  const unlocking = g.chests.find((c) => c.unlockAt !== null && c.unlockAt > Date.now());
  if (id === 'rush' && !unlocking) throw new Error('Start unlocking a chest first');

  let sig: string | undefined;
  if (SKR_LIVE) {
    const { address, skr, send } = useWallet.getState();
    if (!address) throw new Error('Connect a wallet first');
    if ((skr ?? 0) < item.price) throw new Error(`You need ${item.price} SKR — clock in daily to earn it`);
    sig = await send(payIxs(new PublicKey(address), item.price));
  } else if (!g.spendSkrSim(item.price)) {
    throw new Error(`You need ${item.price} SKR — clock in daily to earn it`);
  }

  if (id === 'shield') useGame.getState().addShield();
  if (id === 'rush' && unlocking) useGame.getState().finishUnlock(unlocking.id);
  if (id === 'seeker-chest') {
    const drops = useGame.getState().openNow('magic');
    useUi.getState().showReveal({ title: 'Seeker Chest', tier: 'magic', drops });
  }
  haptic.success();
  return { sig };
}

export function startUnlock(id: string): boolean {
  const c = useGame.getState().startUnlock(id);
  if (!c || c.unlockAt === null) return false;
  void chestReminder(c.id, CHESTS[c.tier].name, c.unlockAt);
  haptic.light();
  return true;
}

export function openChest(id: string): void {
  const c = useGame.getState().chests.find((x) => x.id === id);
  if (!c) return;
  const drops = useGame.getState().openChest(id);
  if (!drops) return;
  haptic.heavy();
  useUi.getState().showReveal({ title: CHESTS[c.tier].name, tier: c.tier, drops });
}

export function prepareMatch(rivalIndex: number, rush = false): PendingMatch {
  const g = useGame.getState();
  const rival = RIVALS[rivalIndex] ?? RIVALS[0];
  const avg = avgDeckLevel(g);
  return {
    rival: rival.name,
    rush,
    tier: Math.min(3, Math.max(0, rivalIndex)),
    player: g.deck.map((t) => ({ ticker: t, mint: BY_TICKER.get(t)!.mint, level: g.cards[t]?.level ?? 1 })),
    bot: rivalDeck(rival, avg),
  };
}

export const WIN_SKR = 3;

/** The arena reported back: record it, pay the chest and SKR, show the result. */
export async function finishMatch(m: PendingMatch, r: { won: boolean; draw: boolean; crowns: [number, number] }): Promise<void> {
  const { record, chest } = useGame.getState().recordBattle({ rival: m.rival, won: r.won, draw: r.draw, crowns: r.crowns });
  if (r.won) haptic.success(); else haptic.warn();
  useUi.getState().showResult({
    rival: m.rival, won: r.won, draw: r.draw, crowns: r.crowns,
    trophyDelta: record.trophyDelta, chest: chest?.tier ?? null, skr: r.won ? WIN_SKR : 0,
  });
  if (r.won) {
    const out = await payOutSkr(WIN_SKR);
    const cur = useUi.getState().result;
    if (cur && out.sig) useUi.getState().showResult({ ...cur, skrSig: out.sig });
  }
}

export { explorerTx };
