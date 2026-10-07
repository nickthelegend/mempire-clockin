import { Buffer } from 'buffer';
import {
  Connection, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction,
} from '@solana/web3.js';

/**
 * Devnet, always. The app has no mainnet write path at all; the only mainnet
 * traffic is two read-only lookups for Seeker perks (see seeker.ts).
 */
export const CLUSTER = 'devnet' as const;
export const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
if (/mainnet/i.test(RPC_URL)) throw new Error('Mempire Clock-In is devnet-only');

export const connection = new Connection(RPC_URL, 'confirmed');

/** A local validator (development and the simulator demo); devnet otherwise. */
export const IS_LOCAL = /127\.0\.0\.1|localhost/.test(RPC_URL);
export const CLUSTER_LABEL = IS_LOCAL ? 'localnet' : 'devnet';
const clusterQs = IS_LOCAL ? `cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}` : 'cluster=devnet';
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?${clusterQs}`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?${clusterQs}`;
export const short = (s: string, n = 4) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

export async function getSol(address: string): Promise<number> {
  const lamports = await connection.getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Ask the devnet faucet for SOL. The public faucet rate-limits hard (429s are
 * common), so failure is an expected outcome with a readable message, not a
 * crash.
 */
export async function airdrop(address: string, sol = 0.5): Promise<string> {
  try {
    const sig = await connection.requestAirdrop(new PublicKey(address), Math.round(sol * LAMPORTS_PER_SOL));
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    return sig;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|limit|dry/i.test(msg)) {
      throw new Error('The devnet faucet is rate-limited right now. Try again later or use faucet.solana.com with your address.');
    }
    throw new Error(msg);
  }
}

// ── the on-chain Clock-In ledger ────────────────────────────────────────────

export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const PREFIX = 'mempire:clockin:v1';

/**
 * A Clock-In is a signed memo: `mempire:clockin:v1:day=20261006:streak=4`.
 *
 * The wallet signs it, so the streak is a public, per-address record anyone
 * can rebuild from the chain — not a number in our database. `readStreak`
 * does exactly that.
 */
export function clockInMemo(signer: PublicKey, day: number, streak: number, suffix = ''): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    // `suffix` is the Season War pledge (`:war=1:side=BONK`), when one is set.
    data: Buffer.from(`${PREFIX}:day=${day}:streak=${streak}${suffix}`, 'utf8'),
  });
}

export interface ChainClockIn { day: number; streak: number; sig: string }

/** Rebuild this wallet's Clock-In history from its recent signatures' memos. */
export async function readClockIns(address: string, limit = 60): Promise<ChainClockIn[]> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(address), { limit });
  const out: ChainClockIn[] = [];
  for (const s of sigs) {
    if (s.err || !s.memo) continue;
    const m = /mempire:clockin:v1:day=(\d{8}):streak=(\d+)/.exec(s.memo);
    if (m) out.push({ day: Number(m[1]), streak: Number(m[2]), sig: s.signature });
  }
  return out;
}
