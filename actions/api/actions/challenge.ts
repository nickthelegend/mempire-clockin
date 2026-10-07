import { Connection } from '@solana/web3.js';
import { type Req, type Res, RPC, origin, parseBody, q, send } from '../../lib/http';
import { RIVALS, challengeMemoText, challengeTx, deepLink, parseAccount, rivalIndex } from '../../lib/tx';

/**
 * "Challenge a friend" (devnet). GET describes the Action; POST returns a
 * one-memo transaction `mempire:challenge:v1:<rival>` for the challenger to
 * sign, then (as the completed next action) the app deep link to play it.
 */
export default async function handler(req: Req, res: Res) {
  if (req.method === 'OPTIONS') return send(res, 200);
  let rival: number;
  try { rival = rivalIndex(q(req, 'rival')); } catch (e) { return send(res, 400, { message: (e as Error).message }); }
  const r = RIVALS[rival];
  const base = `${origin(req)}/api/actions/challenge`;
  if (req.method === 'GET') {
    return send(res, 200, {
      type: 'action',
      icon: `${origin(req)}/icon.png`,
      title: `Mempire: beat ${r.name}`,
      description: `I'm challenging you to a Mempire battle against the ${r.name} AI deck (${r.blurb}). Sign the challenge on Solana devnet (a memo, no SOL moves except the fee), then open the app to play: ${deepLink(rival)}`,
      label: 'Accept challenge',
      links: {
        actions: [
          { type: 'transaction', label: `Accept vs ${r.name}`, href: `${base}?rival=${r.slug}` },
          ...RIVALS.map((x, i) => (i === rival ? null : { type: 'transaction', label: x.name, href: `${base}?rival=${x.slug}` })).filter(Boolean),
        ],
      },
    });
  }
  if (req.method !== 'POST') return send(res, 405, { message: 'GET or POST' });
  try {
    const account = parseAccount(parseBody(req.body));
    const { blockhash } = await new Connection(RPC, 'confirmed').getLatestBlockhash();
    return send(res, 200, {
      type: 'transaction',
      transaction: challengeTx(account, rival, blockhash),
      message: `Signed challenge "${challengeMemoText(rival)}" on devnet. Open Mempire to play: ${deepLink(rival)}`,
      links: {
        next: {
          type: 'inline',
          action: {
            type: 'completed',
            icon: `${origin(req)}/icon.png`,
            title: `Challenge accepted: ${r.name}`,
            description: `Now play it in the Mempire app: ${deepLink(rival)} (no app yet? https://play.mempire.fun)`,
            label: 'Challenge signed',
          },
        },
      },
    });
  } catch (e) {
    return send(res, 400, { message: (e as Error).message });
  }
}
