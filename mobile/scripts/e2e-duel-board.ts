/** Audit helper: the duel board as the app reads it (challenges with their result counts). */
import { Connection } from '@solana/web3.js';
import { readDuelBoard } from '../src/chain/duels';
const conn = new Connection(process.env.EXPO_PUBLIC_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
(async () => {
  const sigs = await conn.getSignaturesForAddress((await import('../src/chain/refs')).DUEL_REF, { limit: 40 });
  console.log('signatures', sigs.length, 'errored', sigs.filter((s) => s.err).length);
  const { txs } = await readDuelBoard(conn, 40);
  console.log('parsed', txs.length);
  for (const t of txs) {
    const m = t.memo;
    const extra = m.kind === 'challenge' ? `results=${txs.filter((r) => r.memo.kind === 'result' && r.memo.challengeSig === t.sig).length}` : `-> ${'challengeSig' in m ? m.challengeSig.slice(0, 8) : ''}`;
    console.log(m.kind.padEnd(9), t.sig.slice(0, 8), t.signer.slice(0, 4) + '…' + t.signer.slice(-4), new Date(t.time * 1000).toISOString().slice(5, 16), extra);
  }
})();
