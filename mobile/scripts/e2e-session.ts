/**
 * Audit: the session delegate end to end on devnet, with the app's own
 * instruction builders (the same calls the app makes), for a fresh owner.
 *
 *   npx tsx scripts/e2e-session.ts <payer.json> <owner-out.json> [BONK|POPCAT]
 *
 * 1. owner: create_session + link memo + fee float + WAR_REF   (the app's "Approve once")
 * 2. session key: clock_in(via session, war side) + session memo + WAR_REF (the app's no-prompt Clock-In)
 * 3. session key: revoke_session + revoke memo + float sweep + WAR_REF  (the app's "Turn off")
 * Prints every signature and the on-chain state after each step. The owner key
 * is written to <owner-out.json> (keep it out of the repo).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, type TransactionInstruction } from '@solana/web3.js';
import { clockInIx, createSessionIx, readClockState, readSessionRecord, revokeSessionIx, WAR_CODES } from '../src/chain/clockin';
import { linkIxs, revokeIxs, sessionClockInIx } from '../src/chain/session';
import { WAR_REF, refIx } from '../src/chain/refs';
import { warMemo } from '../src/game/board';

const [payerPath, ownerOut, sideArg] = process.argv.slice(2);
const side = (sideArg === 'POPCAT' ? 'POPCAT' : 'BONK') as 'BONK' | 'POPCAT';
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(payerPath, 'utf8'))));
const owner = Keypair.generate();
const session = Keypair.generate();
writeFileSync(ownerOut, JSON.stringify(Array.from(owner.secretKey)), { mode: 0o600 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      const tx = new Transaction().add(...ixs);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash; tx.feePayer = signers[0].publicKey;
      tx.sign(...signers);
      const sig = await conn.sendRawTransaction(tx.serialize());
      const c = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      if (c.value.err) throw new Error(`${sig} failed: ${JSON.stringify(c.value.err)}`);
      return sig;
    } catch (e) {
      if (i < 3 && /429|Too many/i.test(String(e))) { await sleep(60_000 * 2 ** i); continue; }
      throw e;
    }
  }
}
const link = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

(async () => {
  console.log(`owner ${owner.publicKey.toBase58()} · session ${session.publicKey.toBase58()} · side ${side}`);
  const fund = await send([SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: owner.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL })], [payer]);
  console.log(`fund   ${fund}\n       ${link(fund)}`);
  await sleep(1500);

  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86_400;
  const a = await send([createSessionIx(owner.publicKey, session.publicKey, expiresAt), ...linkIxs(owner.publicKey, session.publicKey, expiresAt), refIx(owner.publicKey, WAR_REF)], [owner]);
  console.log(`create_session ${a}\n       ${link(a)}`);
  await sleep(1500);
  console.log(`       SessionRecord: ${JSON.stringify(await readSessionRecord(conn, owner.publicKey.toBase58(), session.publicKey.toBase58()))}`);

  const now = new Date();
  const day = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const b = await send([sessionClockInIx(session.publicKey, owner.publicKey, day, 1, warMemo(side)), refIx(session.publicKey, WAR_REF), clockInIx(session.publicKey, owner.publicKey, true, day, 1, WAR_CODES[side])], [session]);
  console.log(`clock_in (session-signed, war ${side}) ${b}\n       ${link(b)}`);
  await sleep(1500);
  console.log(`       ClockInState: ${JSON.stringify(await readClockState(conn, owner.publicKey.toBase58()))}`);

  const bal = await conn.getBalance(session.publicKey);
  const c = await send([revokeSessionIx(session.publicKey, owner.publicKey, session.publicKey), ...revokeIxs(session.publicKey, session.publicKey, { to: owner.publicKey, balance: bal }), refIx(session.publicKey, WAR_REF)], [session]);
  console.log(`revoke_session ${c}\n       ${link(c)}`);
  await sleep(1500);
  console.log(`       SessionRecord after revoke: ${JSON.stringify(await readSessionRecord(conn, owner.publicKey.toBase58(), session.publicKey.toBase58()))}`);
})().catch((e) => { console.error(String(e)); process.exit(1); });
