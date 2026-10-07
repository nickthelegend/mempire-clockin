import { Buffer } from 'buffer';
import {
  Keypair, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction,
} from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { connection, readClockIns, type ChainClockIn } from '../chain/solana';
import {
  FEE_FLOAT_LAMPORTS, SESSION_DAYS, TX_FEE_LAMPORTS, activeLink, linkIxs, readSessionLedger, revokeIxs,
  type SessionLink,
} from '../chain/session';
import { useWallet } from './wallet';

/**
 * The session key on this phone: a keypair in SecureStore (the OS keystore),
 * linked to the connected wallet by one owner-signed transaction. See
 * chain/session.ts for the rules and why it is safe to hold.
 */
interface Stored {
  owner: string;
  session: string;
  secret: string; // base64, SecureStore only
  expiresAt: number; // unix seconds
  linkSig: string;
  createdAt: number;
}
const keyFor = (owner: string) => `mempire.session.v1.${owner}`;

export type SessionView = Omit<Stored, 'secret'>;

interface SessionState {
  cur: SessionView | null;
  /** Session key balance in lamports (its fee float). */
  lamports: number | null;
  /** What the chain says (null = not read yet). */
  chain: { live: SessionLink | null; accepted: number; rejected: number } | null;
  busy: boolean;
  load: (owner: string | null) => Promise<void>;
  /** The one wallet approval: link a fresh session key for 7 days. */
  enable: () => Promise<string>;
  /** End it: memo + sweep the float back (no prompt), or owner-signed if the float is gone. */
  revoke: () => Promise<string>;
  /** Usable right now for a Clock-In? */
  usable: () => boolean;
  /** Sign and send with the session key as fee payer and only signer. */
  sendAsSession: (ixs: TransactionInstruction[]) => Promise<string>;
  refreshBalance: () => Promise<void>;
}

let secretCache: { session: string; kp: Keypair } | null = null;

async function keypairFor(owner: string): Promise<Keypair | null> {
  const raw = await SecureStore.getItemAsync(keyFor(owner));
  if (!raw) return null;
  const s = JSON.parse(raw) as Stored;
  if (secretCache?.session === s.session) return secretCache.kp;
  const kp = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(s.secret, 'base64')));
  secretCache = { session: s.session, kp };
  return kp;
}

const nowSec = () => Math.floor(Date.now() / 1000);

export const useSession = create<SessionState>((set, get) => ({
  cur: null,
  lamports: null,
  chain: null,
  busy: false,

  load: async (owner) => {
    secretCache = null;
    if (!owner) { set({ cur: null, lamports: null, chain: null }); return; }
    try {
      const raw = await SecureStore.getItemAsync(keyFor(owner));
      if (!raw) { set({ cur: null, lamports: null }); return; }
      const { secret: _secret, ...view } = JSON.parse(raw) as Stored;
      set({ cur: view });
      void get().refreshBalance();
    } catch {
      set({ cur: null });
    }
  },

  refreshBalance: async () => {
    const c = get().cur;
    if (!c) return;
    try {
      const lamports = await connection.getBalance(new PublicKey(c.session));
      if (get().cur?.session === c.session) set({ lamports });
    } catch { /* keep the last value */ }
  },

  usable: () => {
    const { cur, lamports } = get();
    const owner = useWallet.getState().address;
    return !!cur && cur.owner === owner && cur.expiresAt > nowSec() + 30
      && (lamports === null || lamports >= 890_880 + TX_FEE_LAMPORTS);
  },

  enable: async () => {
    const { address, send } = useWallet.getState();
    if (!address) throw new Error('Connect a wallet first');
    set({ busy: true });
    try {
      const kp = Keypair.generate();
      const expiresAt = nowSec() + SESSION_DAYS * 86_400;
      // The ONE approval: the wallet signs the link memo and the fee float.
      const linkSig = await send(linkIxs(new PublicKey(address), kp.publicKey, expiresAt));
      const stored: Stored = {
        owner: address, session: kp.publicKey.toBase58(), secret: Buffer.from(kp.secretKey).toString('base64'),
        expiresAt, linkSig, createdAt: Date.now(),
      };
      await SecureStore.setItemAsync(keyFor(address), JSON.stringify(stored));
      secretCache = { session: stored.session, kp };
      const { secret: _secret, ...view } = stored;
      set({ cur: view, lamports: FEE_FLOAT_LAMPORTS, chain: { live: { session: view.session, expiresAt, linkedAt: nowSec(), slot: 0, sig: linkSig }, accepted: get().chain?.accepted ?? 0, rejected: get().chain?.rejected ?? 0 } });
      return linkSig;
    } finally {
      set({ busy: false });
    }
  },

  revoke: async () => {
    const c = get().cur;
    const { address, send } = useWallet.getState();
    if (!c || !address) throw new Error('No session to revoke');
    set({ busy: true });
    try {
      await get().refreshBalance();
      const lamports = get().lamports ?? 0;
      let sig: string;
      if (lamports >= 2 * TX_FEE_LAMPORTS) {
        // No wallet prompt: the session key revokes itself and returns its float.
        sig = await get().sendAsSession(revokeIxs(new PublicKey(c.session), new PublicKey(c.session), { to: new PublicKey(address), balance: lamports }));
      } else {
        sig = await send(revokeIxs(new PublicKey(address), new PublicKey(c.session)));
      }
      await SecureStore.deleteItemAsync(keyFor(address));
      secretCache = null;
      set({ cur: null, lamports: null, chain: get().chain ? { ...get().chain!, live: null } : null });
      return sig;
    } finally {
      set({ busy: false });
    }
  },

  sendAsSession: async (ixs) => {
    const c = get().cur;
    if (!c) throw new Error('No session key');
    const kp = await keypairFor(c.owner);
    if (!kp || kp.publicKey.toBase58() !== c.session) throw new Error('Session key missing from the keystore');
    const { context: { slot: minContextSlot }, value: bh } = await connection.getLatestBlockhashAndContext();
    const tx = new VersionedTransaction(new TransactionMessage({
      payerKey: kp.publicKey, recentBlockhash: bh.blockhash, instructions: ixs,
    }).compileToV0Message());
    tx.sign([kp]);
    const sig = await connection.sendRawTransaction(tx.serialize(), { minContextSlot });
    const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
    void get().refreshBalance();
    return sig;
  },
}));

export type LedgerEntry = ChainClockIn & { via?: 'wallet' | 'session' };

/**
 * The full Clock-In ledger for `owner`: their own signed memos, plus the
 * session-signed ones that pass the session rules (link signed by the owner,
 * not expired, not revoked). Newest first.
 */
export async function readFullLedger(owner: string): Promise<LedgerEntry[]> {
  const [own, ses] = await Promise.all([
    readClockIns(owner),
    readSessionLedger(connection, owner).catch(() => null),
  ]);
  const out: LedgerEntry[] = own.map((c) => ({ ...c, via: 'wallet' as const }));
  if (ses) {
    out.push(...ses.accepted.map((a) => ({ day: a.day, streak: a.streak, sig: a.sig, via: 'session' as const })));
    if (useWallet.getState().address === owner) {
      useSession.setState({ chain: { live: activeLink(ses.links, nowSec()), accepted: ses.accepted.length, rejected: ses.rejected.length } });
    }
  }
  return out.sort((a, b) => b.day - a.day || b.streak - a.streak);
}
