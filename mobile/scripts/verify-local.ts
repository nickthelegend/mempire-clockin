/**
 * End-to-end check of the app's on-chain instructions against a LOCAL
 * validator that runs the real spl-token-faucet program, dumped from devnet.
 * Spends nothing, needs no devnet SOL.
 *
 *   bash scripts/verify-local.sh      # starts the validator, runs this, stops it
 *
 * What it proves, with the same instruction builders the app ships:
 *   1. setup-skr-devnet.mjs creates the stand-in mint + faucet correctly
 *   2. a Clock-In transaction (memo + faucet mint) lands and pays SKR
 *   3. the memo is readable back from signature history (readClockIns)
 *   4. a Shop payment (transferChecked to treasury) moves the right amount
 */
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, TransactionMessage, VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { clockInMemo, readClockIns } from '../src/chain/solana';
import { makeEarnIxs, makePayIxs, type SkrConfig } from '../src/chain/skr';

const RPC = process.env.EXPO_PUBLIC_RPC_URL!;
const cfg = JSON.parse(readFileSync(process.env.SKR_CFG!, 'utf8')) as SkrConfig & { treasuryAta: string };
const conn = new Connection(RPC, 'confirmed');
let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures += 1; };

async function send(payer: Keypair, ixs: TransactionInstruction[]): Promise<string> {
  const bh = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey, recentBlockhash: bh.blockhash, instructions: ixs,
  }).compileToV0Message());
  tx.sign([payer]);
  const sig = await conn.sendRawTransaction(tx.serialize());
  const r = await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (r.value.err) throw new Error(JSON.stringify(r.value.err));
  return sig;
}

const skrOf = async (owner: PublicKey) => {
  try {
    const b = await conn.getTokenAccountBalance(getAssociatedTokenAddressSync(new PublicKey(cfg.mint!), owner, true));
    return Number(b.value.uiAmount ?? 0);
  } catch { return 0; }
};

(async () => {
  check(cfg.configured === true && !!cfg.mint, `stand-in mint created (${cfg.mint})`);
  const mintInfo = await conn.getParsedAccountInfo(new PublicKey(cfg.mint!));
  const info = (mintInfo.value?.data as { parsed: { info: { decimals: number; mintAuthority: string } } }).parsed.info;
  check(info.decimals === 6, 'stand-in has 6 decimals, like real SKR');
  check(info.mintAuthority === cfg.faucetPda, 'mint authority is the public faucet PDA (no key in the app)');

  const player = Keypair.generate();
  const sig0 = await conn.requestAirdrop(player.publicKey, LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig0, 'confirmed');

  // Day 1 and day 2 Clock-Ins, exactly as doClockIn builds them.
  const s1 = await send(player, [clockInMemo(player.publicKey, 20261006, 1), ...makeEarnIxs(cfg, player.publicKey, 5)]);
  check(await skrOf(player.publicKey) === 5, `Clock-In #1 landed and minted 5 SKR (${s1.slice(0, 12)}…)`);
  const s2 = await send(player, [clockInMemo(player.publicKey, 20261007, 2), ...makeEarnIxs(cfg, player.publicKey, 10)]);
  check(await skrOf(player.publicKey) === 15, `Clock-In #2 landed and minted 10 more (${s2.slice(0, 12)}…)`);

  const history = await readClockIns(player.publicKey.toBase58());
  check(history.length === 2 && history.some((h) => h.streak === 2 && h.day === 20261007),
    `streak rebuilt from chain memos: ${JSON.stringify(history.map((h) => [h.day, h.streak]))}`);

  // Streak Shield purchase: 15 SKR to the treasury.
  const before = await skrOf(new PublicKey(cfg.treasury!));
  const s3 = await send(player, makePayIxs(cfg, player.publicKey, 15));
  check(await skrOf(player.publicKey) === 0, `Shop payment debited the player (${s3.slice(0, 12)}…)`);
  check(await skrOf(new PublicKey(cfg.treasury!)) - before === 15, 'treasury received 15 SKR via transferChecked');

  // The faucet caps a single request — a forged huge reward must fail.
  let capped = false;
  try { await send(player, makeEarnIxs(cfg, player.publicKey, 1_000_000)); } catch { capped = true; }
  check(capped, 'faucet refuses a request above its cap');

  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
