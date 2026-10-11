/**
 * The on-chain session delegate, Clock-In PDA and chest commits, against a
 * LOCAL validator with mempire_pass loaded, using the exact builders and
 * readers the app ships.
 *
 *   bash scripts/verify-onchain.sh
 */
import {
  Connection, Keypair, LAMPORTS_PER_SOL, TransactionMessage, VersionedTransaction, type TransactionInstruction,
} from '@solana/web3.js';
import {
  WAR_CODES, clockInIx, createSessionIx, programLive, readClockState, readSessionRecord, revokeSessionIx,
} from '../src/chain/clockin';
import { linkIxs, revokeIxs, sessionClockInIx } from '../src/chain/session';
import { memoIx } from '../src/chain/refs';
import * as fair from '../src/chain/fair';
import { dayKey } from '../src/game/rules';

const conn = new Connection(process.env.EXPO_PUBLIC_RPC_URL!, 'confirmed');
let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures += 1; };
const now = () => Math.floor(Date.now() / 1000);

async function send(payer: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = []): Promise<{ sig: string; slot: number }> {
  const bh = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: bh.blockhash, instructions: ixs }).compileToV0Message());
  tx.sign([payer, ...extra]);
  const sig = await conn.sendRawTransaction(tx.serialize());
  const r = await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (r.value.err) throw new Error(JSON.stringify(r.value.err));
  return { sig, slot: r.context.slot };
}
const fails = async (p: Promise<unknown>) => { try { await p; return false; } catch { return true; } };
const fund = async (k: Keypair, sol: number) => { await conn.confirmTransaction(await conn.requestAirdrop(k.publicKey, sol * LAMPORTS_PER_SOL), 'confirmed'); };

async function main() {
  check(await programLive(conn), 'mempire_pass is live on the validator');
  const owner = Keypair.generate();
  const session = Keypair.generate();
  const stranger = Keypair.generate();
  await fund(owner, 1); await fund(stranger, 1);
  const o = owner.publicKey.toBase58();
  const day = dayKey();

  console.log('\n— session delegate —');
  const exp = now() + 7 * 86400;
  const link = await send(owner, [createSessionIx(owner.publicKey, session.publicKey, exp), ...linkIxs(owner.publicKey, session.publicKey, exp)]);
  const rec = await readSessionRecord(conn, o, session.publicKey.toBase58());
  check(rec?.expiresAt === exp, `create_session: SessionRecord PDA with expiry ${exp} (one owner signature, ${link.sig.slice(0, 10)}…)`);
  check(await conn.getBalance(session.publicKey) > 0, 'session key received its fee float in the same transaction');

  console.log('\n— Clock-In by the session key —');
  const ci = await send(session, [sessionClockInIx(session.publicKey, owner.publicKey, day, 1), clockInIx(session.publicKey, owner.publicKey, true, day, 1, WAR_CODES.BONK)]);
  const st = await readClockState(conn, o);
  check(!!st && st.lastDay === day && st.streak === 1 && st.total === 1 && st.warSide === 1, `clock_in by session key: ClockInState day ${st?.lastDay}, streak ${st?.streak}, side BONK (${ci.sig.slice(0, 10)}…)`);
  check(await fails(send(session, [clockInIx(session.publicKey, owner.publicKey, true, day, 2, 1)])), 'a second Clock-In the same UTC day is rejected');
  check(await fails(send(stranger, [clockInIx(stranger.publicKey, owner.publicKey, false, day, 1, 0)])), 'a stranger cannot clock in for the owner');

  console.log('\n— chest commit (session key, no prompt) —');
  const c = await fair.commitChest(conn, 'chest_9');
  const posted = await send(session, [memoIx(session.publicKey, fair.chestCommitText('chest_9', c!.targetSlot, o))]);
  check(posted.slot < c!.targetSlot, `commit memo landed at slot ${posted.slot}, before target ${c!.targetSlot}`);
  const r = await fair.resolveChest(conn, c!, { timeoutMs: 40_000 });
  const seed = fair.rollSeed(r!.blockhash, 'chest_9', o);
  const proof: fair.ChestProof = {
    chestId: 'chest_9', owner: o, targetSlot: c!.targetSlot, slot: r!.slot, blockhash: r!.blockhash,
    seedHex: fair.toHex(seed), owned: [], commitSig: posted.sig, commitTxSlot: posted.slot,
  };
  const v = await fair.verifyProof(conn, proof);
  check(v.ok && !!v.commit?.ok, 'verifyProof: roll + on-chain commit (signed by a session key of the owner) accepted');

  // A "commit" posted after the target block exists must be rejected.
  const late = await send(owner, [memoIx(owner.publicKey, fair.chestCommitText('chest_9', c!.targetSlot, o))]);
  const vl = await fair.verifyProof(conn, { ...proof, commitSig: late.sig });
  check(!vl.ok && /not before the target/.test(vl.commit?.reason ?? ''), `a commit that landed after the target slot is rejected (${vl.commit?.reason})`);
  const forged = await send(stranger, [memoIx(stranger.publicKey, fair.chestCommitText('chest_9', c!.targetSlot, o))]).catch(() => null);
  if (forged) {
    const vf = await fair.verifyProof(conn, { ...proof, commitSig: forged.sig });
    check(!vf.ok && /not signed/.test(vf.commit?.reason ?? '') , `a commit signed by a stranger is rejected (${vf.commit?.reason})`);
  }

  console.log('\n— revoke —');
  const rv = await send(session, [revokeSessionIx(session.publicKey, owner.publicKey, session.publicKey), ...revokeIxs(session.publicKey, session.publicKey)]);
  check(!(await readSessionRecord(conn, o, session.publicKey.toBase58())), `revoke_session by the session key closed the record (${rv.sig.slice(0, 10)}…)`);
  const vr = await fair.verifyProof(conn, proof);
  check(vr.ok, 'a commit made before the revoke still verifies (the owner-signed link memo is on chain)');

  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
