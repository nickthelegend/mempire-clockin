/**
 * End-to-end checks for the Solana Mobile tech pack against a LOCAL validator
 * (no devnet SOL needed), with the exact builders and readers the app ships.
 *
 *   bash scripts/verify-solana-tech.sh        # starts a validator on 4150-4199, runs this, stops it
 *
 * Session key ("approve once, play all week"):
 *   link (owner-signed memo + fee float) → session-signed Clock-Ins → ledger
 *   read-back accepts them; a forged link and its Clock-In are rejected; an
 *   expired session is rejected; a self-revoke sweeps the float and later
 *   Clock-Ins are rejected; the owner-only reader ignores session memos.
 * Provably fair chests: commit → target slot's blockhash → roll, recomputed.
 */
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  FEE_FLOAT_LAMPORTS, linkIxs, linkMemoText, readSessionLedger, revokeIxs, sessionClockInIx,
} from '../src/chain/session';
import { readClockIns } from '../src/chain/solana';
import * as fair from '../src/chain/fair';
import { DUEL_REF, MEMO_V1, challengeIxs, loadChallenge, readDuelBoard, resultIxs } from '../src/chain/duels';
import { decodeDuel, encodeDuel, replayDuel, toCard, verifyResult, winnerCode, ghostInputs, type DuelPayload } from '../src/game/duel';
import { createMatch, hashState, stepSim } from '../../app/src/sim/engine';
import { decideBot } from '../../app/src/sim/bot';
import { FORMATS, type InputEvent } from '../../app/src/sim/types';

const RPC = process.env.EXPO_PUBLIC_RPC_URL!;
const conn = new Connection(RPC, 'confirmed');
let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures += 1; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

async function send(payer: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = []): Promise<string> {
  const bh = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey, recentBlockhash: bh.blockhash, instructions: ixs,
  }).compileToV0Message());
  tx.sign([payer, ...extra]);
  const sig = await conn.sendRawTransaction(tx.serialize());
  const r = await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (r.value.err) throw new Error(JSON.stringify(r.value.err));
  return sig;
}
const fund = async (k: PublicKey, sol: number) => {
  const s = await conn.requestAirdrop(k, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(s, 'confirmed');
};
const now = () => Math.floor(Date.now() / 1000);

async function sessionKeys() {
  console.log('\n— session key —');
  const owner = Keypair.generate();
  await fund(owner.publicKey, 1);
  const session = Keypair.generate();
  const exp = now() + 7 * 86_400;
  const before = await conn.getBalance(owner.publicKey);
  const linkSig = await send(owner, linkIxs(owner.publicKey, session.publicKey, exp));
  const txl = await conn.getTransaction(linkSig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  check(txl!.transaction.message.header.numRequiredSignatures === 1, `link is ONE transaction with ONE signature, the owner's (${linkSig.slice(0, 10)}…)`);
  check(await conn.getBalance(session.publicKey) === FEE_FLOAT_LAMPORTS, `session key received the ${FEE_FLOAT_LAMPORTS / 1e9} SOL fee float`);
  check(before - (await conn.getBalance(owner.publicKey)) === FEE_FLOAT_LAMPORTS + 5000, 'owner paid exactly float + one fee');

  // Two Clock-Ins signed and paid by the session key alone.
  const c1 = await send(session, [sessionClockInIx(session.publicKey, owner.publicKey, 20261008, 1, ':war=1:side=BONK')]);
  const c2 = await send(session, [sessionClockInIx(session.publicKey, owner.publicKey, 20261009, 2)]);
  check(true, `two session-signed Clock-Ins landed with no owner signature (${c1.slice(0, 10)}…, ${c2.slice(0, 10)}…)`);

  // An attacker links their own key "for" the owner: references the owner (so
  // it shows in the owner's history) but cannot get the owner's signature.
  const thief = Keypair.generate();
  await fund(thief.publicKey, 1);
  const fakeSession = Keypair.generate();
  await send(thief, [
    { programId: MEMO, keys: [{ pubkey: thief.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(linkMemoText(fakeSession.publicKey.toBase58(), exp)) },
    SystemProgram.transfer({ fromPubkey: thief.publicKey, toPubkey: owner.publicKey, lamports: 1_000_000 }),
    SystemProgram.transfer({ fromPubkey: thief.publicKey, toPubkey: fakeSession.publicKey, lamports: 2_000_000 }),
  ]);
  const forged = await send(fakeSession, [sessionClockInIx(fakeSession.publicKey, owner.publicKey, 20261010, 99)]);

  let led = await readSessionLedger(conn, owner.publicKey.toBase58());
  check(led.accepted.length === 2 && led.accepted.every((a) => a.session === session.publicKey.toBase58()),
    `ledger read-back accepts the 2 session Clock-Ins: ${JSON.stringify(led.accepted.map((a) => [a.day, a.streak]))}`);
  check(led.rejected.some((r) => r.reason === 'link not signed by the owner'), 'forged link (not signed by the owner) rejected');
  check(!led.accepted.some((a) => a.sig === forged), 'Clock-In from the forged session is not accepted');

  const own = await readClockIns(owner.publicKey.toBase58());
  check(own.length === 0, 'owner-only reader ignores session memos (they need the session rules)');

  // Expiry: a link that lives 6 seconds.
  const shortS = Keypair.generate();
  await send(owner, linkIxs(owner.publicKey, shortS.publicKey, now() + 6));
  await sleep(9000);
  const late = await send(shortS, [sessionClockInIx(shortS.publicKey, owner.publicKey, 20261011, 3)]);
  led = await readSessionLedger(conn, owner.publicKey.toBase58());
  check(led.rejected.some((r) => r.sig === late && r.reason === 'session expired'), 'Clock-In after the link expired is rejected');

  // Revoke: the session key revokes itself and returns its float.
  const bal = await conn.getBalance(session.publicKey);
  const ownerBefore = await conn.getBalance(owner.publicKey);
  await send(session, revokeIxs(session.publicKey, session.publicKey, { to: owner.publicKey, balance: bal }));
  check(await conn.getBalance(session.publicKey) === 0, 'revoke swept the session key to 0 (account closed)');
  check((await conn.getBalance(owner.publicKey)) - ownerBefore === bal - 5000, `owner got the float back (${(bal - 5000) / 1e9} SOL)`);
  // Even if the key were stolen and refunded, a Clock-In after the revoke is rejected.
  await send(owner, [SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: session.publicKey, lamports: 1_000_000 })]);
  const after = await send(session, [sessionClockInIx(session.publicKey, owner.publicKey, 20261012, 4)]);
  led = await readSessionLedger(conn, owner.publicKey.toBase58());
  check(led.rejected.some((r) => r.sig === after && r.reason === 'session revoked'), 'Clock-In after the revoke is rejected');
  check(led.accepted.length === 2, 'the 2 Clock-Ins made before the revoke stay valid');
}

async function fairChests() {
  console.log('\n— provably fair chests —');
  const owner = Keypair.generate().publicKey.toBase58();
  const commit = await fair.commitChest(conn, 'chest_7');
  check(!!commit && commit.targetSlot === commit.committedSlot + fair.SLOT_DELAY, `commit: target slot = current ${commit?.committedSlot} + ${fair.SLOT_DELAY}`);
  const r = await fair.resolveChest(conn, commit!, { timeoutMs: 40_000 });
  check(!!r && r.slot >= commit!.targetSlot && r.blockhash.length > 30, `revealed with blockhash of slot ${r?.slot} (${r?.blockhash.slice(0, 12)}…)`);
  const seed = fair.rollSeed(r!.blockhash, 'chest_7', owner);
  const again = await fair.fetchBlockhash(conn, r!.slot);
  check(again === r!.blockhash && fair.toHex(fair.rollSeed(again!, 'chest_7', owner)) === fair.toHex(seed), 'recompute from chain gives the same roll');
  const proof = { chestId: 'chest_7', owner, targetSlot: commit!.targetSlot, slot: r!.slot, blockhash: r!.blockhash, seedHex: fair.toHex(seed), owned: [] };
  check((await fair.verifyProof(conn, proof)).ok, 'verifyProof (the in-app Recompute) accepts the real proof');
  check(!(await fair.verifyProof(conn, { ...proof, seedHex: '00'.repeat(32) })).ok, 'verifyProof rejects a doctored seed');
  check(!(await fair.verifyProof(conn, { ...proof, slot: r!.slot + 1 })).ok, 'verifyProof rejects a later slot than the first block after the target');
}

/** A bot-vs-bot match in the native loop's order; returns each seat's queued inputs. */
function playMatch(seed: number, rush: boolean, decks: [string[], string[]], script0?: InputEvent[]) {
  const sim = createMatch(seed, [decks[0].map((t) => toCard({ ticker: t, level: 3 })), decks[1].map((t) => toCard({ ticker: t, level: 3 }))], FORMATS[rush ? 'rush' : 'standard']);
  const pending = new Map<number, InputEvent[]>();
  const push = (e: InputEvent) => { const l = pending.get(e.tick) ?? []; l.push(e); pending.set(e.tick, l); };
  for (const e of script0 ?? []) push(e);
  const rec: [InputEvent[], InputEvent[]] = [[], []];
  while (sim.phase !== 'ended') {
    for (const seat of (script0 ? [1] : [0, 1]) as (0 | 1)[]) {
      const ev = decideBot(sim, seat, 'hard');
      if (ev) { push(ev); rec[seat].push(ev); }
    }
    stepSim(sim, pending.get(sim.tick) ?? []);
  }
  return { sim, rec };
}

async function duels() {
  console.log('\n— ghost duels —');
  const A = ['ETH', 'WIF', 'BTC', 'DOGE', 'SOL', 'BONK', 'POPCAT', 'GOAT'];
  const B = ['SHIB', 'PEPE', 'MEW', 'BRETT', 'DOGE', 'BONK', 'WIF', 'SOL'];
  const seed = 0x5eed1;
  const pay = (deck: string[], evs: InputEvent[]): DuelPayload => ({ seed, rush: false, deck: deck.map((t) => ({ ticker: t, level: 3 })), inputs: evs.map(({ tick, deckIndex, x, y }) => ({ tick, deckIndex, x, y })) });
  const memoV1 = await conn.getAccountInfo(MEMO_V1);
  check(!!memoV1?.executable, 'SPL Memo v1 (cheap, unlogged payload memo) is deployed');
  const alice = Keypair.generate(); const bob = Keypair.generate();
  await fund(alice.publicKey, 1); await fund(bob.publicKey, 1);

  const orig = playMatch(seed, false, [A, B]);
  const challenger = pay(A, orig.rec[0]);
  const bytes = encodeDuel(challenger);
  const cSig = await send(alice, challengeIxs(alice.publicKey, bytes, seed));
  const raw = await conn.getTransaction(cSig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  const size = new VersionedTransaction(new TransactionMessage({ payerKey: alice.publicKey, recentBlockhash: raw!.transaction.message.recentBlockhash, instructions: challengeIxs(alice.publicKey, bytes, seed) }).compileToV0Message()).serialize().length;
  check(size <= 1232, `challenge (3-min match, ${orig.rec[0].length} deploys) fits one transaction: ${size} bytes`);
  const keys = raw!.transaction.message.staticAccountKeys.map((k) => k.toBase58());
  const refIdx = keys.indexOf(DUEL_REF.toBase58());
  check(refIdx >= raw!.transaction.message.header.numRequiredSignatures && !raw!.transaction.message.isAccountWritable(refIdx), 'duel reference is in the tx as a read-only, non-signer key');

  const ch = await loadChallenge(conn, cSig);
  check(ch.challenger === alice.publicKey.toBase58() && !!ch.payload && ch.payload.inputs.length === orig.rec[0].length, 'challenge read back from chain: challenger + payload matches its sha256 commitment');

  // Bob fights the ghost (bot pilot standing in for his thumbs), then posts the result.
  const live = playMatch(seed, false, [A, B], ghostInputs(ch.payload!, 0));
  const opponent = pay(B, live.rec[1]);
  const w = winnerCode(live.sim.winner as 0 | 1 | -2);
  const rSig = await send(bob, resultIxs(bob.publicKey, cSig, w, hashState(live.sim), encodeDuel(opponent)));
  const board = await readDuelBoard(conn);
  const res = board.txs.find((t) => t.sig === rSig);
  const chal = board.txs.find((t) => t.sig === cSig);
  check(!!res && !!chal && res.signer === bob.publicKey.toBase58(), `duel board (getSignaturesForAddress on the reference) lists the challenge and the result (${board.txs.length} txs)`);
  if (res && res.memo.kind === 'result' && res.memo.data) {
    const v = verifyResult(ch.payload!, decodeDuel(Buffer.from(res.memo.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), res.memo);
    check(v.ok, `result matches replay: winner ${res.memo.winner}, state hash ${res.memo.stateHash.toString(16)} == ${v.replay.stateHash.toString(16)}`);
  } else check(false, 'result memo parsed');
  const liar = await send(alice, resultIxs(alice.publicKey, cSig, w === 'c' ? 'o' : 'c', hashState(live.sim), encodeDuel(opponent)));
  const lie = (await readDuelBoard(conn)).txs.find((t) => t.sig === liar);
  if (lie && lie.memo.kind === 'result') check(!verifyResult(ch.payload!, opponent, lie.memo).ok, 'a posted result with the wrong winner fails the replay check');
  check(replayDuel(ch.payload!, opponent).stateHash === (hashState(live.sim) >>> 0), 'replay hash == live hash');
}

(async () => {
  await duels();
  await sessionKeys();
  await fairChests();
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
