/**
 * Audit: negative checks against REAL devnet accounts, by simulation (no keys
 * needed, nothing lands): a soulbound pass transfer, a second pass purchase,
 * a skin bought twice, a Clock-In for a day already recorded, a stranger's
 * clock_in, and a stale blockhash.
 */
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { buyPassIx, buySkinIx, passMint, readPassChain, SEASON_ID } from '../src/chain/pass';
import { clockInIx } from '../src/chain/clockin';
import { dayKey } from '../src/game/rules';
import { friendlyTxError, SimulationError } from '../src/chain/send';
const conn = new Connection(process.env.EXPO_PUBLIC_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
const owner = new PublicKey(process.argv[2]);
async function sim(name: string, payer: PublicKey, ixs: TransactionInstruction[], blockhash?: string) {
  const bh = blockhash ?? (await conn.getLatestBlockhash()).blockhash;
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: bh, instructions: ixs }).compileToV0Message());
  const r = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: !blockhash, commitment: 'confirmed' });
  const msg = r.value.err ? friendlyTxError(new SimulationError(r.value.err, r.value.logs ?? [])).message : 'NO ERROR';
  const log = (r.value.logs ?? []).filter((l) => /Error|error|failed|already in use/i.test(l)).slice(-2).join(' | ');
  console.log(`${r.value.err ? 'REJECTED' : 'ACCEPTED'}  ${name}\n   err ${JSON.stringify(r.value.err)}\n   app shows: "${msg}"\n   log: ${log}`);
  await new Promise((x) => setTimeout(x, 700));
}
(async () => {
  const chain = (await readPassChain())!;
  const mint = passMint(SEASON_ID);
  const from = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const friend = Keypair.generate().publicKey;
  const to = getAssociatedTokenAddressSync(mint, friend, false, TOKEN_2022_PROGRAM_ID);
  const { createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token');
  await sim('soulbound pass transfer to another wallet', owner, [
    createAssociatedTokenAccountIdempotentInstruction(owner, to, friend, mint, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(from, mint, to, owner, 1, 0, [], TOKEN_2022_PROGRAM_ID),
  ]);
  await sim('buy the Season Pass a second time', owner, [buyPassIx(owner, chain)]);
  if (process.argv[3]) await sim(`buy skin #${process.argv[3]} a second time`, owner, [buySkinIx(Number(process.argv[3]), owner, chain)]);
  await sim('clock_in again on a recorded day (owner)', owner, [clockInIx(owner, owner, false, dayKey(), 2, 0)]);
  const stranger = Keypair.generate().publicKey;
  await sim('clock_in for the owner signed by a stranger', stranger, [clockInIx(stranger, owner, false, dayKey(), 1, 0)]);
  await sim('stale blockhash (never produced)', owner, [buyPassIx(owner, chain)], Keypair.generate().publicKey.toBase58());
})();
