/**
 * Audit helper: exercise a Solana Action (Blink) end to end on devnet.
 *
 *   npx tsx scripts/e2e-blink.ts <action url> <keypair.json> [--send]
 *
 * POSTs { account } to the Action, decodes the returned transaction, checks the
 * fee payer, simulates it, and with --send signs it with the keypair and lands
 * it on devnet (prints the signature). Never prints key material.
 */
import { readFileSync } from 'node:fs';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';

const [url, kpPath, flag] = process.argv.slice(2);
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(kpPath, 'utf8'))));
const conn = new Connection(process.env.EXPO_PUBLIC_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');

(async () => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: kp.publicKey.toBase58() }) });
  const body = await res.json() as { transaction?: string; message?: string; error?: unknown };
  console.log(`POST ${res.status} · message: ${body.message ?? '-'}${body.error ? ` · error ${JSON.stringify(body.error)}` : ''}`);
  if (!body.transaction) process.exit(1);
  const tx = VersionedTransaction.deserialize(Buffer.from(body.transaction, 'base64'));
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  console.log(`fee payer ${keys[0]} (${keys[0] === kp.publicKey.toBase58() ? 'the account' : 'NOT the account'}) · ${tx.message.compiledInstructions.length} ix · programs ${[...new Set(tx.message.compiledInstructions.map((i) => keys[i.programIdIndex]))].join(', ')}`);
  const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  console.log(`simulate: ${sim.value.err ? `ERR ${JSON.stringify(sim.value.err)}` : 'ok'} · ${sim.value.unitsConsumed} CU`);
  (sim.value.logs ?? []).filter((l) => /Memo|Error|failed/i.test(l)).slice(0, 4).forEach((l) => console.log(`  ${l.slice(0, 200)}`));
  if (flag !== '--send' || sim.value.err) return;
  tx.sign([kp]);
  const sig = await conn.sendTransaction(tx, { maxRetries: 3 });
  const bh = tx.message.recentBlockhash;
  const { lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const c = await conn.confirmTransaction({ signature: sig, blockhash: bh, lastValidBlockHeight }, 'confirmed');
  console.log(`sent ${sig} · ${c.value.err ? `ERR ${JSON.stringify(c.value.err)}` : 'confirmed'}\nhttps://explorer.solana.com/tx/${sig}?cluster=devnet`);
})().catch((e) => { console.error(String(e)); process.exit(1); });
