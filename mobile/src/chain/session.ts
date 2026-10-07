import { Buffer } from 'buffer';
import {
  PublicKey, SystemProgram, TransactionInstruction, type Connection,
} from '@solana/web3.js';

/**
 * "Approve once, play all week": a session key for daily Clock-Ins.
 *
 * The player's wallet signs ONE transaction:
 *   memo  `mempire:session:v1:<sessionPubkey>:<expiresAt>`   (signed by the owner)
 *   + an optional small SOL transfer to the session key, its fee float.
 * For the next 7 days the app signs each Clock-In with the session key
 * (no wallet prompt): memo `mempire:clockin:v1:day=…:streak=…:owner=<owner>`.
 * A revoke memo `mempire:session:v1:revoke:<sessionPubkey>`, signed by the
 * owner or by the session key itself, ends it early.
 *
 * Nobody has to trust the app about any of this: `validateLedger` accepts a
 * session-signed Clock-In only if the chain shows a link signed by that owner,
 * made before the Clock-In, not expired at the Clock-In, and not revoked
 * before it. The pure rules are unit-tested; `readSessionLedger` gathers the
 * evidence from any RPC (and was run against a local validator).
 *
 * What the session key can do: sign memos and pay fees from its float. It is
 * not a delegate of anything — it holds no tokens and has no authority over
 * the owner's account. The worst a stolen session key can do is post Clock-In
 * memos for 7 days and spend its own float.
 */
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const SESSION_PREFIX = 'mempire:session:v1';
export const SESSION_DAYS = 7;
/** Longest link the ledger accepts (7 days + 1 h of clock slack). */
export const MAX_SESSION_SECS = SESSION_DAYS * 86_400 + 3_600;
/** The session key's fee float: rent-exempt minimum (890 880) + ~20 fees. */
export const FEE_FLOAT_LAMPORTS = 1_000_000;
export const TX_FEE_LAMPORTS = 5_000;

const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const LINK_RE = new RegExp(`mempire:session:v1:(${B58}):(\\d{9,11})(?![\\w:])`);
const REVOKE_RE = new RegExp(`mempire:session:v1:revoke:(${B58})`);
const CLOCKIN_RE = new RegExp(`mempire:clockin:v1:day=(\\d{8}):streak=(\\d+)[^;\\]]*?:owner=(${B58})`);

export const linkMemoText = (session: string, expiresAt: number) => `${SESSION_PREFIX}:${session}:${expiresAt}`;
export const revokeMemoText = (session: string) => `${SESSION_PREFIX}:revoke:${session}`;
export const sessionClockInText = (day: number, streak: number, owner: string, suffix = '') =>
  `mempire:clockin:v1:day=${day}:streak=${streak}${suffix}:owner=${owner}`;

export type SessionMemo =
  | { kind: 'link'; session: string; expiresAt: number }
  | { kind: 'revoke'; session: string }
  | { kind: 'clockin'; day: number; streak: number; owner: string };

/** Parse a memo (raw text, or the RPC's "[len] text; [len] text" form). */
export function parseSessionMemo(memo: string): SessionMemo | null {
  const r = REVOKE_RE.exec(memo);
  if (r) return { kind: 'revoke', session: r[1] };
  const l = LINK_RE.exec(memo);
  if (l) return { kind: 'link', session: l[1], expiresAt: Number(l[2]) };
  const c = CLOCKIN_RE.exec(memo);
  if (c) return { kind: 'clockin', day: Number(c[1]), streak: Number(c[2]), owner: c[3] };
  return null;
}

function memoIx(signer: PublicKey, text: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, 'utf8'),
  });
}

/** The one owner-signed transaction: link memo + fee float. */
export function linkIxs(owner: PublicKey, session: PublicKey, expiresAt: number, floatLamports = FEE_FLOAT_LAMPORTS): TransactionInstruction[] {
  const ixs = [memoIx(owner, linkMemoText(session.toBase58(), expiresAt))];
  if (floatLamports > 0) ixs.push(SystemProgram.transfer({ fromPubkey: owner, toPubkey: session, lamports: floatLamports }));
  return ixs;
}

/** A Clock-In signed (and paid) by the session key, naming its owner. */
export function sessionClockInIx(session: PublicKey, owner: PublicKey, day: number, streak: number, suffix = ''): TransactionInstruction {
  return memoIx(session, sessionClockInText(day, streak, owner.toBase58(), suffix));
}

/**
 * Revoke. Signed by the session key itself, it also returns what is left of
 * the float to the owner (balance minus this transaction's fee), closing the
 * account. Signed by the owner, it is just the memo.
 */
export function revokeIxs(signer: PublicKey, session: PublicKey, sweep?: { to: PublicKey; balance: number }): TransactionInstruction[] {
  const ixs = [memoIx(signer, revokeMemoText(session.toBase58()))];
  if (sweep && sweep.balance > TX_FEE_LAMPORTS) {
    ixs.push(SystemProgram.transfer({ fromPubkey: session, toPubkey: sweep.to, lamports: sweep.balance - TX_FEE_LAMPORTS }));
  }
  return ixs;
}

// ── validation (pure) ───────────────────────────────────────────────────────

/** One memo-bearing transaction, as read back from the chain. */
export interface LedgerEvent {
  sig: string;
  slot: number;
  /** unix seconds (block time) */
  time: number;
  /** base58 keys that signed the transaction */
  signers: string[];
  memo: SessionMemo;
}

export interface SessionLink { session: string; expiresAt: number; linkedAt: number; slot: number; sig: string; revokedAt?: number }
export interface AcceptedClockIn { day: number; streak: number; sig: string; via: 'session'; session: string }
export interface Rejected { sig: string; reason: string }

/** Link `l` landed no later than event `e` (slot order; same slot counts). */
const before = (l: SessionLink, e: LedgerEvent) => l.slot <= e.slot;

/**
 * Apply the session rules for `owner` to everything read from chain.
 * Owner-signed Clock-Ins are not in here: they need no session.
 */
export function validateLedger(owner: string, events: LedgerEvent[]): {
  links: SessionLink[]; accepted: AcceptedClockIn[]; rejected: Rejected[];
} {
  const rejected: Rejected[] = [];
  const links: SessionLink[] = [];
  for (const e of events) {
    if (e.memo.kind !== 'link') continue;
    if (!e.signers.includes(owner)) { rejected.push({ sig: e.sig, reason: 'link not signed by the owner' }); continue; }
    if (e.memo.expiresAt <= e.time) { rejected.push({ sig: e.sig, reason: 'link already expired' }); continue; }
    if (e.memo.expiresAt - e.time > MAX_SESSION_SECS) { rejected.push({ sig: e.sig, reason: 'link longer than 7 days' }); continue; }
    links.push({ session: e.memo.session, expiresAt: e.memo.expiresAt, linkedAt: e.time, slot: e.slot, sig: e.sig });
  }
  // A revoke counts if the owner or that session key signed it.
  for (const e of events) {
    if (e.memo.kind !== 'revoke') continue;
    const session = e.memo.session;
    if (!e.signers.includes(owner) && !e.signers.includes(session)) {
      rejected.push({ sig: e.sig, reason: 'revoke not signed by owner or session' });
      continue;
    }
    for (const l of links) {
      if (l.session === session && before(l, e) && (l.revokedAt === undefined || e.time < l.revokedAt)) l.revokedAt = e.time;
    }
  }
  const accepted: AcceptedClockIn[] = [];
  for (const e of events) {
    if (e.memo.kind !== 'clockin') continue;
    const m = e.memo;
    if (m.owner !== owner) { rejected.push({ sig: e.sig, reason: 'names another owner' }); continue; }
    const ok = links.find((l) => e.signers.includes(l.session)
      && before(l, e)
      && e.time <= l.expiresAt
      && (l.revokedAt === undefined || e.time < l.revokedAt));
    if (!ok) {
      const signedBySomeLink = links.find((l) => e.signers.includes(l.session));
      rejected.push({
        sig: e.sig,
        reason: !signedBySomeLink ? 'no session link from this owner for the signer'
          : e.time > signedBySomeLink.expiresAt ? 'session expired'
          : signedBySomeLink.revokedAt !== undefined && e.time >= signedBySomeLink.revokedAt ? 'session revoked'
          : 'signed before the link',
      });
      continue;
    }
    accepted.push({ day: m.day, streak: m.streak, sig: e.sig, via: 'session', session: ok.session });
  }
  return { links, accepted, rejected };
}

/** The newest link that is live at `now` (unix seconds), if any. */
export function activeLink(links: SessionLink[], now: number): SessionLink | null {
  const live = links.filter((l) => l.revokedAt === undefined && l.expiresAt > now);
  return live.sort((a, b) => b.slot - a.slot)[0] ?? null;
}

// ── reading the evidence from chain ─────────────────────────────────────────

async function eventsFor(conn: Connection, address: string, want: (m: SessionMemo) => boolean, limit: number): Promise<LedgerEvent[]> {
  const sigs = await conn.getSignaturesForAddress(new PublicKey(address), { limit });
  const hits = sigs
    .filter((s) => !s.err && s.memo)
    .map((s) => ({ s, memo: parseSessionMemo(s.memo!) }))
    .filter((x): x is { s: typeof x.s; memo: SessionMemo } => !!x.memo && want(x.memo));
  if (!hits.length) return [];
  // Who signed each one: the signature list alone does not say.
  const txs = await conn.getTransactions(hits.map((h) => h.s.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  const out: LedgerEvent[] = [];
  hits.forEach((h, i) => {
    const tx = txs[i];
    if (!tx || tx.meta?.err) return;
    const msg = tx.transaction.message;
    const keys = msg.staticAccountKeys.map((k) => k.toBase58());
    const signers = keys.slice(0, msg.header.numRequiredSignatures);
    out.push({ sig: h.s.signature, slot: tx.slot, time: tx.blockTime ?? h.s.blockTime ?? 0, signers, memo: h.memo });
  });
  return out;
}

/**
 * Everything the session rules need for `owner`: link/revoke memos from the
 * owner's history, then each linked session key's own history (its
 * Clock-Ins, and a revoke it signed itself).
 */
export async function readSessionLedger(conn: Connection, owner: string, limit = 60) {
  const ownerEvents = await eventsFor(conn, owner, (m) => m.kind === 'link' || m.kind === 'revoke', limit);
  const sessions = [...new Set(ownerEvents.flatMap((e) => (e.memo.kind === 'link' ? [e.memo.session] : [])))].slice(0, 8);
  const sessionEvents = (await Promise.all(sessions.map((s) => eventsFor(conn, s, (m) => m.kind === 'clockin' || m.kind === 'revoke', limit)))).flat();
  const seen = new Set<string>();
  const all = [...ownerEvents, ...sessionEvents].filter((e) => (seen.has(e.sig) ? false : (seen.add(e.sig), true)));
  return validateLedger(owner, all);
}
