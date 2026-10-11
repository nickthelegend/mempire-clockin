/** Audit setup: mint stand-in SKR from the public faucet to <owner>, fee paid by <payer keypair>. Same faucet instruction the app uses. */
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { makeEarnIxs, type SkrConfig } from '../src/chain/skr';
import cfg from '../src/data/skr-devnet.json';
const conn = new Connection(process.env.EXPO_PUBLIC_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
(async () => {
  const [kpPath, owner, amt] = process.argv.slice(2);
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(kpPath, 'utf8'))));
  const o = new PublicKey(owner); const mint = new PublicKey((cfg as SkrConfig).mint!);
  const ixs = makeEarnIxs(cfg as SkrConfig, o, Number(amt));
  ixs[0] = createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, getAssociatedTokenAddressSync(mint, o), o, mint);
  console.log(await sendAndConfirmTransaction(conn, new Transaction().add(...ixs), [payer]));
})();
