import type { Connection } from '@solana/web3.js';
import { WAR_REF, memoTexts, signersOf } from './refs';
import { parseSessionMemo, validateLedger, type LedgerEvent } from './session';

/**
 * The global Season War tally and streak board, computed from chain on the
 * phone. Every Clock-In (and every session link / revoke) carries WAR_REF, so
 * `getSignaturesForAddress(WAR_REF)` lists them all; this module parses those
 * transactions and applies the same rules the personal ledger uses:
 *
 *  - a wallet-signed Clock-In counts for its signer;
 *  - a session-signed Clock-In counts for the owner it names only if that
 *    owner's session link (also in the WAR_REF history) was signed by the
 *    owner, came first, had not expired and was not revoked (validateLedger);
 *  - the streak shown is the run of consecutive game days *visible on chain*,
 *    not the number a client wrote in its memo (that is shown as "claimed").
 *
 * Pure parts (`toEvents`, `computeBoard`) are unit-tested with fixtures.
 */
export interface RawEvent { sig: string; slot: number; time: number; signers: string[]; memos: string[] }

export interface ClockInEvent { sig: string; slot: number; wallet: string; day: number; claimed: number; side: string | null; via: 'wallet' | 'session' }

const CLOCKIN = /mempire:clockin:v1:day=(\d{8}):streak=(\d+)((?::[a-z]+=[A-Za-z0-9]+)*)/;
const sideOf = (text: string) => /:war=1:side=([A-Z0-9]+)/.exec(text)?.[1] ?? null;

/** Parse raw WAR_REF transactions into validated Clock-Ins. */
export function toEvents(raw: RawEvent[]): ClockInEvent[] {
  const out: ClockInEvent[] = [];
  const sessionEvents: LedgerEvent[] = [];
  for (const r of raw) {
    for (const text of r.memos) {
      const sm = parseSessionMemo(text);
      if (sm) {
        sessionEvents.push({ sig: r.sig, slot: r.slot, time: r.time, signers: r.signers, memo: sm });
        continue;
      }
      const m = CLOCKIN.exec(text);
      if (!m) continue;
      out.push({ sig: r.sig, slot: r.slot, wallet: r.signers[0], day: Number(m[1]), claimed: Number(m[2]), side: sideOf(text), via: 'wallet' });
    }
  }
  // Session Clock-Ins: validated per named owner, with every link and revoke in view.
  const owners = new Set(sessionEvents.flatMap((e) => (e.memo.kind === 'clockin' ? [e.memo.owner] : [])));
  for (const owner of owners) {
    const { accepted } = validateLedger(owner, sessionEvents);
    for (const a of accepted) {
      const r = raw.find((x) => x.sig === a.sig)!;
      const text = r.memos.find((t) => CLOCKIN.test(t)) ?? '';
      out.push({ sig: a.sig, slot: r.slot, wallet: owner, day: a.day, claimed: a.streak, side: sideOf(text), via: 'session' });
    }
  }
  return out;
}

const dayNum = (k: number) => Date.UTC(Math.floor(k / 10000), Math.floor((k % 10000) / 100) - 1, k % 100) / 86_400_000;

export interface StreakRow { wallet: string; streak: number; claimed: number; lastDay: number; days: number; side: string | null }
export interface WarBoard {
  sides: Record<string, { wallets: number; clockIns: number }>;
  streaks: StreakRow[];
  wallets: number;
  clockIns: number;
}

/**
 * Tally: each wallet's side is its latest pledge; "pledged Clock-Ins" counts
 * one per wallet per day. Streak: consecutive days ending at the wallet's
 * latest Clock-In, alive only if that was today or yesterday (UTC game day).
 */
export function computeBoard(events: ClockInEvent[], today: number, sides: readonly string[]): WarBoard {
  const byWallet = new Map<string, ClockInEvent[]>();
  for (const e of events) {
    const l = byWallet.get(e.wallet) ?? [];
    l.push(e);
    byWallet.set(e.wallet, l);
  }
  const tally: WarBoard['sides'] = Object.fromEntries(sides.map((s) => [s, { wallets: 0, clockIns: 0 }]));
  const streaks: StreakRow[] = [];
  let clockIns = 0;
  for (const [wallet, evs] of byWallet) {
    const perDay = new Map<number, ClockInEvent>();
    for (const e of evs) {
      const cur = perDay.get(e.day);
      if (!cur || e.slot > cur.slot) perDay.set(e.day, e);
    }
    clockIns += perDay.size;
    const days = [...perDay.keys()].sort((a, b) => b - a);
    for (const d of days) {
      const s = perDay.get(d)!.side;
      if (s && tally[s]) tally[s].clockIns += 1;
    }
    const latestPledge = [...perDay.values()].filter((e) => e.side).sort((a, b) => b.slot - a.slot)[0]?.side ?? null;
    if (latestPledge && tally[latestPledge]) tally[latestPledge].wallets += 1;
    let run = 1;
    for (let i = 1; i < days.length && dayNum(days[i - 1]) - dayNum(days[i]) === 1; i++) run += 1;
    const alive = dayNum(today) - dayNum(days[0]) <= 1;
    streaks.push({
      wallet, streak: alive ? run : 0, claimed: perDay.get(days[0])!.claimed, lastDay: days[0], days: days.length, side: latestPledge,
    });
  }
  streaks.sort((a, b) => b.streak - a.streak || b.days - a.days || b.lastDay - a.lastDay || a.wallet.localeCompare(b.wallet));
  return { sides: tally, streaks, wallets: byWallet.size, clockIns };
}

// ── reading ─────────────────────────────────────────────────────────────────

/** One page of WAR_REF history, newest first. `until` stops at an already-seen signature. */
export async function readWarPage(conn: Connection, opts: { before?: string; until?: string; limit?: number } = {}): Promise<{ raw: RawEvent[]; oldest?: string; newest?: string; full: boolean }> {
  const limit = opts.limit ?? 100;
  const sigs = await conn.getSignaturesForAddress(WAR_REF, { limit, before: opts.before, until: opts.until });
  const ok = sigs.filter((s) => !s.err);
  const raw: RawEvent[] = [];
  for (let i = 0; i < ok.length; i += 25) {
    const chunk = ok.slice(i, i + 25);
    const txs = await conn.getTransactions(chunk.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    txs.forEach((tx, j) => {
      if (!tx || tx.meta?.err) return;
      raw.push({ sig: chunk[j].signature, slot: tx.slot, time: tx.blockTime ?? 0, signers: signersOf(tx), memos: memoTexts(tx) });
    });
  }
  return { raw, oldest: sigs[sigs.length - 1]?.signature, newest: sigs[0]?.signature, full: sigs.length === limit };
}
