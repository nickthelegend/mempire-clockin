import { Connection } from '@solana/web3.js';
import { type Req, type Res, RPC, origin, parseBody, q, send } from '../../lib/http';
import { parseAccount } from '../../lib/tx';
import { acceptTx, duelDeepLink, readChallenge } from '../../lib/duel';

/**
 * Ghost Duel (devnet): GET shows the challenger and their ghost (format,
 * deck, deploys; stake-free); POST returns an accept memo
 * `mempire:duel-accept:v1:<challengeSig>` to sign, then the app deep link
 * that loads the ghost into the native arena.
 */
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export default async function handler(req: Req, res: Res) {
  if (req.method === 'OPTIONS') return send(res, 200);
  const sig = q(req, 'c') ?? '';
  const conn = new Connection(RPC, 'confirmed');
  let ch;
  try { ch = await readChallenge(conn, sig); } catch (e) {
    return send(res, req.method === 'GET' ? 404 : 400, { message: (e as Error).message });
  }
  const s = ch.summary;
  if (req.method === 'GET') {
    return send(res, 200, {
      type: 'action',
      icon: `${origin(req)}/icon.png`,
      title: `Ghost Duel vs ${short(ch.challenger)} · ${s.rush ? 'Rush 0:30' : 'Standard 3:00'}`,
      description: `Fight a replay of ${short(ch.challenger)}'s exact match: ${s.deploys} deploys, seed ${s.seed}, deck ${s.deck.map((c) => `$${c.ticker} L${c.level}`).join(' ')}. Stake-free: accepting signs a devnet memo (fee only), then opens the duel in the Mempire app. Your result is re-simulated by anyone from chain.`,
      label: 'Accept duel',
      links: { actions: [{ type: 'transaction', label: 'Accept duel', href: `${origin(req)}/api/actions/duel?c=${sig}` }] },
    });
  }
  if (req.method !== 'POST') return send(res, 405, { message: 'GET or POST' });
  try {
    const account = parseAccount(parseBody(req.body));
    const { blockhash } = await conn.getLatestBlockhash();
    const link = duelDeepLink(sig, ch.payload);
    return send(res, 200, {
      type: 'transaction',
      transaction: acceptTx(account, sig, blockhash),
      message: `Duel accepted on devnet. Open Mempire to fight the ghost: ${link}`,
      links: {
        next: {
          type: 'inline',
          action: {
            type: 'completed', icon: `${origin(req)}/icon.png`, title: 'Duel accepted',
            description: `Fight the ghost in the Mempire app: ${link}`, label: 'Accepted',
          },
        },
      },
    });
  } catch (e) {
    return send(res, 400, { message: (e as Error).message });
  }
}
