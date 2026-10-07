import { PublicKey } from '@solana/web3.js';
import { clockInMemo, connection, explorerTx, getSol } from '../chain/solana';
import { sessionClockInIx } from '../chain/session';
import { commitChest, resolveChest, rollSeed, seededRand, toHex, type ChestCommit, type ChestProof } from '../chain/fair';
import { readFullLedger, useSession } from '../wallet/sessionKey';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SKR_LIVE, SKR_MINT, earnIxs, payIxs } from '../chain/skr';
import { askPermission, cancel, chestNotificationId, chestReminder, ensureStreakReminder, haptic } from '../notify';
import { sfx } from '../sound';
import { useGame, avgDeckLevel, type Grant } from '../state/game';
import * as Device from 'expo-device';
import { markFtue, useUi, type MatchResult, type PendingMatch, type Renderer } from '../state/ui';
import { MAX_PAYLOAD_CHARS, decodeDuel, encodeDuel, fromB64url, ghostInputs, toB64url, type DuelPayload } from './duel';
import { challengeIxs, resultIxs } from '../chain/duels';
import type { InputEvent } from '../../../app/src/sim/types';
import { short as shortAddr } from '../chain/solana';
import { useWallet } from '../wallet/wallet';
import {
  BY_TICKER, CHESTS, RIVALS, SHOP, dayKey, rivalDeck, type ChestTier, type Drop, type QuestId, type ShopItemId,
} from './rules';
import { buyPassIx, buySkinIx, hasPremium, usePassChain } from '../chain/pass';
import { activeArenaSkin } from './cosmetics';
import { rewardLabel, type Track } from './season';
import { warMemo } from './board';

/**
 * Everything that crosses from the game into the chain, in one place.
 *
 * The rule for every action here: do the on-chain part when the wallet can pay
 * for it, and when it cannot (no devnet SOL, wallet declined, RPC down) still
 * let the game move, record *why* it stayed off-chain, and say so on screen.
 * A Clock-In never fails because the faucet was dry.
 */
const FEE_FLOOR_SOL = 0.00002;

/**
 * Can the wallet pay a network fee? 'unknown' is not 'no': the balance may
 * not have loaded yet, or the balance RPC failed. Unknown → fetch it now (6 s
 * cap), and if it is still unknown, try the transaction anyway and let the
 * chain answer — a Clock-In is once a day, its proof must not be lost to a
 * slow balance read.
 */
async function feeCheck(): Promise<'yes' | 'no' | 'unknown'> {
  const { sol, address } = useWallet.getState();
  if (!address) return 'no';
  if (sol !== null) return sol >= FEE_FLOOR_SOL ? 'yes' : 'no';
  try {
    const fresh = await Promise.race([
      getSol(address),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
    ]);
    useWallet.setState({ sol: fresh });
    return fresh >= FEE_FLOOR_SOL ? 'yes' : 'no';
  } catch {
    return 'unknown';
  }
}
const canPayFees = () => {
  const { sol, address } = useWallet.getState();
  return !!address && sol !== null && sol >= FEE_FLOOR_SOL;
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
  /** Slots were full: the chest is waiting in the inbox. */
  chestQueued: boolean;
  sig?: string;
  /** Who signed it: the wallet (approval) or the session key (no prompt). */
  via?: 'wallet' | 'session';
  offlineReason?: string;
  shieldsUsed: number;
  broke: boolean;
}

/**
 * Make sure the chain's view of the streak has been read and merged before a
 * Clock-In is committed: clocking in first would restart the count at 1 (and,
 * with SOL, sign streak=1 over the public record). Bounded wait.
 */
async function syncChainStreak(): Promise<void> {
  const { address } = useWallet.getState();
  const ledger = useUi.getState().chainLedger;
  if (!address || Array.isArray(ledger)) return; // already read this session
  try {
    const list = await Promise.race([
      readFullLedger(address),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
    ]);
    useUi.getState().setChainLedger(list);
    if (list[0]) useGame.getState().adoptChainStreak(list[0]);
  } catch { /* chain unreachable: the device record stands, retried on next resume */ }
}

export async function doClockIn(seeker: boolean): Promise<ClockInResult | null> {
  let skrOwedFromSession = false;
  await syncChainStreak();
  const game = useGame.getState();
  const preview = game.previewClockIn(seeker);
  if (!preview) return null;
  const { address, send } = useWallet.getState();
  const day = dayKey();

  let sig: string | undefined;
  let offlineReason: string | undefined;
  let via: 'wallet' | 'session' | undefined;
  const streakN = preview.outcome.streak.count;
  const war = warMemo(useGame.getState().warSide);
  // Approve once, play all week: a live session key signs (and pays for)
  // today's Clock-In with no wallet prompt. Any failure falls back to the
  // wallet below, so a Clock-In is never lost to the session.
  const session = useSession.getState();
  if (address && session.usable()) {
    try {
      const owner = new PublicKey(address);
      const ixs = [sessionClockInIx(new PublicKey(session.cur!.session), owner, day, streakN, war)];
      // SKR rides along only if the player's token account exists: creating
      // it would cost the float more than a week of fees.
      if (SKR_LIVE && SKR_MINT && await connection.getAccountInfo(getAssociatedTokenAddressSync(SKR_MINT, owner)).catch(() => null)) {
        ixs.push(earnIxs(owner, preview.reward.skr)[1]);
      }
      sig = await session.sendAsSession(ixs);
      via = 'session';
      if (ixs.length < 2) skrOwedFromSession = true;
    } catch { sig = undefined; }
  }
  const fees = sig ? 'yes' : await feeCheck();
  if (sig) { /* signed by the session key */ } else if (!address) offlineReason = 'no wallet connected';
  else if (fees === 'no') offlineReason = 'no devnet SOL for the network fee';
  else {
    try {
      const owner = new PublicKey(address);
      // One transaction: the signed memo that *is* the Clock-In, plus the
      // day's stand-in SKR minted straight to the player by the public faucet.
      sig = await send([clockInMemo(owner, day, streakN, war), ...earnIxs(owner, preview.reward.skr)]);
      via = 'wallet';
    } catch (e) {
      offlineReason = errText(e);
    }
  }

  const done = useGame.getState().commitClockIn(seeker, { sig, offlineReason }, day);
  if (done) useGame.getState().progressQuest('clockin');
  if (sig && done) {
    const ledger = useUi.getState().chainLedger ?? [];
    useUi.getState().setChainLedger([{ day, streak: done.outcome.streak.count, sig, via }, ...ledger]);
  }
  // A session Clock-In is only "on the ledger" once the session rules accept
  // it from chain: read it back rather than trusting the local write.
  if (sig && done && via === 'session' && address) {
    void readFullLedger(address).then((l) => { if (useWallet.getState().address === address) useUi.getState().setChainLedger(l); }).catch(() => {});
  }
  if (!done) return null;
  // SKR minted in the same transaction when it went through; otherwise owed.
  if (!sig || !SKR_LIVE || skrOwedFromSession) useGame.getState().addSkrSim(done.reward.skr);
  haptic.success();
  sfx('reward');
  // Asked here, not at launch: the first Clock-In is when a reminder means something.
  void askPermission().then((ok) => { if (ok) ensureStreakReminder('done', done.outcome.streak.count); });
  return {
    streak: done.outcome.streak.count,
    skr: done.reward.skr,
    chestTier: done.reward.chest,
    chestStored: !!done.chest?.chest || !done.reward.chest,
    chestQueued: !!done.chest?.queued,
    sig,
    via,
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
  if (id === 'rush' && unlocking) {
    useGame.getState().finishUnlock(unlocking.id);
    cancel(chestNotificationId(useGame.getState().address, unlocking.id));
  }
  if (id === 'seeker-chest') {
    // Bought and opened at once: commit now, reveal when the slot lands (~13 s).
    const chestId = `shop_${Date.now()}`;
    const commit = await commitChest(connection, chestId);
    void revealFair({ title: 'Seeker Chest', tier: 'magic', chestId, commit, apply: (rand) => useGame.getState().openNow('magic', rand) });
  }
  haptic.success();
  return { sig };
}

export function startUnlock(id: string): boolean {
  const c = useGame.getState().startUnlock(id);
  if (!c || c.unlockAt === null) return false;
  void chestReminder(chestNotificationId(useGame.getState().address, c.id), CHESTS[c.tier].name, c.unlockAt);
  haptic.light();
  return true;
}

export function openChest(id: string): void {
  const c = useGame.getState().chests.find((x) => x.id === id);
  if (!c || c.unlockAt === null || c.unlockAt > Date.now()) return;
  haptic.heavy();
  void revealFair({
    title: CHESTS[c.tier].name, tier: c.tier, chestId: id, commit: c.commit ?? null,
    apply: (rand) => {
      const drops = useGame.getState().openChest(id, rand);
      if (drops) cancel(chestNotificationId(useGame.getState().address, id));
      return drops;
    },
  });
}

let opening = false;

/**
 * Provably fair reveal: wait for the committed slot, roll from its
 * blockhash, then apply. No commit (earned offline) or no chain at open
 * time → the device CSPRNG, and the reveal says so instead of showing a proof.
 */
async function revealFair(o: {
  title: string; tier: ChestTier; chestId: string; commit: ChestCommit | null;
  apply: (rand?: () => number) => Drop[] | null;
}): Promise<void> {
  if (opening) return;
  opening = true;
  const ui = useUi.getState();
  const owner = useWallet.getState().address;
  try {
    let proof: ChestProof | null = null;
    let rand: (() => number) | undefined;
    let fairNote: string | undefined;
    if (o.commit && owner) {
      ui.showReveal({ title: o.title, tier: o.tier, drops: [], sealing: { targetSlot: o.commit.targetSlot, left: 0 } });
      const r = await resolveChest(connection, o.commit, {
        timeoutMs: 25_000,
        onWait: (left) => useUi.getState().showReveal({ title: o.title, tier: o.tier, drops: [], sealing: { targetSlot: o.commit!.targetSlot, left } }),
      });
      if (r) {
        const seed = rollSeed(r.blockhash, o.chestId, owner);
        rand = seededRand(seed);
        proof = {
          chestId: o.chestId, owner, targetSlot: o.commit.targetSlot, slot: r.slot, blockhash: r.blockhash,
          seedHex: toHex(seed), owned: Object.keys(useGame.getState().cards).sort(),
        };
      } else fairNote = 'The chain did not answer in time, so this chest was rolled on the device.';
    } else {
      fairNote = 'This chest was earned offline (no slot committed), so it was rolled on the device.';
    }
    const drops = o.apply(rand);
    if (!drops) { useUi.getState().showReveal(null); return; }
    useUi.getState().showReveal({ title: o.title, tier: o.tier, drops, proof, fairNote });
  } finally {
    opening = false;
  }
}

const committing = new Set<string>();
/**
 * Commit every chest in the rail that has no target slot yet. Called when the
 * rail changes: a chest is committed as soon as it is earned (or, if it waited
 * in the inbox, as soon as it reaches a slot) — always before it can be opened.
 */
export async function commitPendingChests(): Promise<void> {
  const g = useGame.getState();
  if (!g.address) return;
  for (const c of g.chests) {
    if (c.commit || committing.has(c.id)) continue;
    committing.add(c.id);
    try {
      const commit = await commitChest(connection, c.id);
      if (commit && useGame.getState().address === g.address) useGame.getState().setChestCommit(c.id, commit);
    } finally {
      committing.delete(c.id);
    }
  }
}

/**
 * Which arena renders a match. Auto = the native 3D arena on a real phone and
 * the web arena on a simulator, where OpenGL ES is a software renderer.
 */
export function resolveRenderer(): Renderer {
  const pref = useUi.getState().rendererPref;
  if (pref === 'native' || pref === 'web') return pref;
  return Device.isDevice ? 'native' : 'web';
}

export function prepareMatch(rivalIndex: number, rush = false, tutorial = false): PendingMatch {
  const g = useGame.getState();
  const rival = RIVALS[rivalIndex] ?? RIVALS[0];
  const avg = avgDeckLevel(g);
  return {
    rival: rival.name,
    rivalIndex: Math.max(0, RIVALS.indexOf(rival)),
    rush,
    tutorial,
    seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
    renderer: resolveRenderer(),
    // Only a skin the chain says this wallet holds; the web arena ignores it.
    skin: activeArenaSkin(),
    tier: Math.min(3, Math.max(0, rivalIndex)),
    player: g.deck.map((t) => ({ ticker: t, mint: BY_TICKER.get(t)!.mint, level: g.cards[t]?.level ?? 1 })),
    bot: rivalDeck(rival, avg),
  };
}

export const WIN_SKR = 3;

/** The arena reported back: record it, pay the chest and SKR, show the result. */
export async function finishMatch(
  m: PendingMatch,
  r: {
    won: boolean; draw: boolean; crowns: [number, number]; plays?: number;
    /** From the native arena: what a duel needs (the web arena has no recording). */
    native?: { finalHash: number; forfeited: boolean; recording: InputEvent[] };
  },
): Promise<void> {
  if (m.duel) { finishDuel(m, r); return; }
  const g = useGame.getState();
  const { record, chest } = g.recordBattle({
    rival: m.rival, won: r.won, draw: r.draw, crowns: r.crowns, renderer: m.renderer, fellBack: !!m.fellBack,
    deck: m.player.map((p) => p.ticker),
  });
  g.progressQuest('deploy', r.plays ?? 0);
  if (r.won) g.progressQuest('win');
  // The guided first battle pays a Golden welcome chest, win or lose.
  let welcome: Grant | null = null;
  if (m.tutorial) {
    welcome = g.grantWelcome();
    markFtue(true);
  }
  if (r.won) { haptic.success(); sfx('victory'); } else { haptic.warn(); sfx('defeat'); }
  useUi.getState().showResult({
    rival: m.rival, won: r.won, draw: r.draw, crowns: r.crowns,
    trophyDelta: record.trophyDelta, chest: chest?.tier ?? null, chestQueued: !!chest?.queued, skr: r.won ? WIN_SKR : 0,
    renderer: m.renderer, fellBack: m.fellBack, plays: r.plays ?? 0,
    tutorial: m.tutorial, welcomeChest: welcome?.tier ?? null, welcomeQueued: !!welcome?.queued,
    rivalIndex: m.rivalIndex, rush: m.rush,
    ghost: r.native && !r.native.forfeited && !m.tutorial ? ghostOf(m, r.native.recording) : undefined,
  });
  if (r.won) {
    const out = await payOutSkr(WIN_SKR);
    const cur = useUi.getState().result;
    if (cur && out.sig) useUi.getState().showResult({ ...cur, skrSig: out.sig });
  }
}

// ── Ghost Duels ─────────────────────────────────────────────────────────────

const duelPayloadOf = (m: PendingMatch, evs: InputEvent[]) => ({
  seed: m.seed >>> 0, rush: m.rush,
  deck: m.player.map((p) => ({ ticker: p.ticker, level: p.level })),
  inputs: evs.map(({ tick, deckIndex, x, y }) => ({ tick, deckIndex, x, y })),
});

/** This match as a shareable ghost, if it fits one memo. */
function ghostOf(m: PendingMatch, evs: InputEvent[]): string | undefined {
  if (!evs.length) return undefined;
  try {
    const b64 = toB64url(encodeDuel(duelPayloadOf(m, evs)));
    return b64.length <= MAX_PAYLOAD_CHARS ? b64 : undefined;
  } catch { return undefined; }
}

function finishDuel(m: PendingMatch, r: Parameters<typeof finishMatch>[1]): void {
  const d = m.duel!;
  useGame.getState().progressQuest('deploy', r.plays ?? 0);
  if (r.won) { haptic.success(); sfx('victory'); } else { haptic.warn(); sfx('defeat'); }
  const mine = r.native ? toB64url(encodeDuel(duelPayloadOf(m, r.native.recording))) : '';
  useUi.getState().showResult({
    rival: m.rival, won: r.won, draw: r.draw, crowns: r.crowns, trophyDelta: 0, chest: null, skr: 0,
    renderer: m.renderer, plays: r.plays ?? 0, rivalIndex: m.rivalIndex, rush: m.rush,
    duel: r.native && !r.native.forfeited ? {
      challengeSig: d.challengeSig, challenger: d.challenger,
      winner: r.won ? 'o' : r.draw ? 'd' : 'c', stateHash: r.native.finalHash >>> 0, mine, theirs: d.payload,
    } : undefined,
  });
}

/** Set up a duel against a challenge's ghost: the player fights seat 1, natively. */
export function prepareDuel(c: { sig: string | null; challenger: string; payload: DuelPayload; payloadB64: string }): PendingMatch {
  const g = useGame.getState();
  const p = c.payload;
  return {
    rival: `${shortAddr(c.challenger)}'s ghost`,
    rivalIndex: 1,
    rush: p.rush,
    seed: p.seed >>> 0,
    renderer: 'native', // the replay lives in the native sim loop
    tier: 1,
    player: g.deck.map((t) => ({ ticker: t, mint: BY_TICKER.get(t)!.mint, level: g.cards[t]?.level ?? 1 })),
    bot: p.deck.map((cd) => ({ ticker: cd.ticker, mint: BY_TICKER.get(cd.ticker)!.mint, level: cd.level })),
    duel: { challengeSig: c.sig, challenger: c.challenger, payload: c.payloadB64, ghost: ghostInputs(p, 0) },
  };
}

/** Post a challenge on chain (one approval). Returns the challenge signature. */
export async function postChallenge(ghost: string): Promise<string> {
  const { address, send } = useWallet.getState();
  if (!address) throw new Error('Connect a wallet first');
  const bytes = fromB64url(ghost);
  const p = decodeDuel(bytes);
  return send(challengeIxs(new PublicKey(address), bytes, p.seed));
}

/** Post a duel result on chain: winner, state hash, and the player's own deploys for re-simulation. */
export async function postDuelResult(d: NonNullable<MatchResult['duel']>): Promise<string> {
  const { address, send } = useWallet.getState();
  if (!address) throw new Error('Connect a wallet first');
  if (!d.challengeSig) throw new Error('This ghost came from a link with no on-chain challenge, so there is nothing to answer on chain.');
  return send(resultIxs(new PublicKey(address), d.challengeSig, d.winner, d.stateHash, fromB64url(d.mine)));
}

/** Claim a finished daily quest; the SKR goes on-chain when the wallet can pay the fee. */
export async function claimQuest(id: QuestId): Promise<{ skr: number; sig?: string; bonus: Grant | null }> {
  const skr = useGame.getState().claimQuest(id);
  if (!skr) return { skr: 0, bonus: null };
  haptic.success();
  sfx('coin');
  const out = await payOutSkr(skr);
  const bonus = useGame.getState().claimQuestBonus();
  if (bonus) sfx('reward');
  return { skr, sig: out.sig, bonus };
}

/** A shareable challenge: deep link into the app, web fallback for everyone else. */
export function challengeMessage(rivalIndex: number, rush: boolean, outcome?: { won: boolean; crowns: [number, number] }): string {
  const rival = RIVALS[rivalIndex] ?? RIVALS[0];
  const link = `mempire://battle?rival=${rivalIndex}${rush ? '&rush=1' : ''}`;
  const brag = outcome
    ? `I just ${outcome.won ? 'beat' : 'took on'} ${rival.name.replace(' (AI)', '')} ${outcome.crowns[0]}-${outcome.crowns[1]} in Mempire.`
    : `Mempire: every coin is a fighter.`;
  return `${brag} Can you do better?\n\nIn the app: ${link}\nNo app yet? Play in your browser: https://play.mempire.fun`;
}

export { explorerTx };

// ── Season Pass and skins (mempire_pass, Token-2022) ───────────────────────

/**
 * Buy this season's soulbound pass: one transaction, one program instruction
 * that pays SKR to the treasury vault and mints the pass to this wallet.
 * MWA on Android (the wallet approves), the dev wallet on iOS / emulators.
 */
export async function buySeasonPass(): Promise<string> {
  const { address, send } = useWallet.getState();
  const pc = usePassChain.getState();
  if (!address) throw new Error('Connect a wallet first');
  if (pc.status !== 'live' || !pc.chain?.season) throw new Error('The on-chain pass is not available on this network yet');
  if (hasPremium(pc)) throw new Error('This wallet already holds the pass');
  if ((pc.skr ?? 0) < pc.chain.season.priceSkr) throw new Error(`You need ${pc.chain.season.priceSkr} SKR on-chain for the pass`);
  const sig = await send([buyPassIx(new PublicKey(address), pc.chain)]);
  haptic.success();
  sfx('chest');
  await usePassChain.getState().refresh(address);
  return sig;
}

export async function buySkin(skinId: number): Promise<string> {
  const { address, send } = useWallet.getState();
  const pc = usePassChain.getState();
  if (!address) throw new Error('Connect a wallet first');
  const item = pc.chain?.skins[skinId];
  if (pc.status !== 'live' || !pc.chain || !item) throw new Error('On-chain skins are not available on this network yet');
  if ((pc.skr ?? 0) < item.priceSkr) throw new Error(`You need ${item.priceSkr} SKR on-chain for this skin`);
  const sig = await send([buySkinIx(skinId, new PublicKey(address), pc.chain)]);
  haptic.success();
  await usePassChain.getState().refresh(address);
  return sig;
}

/** Claim a pass tier. Premium is checked against the live chain read. */
export function claimPassTier(n: number, track: Track): string | null {
  const premium = hasPremium(usePassChain.getState());
  const out = useGame.getState().claimPassTier(n, track, premium);
  if (!out) return null;
  haptic.success();
  sfx('chest');
  const label = rewardLabel(out.reward);
  if (out.chest?.queued) return `${label}: slots full, it is waiting and moves in when you open a chest`;
  return label;
}
