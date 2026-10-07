/**
 * Post a ghost-duel challenge from a fresh bot wallet on a LOCAL validator, so
 * the app's Duels tab has someone to fight (simulator demo / manual tests).
 *   EXPO_PUBLIC_RPC_URL=http://127.0.0.1:4150 npx tsx scripts/seed-duel-local.ts [rush|standard]
 * Prints the challenge signature and the app deep link.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { createMatch, stepSim } from '../../app/src/sim/engine';
import { decideBot } from '../../app/src/sim/bot';
import { FORMATS, type InputEvent } from '../../app/src/sim/types';
import { challengeIxs } from '../src/chain/duels';
import { encodeDuel, toB64url, toCard } from '../src/game/duel';

const RPC = process.env.EXPO_PUBLIC_RPC_URL || 'http://127.0.0.1:4150';
if (!/127\.0\.0\.1|localhost/.test(RPC)) throw new Error('localnet only');
const conn = new Connection(RPC, 'confirmed');
const rush = process.argv[2] !== 'standard';
const DECK = ['DOGE', 'SHIB', 'BONK', 'WIF', 'PEPE', 'POPCAT', 'MEW', 'BRETT'];

(async () => {
  const seed = (Date.now() ^ 0x9e3779b9) >>> 0;
  const cards = DECK.map((t) => toCard({ ticker: t, level: 2 }));
  const sim = createMatch(seed, [cards, cards], FORMATS[rush ? 'rush' : 'standard']);
  const pending = new Map<number, InputEvent[]>();
  const rec: InputEvent[] = [];
  while (sim.phase !== 'ended') {
    for (const seat of [0, 1] as const) {
      const ev = decideBot(sim, seat, 'normal');
      if (ev) { const l = pending.get(ev.tick) ?? []; l.push(ev); pending.set(ev.tick, l); if (seat === 0) rec.push(ev); }
    }
    stepSim(sim, pending.get(sim.tick) ?? []);
  }
  const bytes = encodeDuel({ seed, rush, deck: DECK.map((t) => ({ ticker: t, level: 2 })), inputs: rec });
  const kp = Keypair.generate();
  await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL), 'confirmed');
  const bh = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: kp.publicKey, recentBlockhash: bh.blockhash, instructions: challengeIxs(kp.publicKey, bytes, seed) }).compileToV0Message());
  tx.sign([kp]);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  console.log(JSON.stringify({ challenger: kp.publicKey.toBase58(), sig, deploys: rec.length, link: `mempire://duel?c=${sig}&d=${toB64url(bytes)}` }, null, 2));
  process.exit(0);
})();
