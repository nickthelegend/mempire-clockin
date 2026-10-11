/**
 * The scripted sweep for scripts/go-devnet.sh: every Mempire on-chain feature,
 * run once with the app's own builders, each signature written with an
 * explorer link to an evidence file.
 *
 *   EXPO_PUBLIC_RPC_URL=<rpc> npx tsx scripts/devnet-sweep.ts \
 *     --payer <keypair.json> --skr <skr-config.json> --out <evidence.md> [--player <keypair.json>]
 *
 * The player is a sweep-only keypair (created next to the payer if missing),
 * funded with 0.25 SOL by the payer. Nothing here can touch mainnet.
 */
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { sendAndLand } from '../src/chain/send';
import { createSessionIx, clockInIx, readClockState, WAR_CODES } from '../src/chain/clockin';
import { linkIxs, sessionClockInIx } from '../src/chain/session';
import { memoIx, refIx, WAR_REF } from '../src/chain/refs';
import * as fair from '../src/chain/fair';
import { makeEarnIxs, makePayIxs, type SkrConfig } from '../src/chain/skr';
import { buyPassIx, buySkinIx, hasPremium, heldToken2022, readPassChain, ARENA_SKINS, passMint, SEASON_ID } from '../src/chain/pass';
import { buildSignInInput, signInLocally, verifySignIn } from '../src/chain/siws';
import { challengeIxs, loadChallenge, resultIxs } from '../src/chain/duels';
import { encodeDuel, ghostInputs, toCard, verifyResult, winnerCode, type DuelPayload } from '../src/game/duel';
import { dayKey, rollChest } from '../src/game/rules';
import { warMemo } from '../src/game/board';
import { CLUSTER_LABEL, RPC_URL, explorerTx, explorerAddr } from '../src/chain/solana';
import { createMatch, hashState, stepSim } from '../../app/src/sim/engine';
import { decideBot } from '../../app/src/sim/bot';
import { FORMATS, type InputEvent } from '../../app/src/sim/types';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const conn = new Connection(RPC_URL, 'confirmed');
const loadKp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));
const payer = loadKp(arg('payer')!);
const skr = JSON.parse(readFileSync(arg('skr')!, 'utf8')) as SkrConfig;
const OUT = arg('out')!;
const playerPath = arg('player') ?? arg('payer')!.replace(/[^/]+$/, 'sweep-player.json');
if (!existsSync(playerPath)) writeFileSync(playerPath, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
const player = loadKp(playerPath);

const rows: { step: string; sig?: string; note: string }[] = [];
let failures = 0;
const record = (step: string, note: string, sig?: string, ok = true) => {
  rows.push({ step: ok ? step : `✗ ${step}`, sig, note });
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${step}${sig ? `  ${sig}` : ''}  ${note}`);
};

/** Every sweep transaction goes through the app's landing helper (chain/send.ts). */
const send = (signer: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = []) =>
  sendAndLand(conn, signer.publicKey, ixs, (tx) => { tx.sign([signer, ...extra]); return tx; });
async function step(name: string, fn: () => Promise<{ sig?: string; note: string }>) {
  try { const r = await fn(); record(name, r.note, r.sig); } catch (e) { record(name, (e instanceof Error ? e.message : String(e)).slice(0, 200), undefined, false); }
}

function playMatch(seed: number, decks: [string[], string[]], script0?: InputEvent[]) {
  const sim = createMatch(seed, [decks[0].map((t) => toCard({ ticker: t, level: 3 })), decks[1].map((t) => toCard({ ticker: t, level: 3 }))], FORMATS.rush);
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

async function main() {
  const owner = player.publicKey;
  const o = owner.toBase58();
  const day = dayKey();
  console.log(`cluster ${CLUSTER_LABEL} (${RPC_URL}) · payer ${payer.publicKey.toBase58()} · player ${o}`);

  // Fund the sweep player (idempotent: only tops up).
  const bal = await conn.getBalance(owner);
  if (bal < 0.15 * LAMPORTS_PER_SOL) {
    await step('fund sweep player', async () => ({
      sig: await send(payer, [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: owner, lamports: 0.25 * LAMPORTS_PER_SOL - bal })]),
      note: `0.25 SOL to ${o}`,
    }));
  }

  await step('Sign In With Solana (off-chain)', async () => {
    const input = buildSignInInput();
    const out = signInLocally({ ...input, address: o }, player.secretKey);
    const v = verifySignIn({ ...input, address: o }, out);
    if (!v.ok) throw new Error(v.reason);
    return { note: `SIWS message for ${o} (domain ${v.fields.domain}, chain ${v.fields.chainId}, nonce ${v.fields.nonce}) signed and ed25519-verified with the app's verifier. No transaction: SIWS signs a message.` };
  });

  const session = Keypair.generate();
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400;
  await step('create_session (one owner approval)', async () => ({
    sig: await send(player, [createSessionIx(owner, session.publicKey, exp), ...linkIxs(owner, session.publicKey, exp), refIx(owner, WAR_REF)]),
    note: `SessionRecord PDA for key ${session.publicKey.toBase58()}, expires ${new Date(exp * 1000).toISOString()}; 0.001 SOL fee float`,
  }));

  const already = (await readClockState(conn, o).catch(() => null))?.lastDay === day;
  await step('session clock_in + Season War pledge (BONK)', async () => {
    if (already) return { note: `already clocked in today (${day}); ClockInState unchanged` };
    const sig = await send(session, [
      sessionClockInIx(session.publicKey, owner, day, 1, warMemo('BONK')), refIx(session.publicKey, WAR_REF),
      clockInIx(session.publicKey, owner, true, day, 1, WAR_CODES.BONK),
    ]);
    const st = await readClockState(conn, o);
    return { sig, note: `signed by the session key only; ClockInState day ${st?.lastDay}, streak ${st?.streak}, war side ${st?.warSide} (BONK); memo carries :war=1:side=BONK` };
  });

  await step('chest commit (session key) + open + Verify', async () => {
    const chestId = `sweep_${Date.now().toString(36)}`;
    const c = await fair.commitChest(conn, chestId);
    if (!c) throw new Error('no slot');
    const commitSig = await send(session, [memoIx(session.publicKey, fair.chestCommitText(chestId, c.targetSlot, o))]);
    const st = await conn.getSignatureStatuses([commitSig]);
    const r = await fair.resolveChest(conn, c, { timeoutMs: 60_000 });
    if (!r) throw new Error('target slot not reached');
    const seed = fair.rollSeed(r.blockhash, chestId, o);
    const drops = rollChest('silver', {}, fair.seededRand(seed));
    const v = await fair.verifyProof(conn, {
      chestId, owner: o, targetSlot: c.targetSlot, slot: r.slot, blockhash: r.blockhash, seedHex: fair.toHex(seed), owned: [],
      commitSig, commitTxSlot: st.value[0]?.slot ?? undefined,
    });
    if (!v.ok) throw new Error(`verify failed: ${v.commit?.reason ?? 'roll mismatch'}`);
    return { sig: commitSig, note: `commit at slot ${st.value[0]?.slot} for target ${c.targetSlot}; rolled from block ${r.slot} (${r.blockhash.slice(0, 12)}…) → ${drops.map((d) => d.ticker).join(', ')}; verifyProof: roll + commit OK` };
  });

  // SKR from the public faucet (100 per request cap): enough for the pass and a skin.
  for (const [i, amt] of [[1, 100], [2, 100], [3, 40]] as const) {
    await step(i === 1 ? 'claim SKR (faucet mint)' : `claim SKR #${i}`, async () => ({
      sig: await send(player, makeEarnIxs(skr, owner, amt)),
      note: `${amt} SKR (devnet stand-in ${skr.mint}) minted to the player by the spl-token-faucet PDA`,
    }));
  }

  const chain = await readPassChain();
  await step('buy Season Pass (Token-2022, soulbound)', async () => {
    if (!chain?.season) throw new Error('mempire_pass Season 1 not found on this cluster');
    const held = await heldToken2022(o);
    if (hasPremium({ status: 'live', held })) return { note: 'already holds the pass' };
    const sig = await send(player, [buyPassIx(owner, chain)]);
    return { sig, note: `${chain.season.priceSkr} SKR → treasury vault; pass mint ${passMint(SEASON_ID).toBase58()} (NonTransferable + MetadataPointer + TokenMetadata)` };
  });

  await step('buy skin (Token-2022, Neon Night)', async () => {
    const s = ARENA_SKINS[0];
    if (!chain?.skins[s.id]) throw new Error('skin not on this cluster');
    if ((await heldToken2022(o)).has(chain.skins[s.id].mint.toBase58())) return { note: `already holds ${s.name}` };
    const sig = await send(player, [buySkinIx(s.id, owner, chain)]);
    return { sig, note: `${chain.skins[s.id].priceSkr} SKR → treasury; skin mint ${chain.skins[s.id].mint.toBase58()}` };
  });

  await step('shop payment (Streak Shield, transferChecked)', async () => ({
    sig: await send(player, makePayIxs(skr, owner, 15)),
    note: '15 SKR to the game treasury',
  }));

  // Ghost duel: the player challenges with a recorded match; the payer plays the ghost and posts the result.
  let cSig = '';
  const A = ['ETH', 'WIF', 'BTC', 'DOGE', 'SOL', 'BONK', 'POPCAT', 'GOAT'];
  const B = ['SHIB', 'PEPE', 'MEW', 'BRETT', 'DOGE', 'BONK', 'WIF', 'SOL'];
  const seed = (Date.now() & 0xffff) | 1;
  const pay = (deck: string[], evs: InputEvent[]): DuelPayload => ({ seed, rush: true, deck: deck.map((t) => ({ ticker: t, level: 3 })), inputs: evs.map(({ tick, deckIndex, x, y }) => ({ tick, deckIndex, x, y })) });
  await step('ghost duel challenge', async () => {
    const orig = playMatch(seed, [A, B]);
    cSig = await send(player, challengeIxs(owner, encodeDuel(pay(A, orig.rec[0])), seed));
    return { sig: cSig, note: `30-second Rush match, ${orig.rec[0].length} deploys, payload committed by sha256 in the memo` };
  });
  await step('ghost duel result (verified by replay)', async () => {
    const ch = await loadChallenge(conn, cSig);
    if (!ch.payload) throw new Error('challenge not readable');
    const live = playMatch(seed, [A, B], ghostInputs(ch.payload, 0));
    const opp = pay(B, live.rec[1]);
    const w = winnerCode(live.sim.winner as 0 | 1 | -2);
    const sig = await send(payer, resultIxs(payer.publicKey, cSig, w, hashState(live.sim), encodeDuel(opp)));
    const v = verifyResult(ch.payload, opp, { winner: w, stateHash: hashState(live.sim) >>> 0 });
    if (!v.ok) throw new Error('replay mismatch');
    return { sig, note: `winner ${w}, state hash ${(hashState(live.sim) >>> 0).toString(16)}, replay matches` };
  });

  const held = await heldToken2022(o).catch(() => new Set<string>());
  const lines = [
    `# ${CLUSTER_LABEL === 'devnet' ? 'Devnet' : 'Localnet'} evidence`,
    '',
    `Written by \`scripts/go-devnet.sh\` (mobile/scripts/devnet-sweep.ts) on ${new Date().toISOString()}.`,
    `Cluster: **${CLUSTER_LABEL}** (\`${RPC_URL}\`). Every row is a real transaction made with the app's own instruction builders${CLUSTER_LABEL === 'localnet' ? ' against a local validator (the links open Solana Explorer on a custom RPC, so they only resolve while that validator runs)' : ''}.`,
    '',
    `- Player (sweep wallet): [${o}](${explorerAddr(o)})`,
    `- Payer / admin: [${payer.publicKey.toBase58()}](${explorerAddr(payer.publicKey.toBase58())})`,
    `- mempire_pass: [3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G](${explorerAddr('3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G')})`,
    `- SKR stand-in mint: [${skr.mint}](${explorerAddr(skr.mint!)})`,
    `- Player holds the Season Pass: **${held.has(passMint(SEASON_ID).toBase58()) ? 'yes' : 'no'}**`,
    '',
    '| Step | Transaction | What it proves |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.step} | ${r.sig ? `[${r.sig.slice(0, 8)}…${r.sig.slice(-6)}](${explorerTx(r.sig)})` : '—'} | ${r.note.replace(/\|/g, '/')} |`),
    '',
    failures ? `**${failures} step(s) failed.**` : '**All steps succeeded.**',
    '',
  ];
  writeFileSync(OUT, lines.join('\n'));
  console.log(`\nwrote ${OUT}${failures ? ` — ${failures} FAILED` : ''}`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
