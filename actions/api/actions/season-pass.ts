import { Connection } from '@solana/web3.js';
import { type Req, type Res, RPC, origin, parseBody, send } from '../../lib/http';
import { PASS_CONFIG, PASS_PROGRAM, parseAccount, parsePassChain, passTx, seasonPda, type PassChain } from '../../lib/tx';

/**
 * "Buy Season Pass" (devnet): the mempire_pass buy_pass instruction, paid in
 * the SKR devnet stand-in. If the program is not deployed on devnet yet, the
 * Action says so and is disabled; POST refuses with a clear message.
 */
async function readChain(conn: Connection): Promise<PassChain | null> {
  const [prog, cfg, season] = await conn.getMultipleAccountsInfo([PASS_PROGRAM, PASS_CONFIG, seasonPda()]);
  if (!prog?.executable || !cfg || !season) return null;
  return parsePassChain(cfg.data, season.data);
}

export default async function handler(req: Req, res: Res) {
  if (req.method === 'OPTIONS') return send(res, 200);
  const conn = new Connection(RPC, 'confirmed');
  let chain: PassChain | null = null;
  try { chain = await readChain(conn); } catch { chain = null; }
  if (req.method === 'GET') {
    return send(res, 200, {
      type: 'action',
      icon: `${origin(req)}/icon.png`,
      title: 'Mempire Season Pass (devnet)',
      description: chain
        ? `Season 1 premium track: a soulbound Token-2022 pass, ${chain.priceSkr} SKR (devnet stand-in). Devnet only.`
        : 'The Season Pass program (mempire_pass) is not deployed on devnet yet, so this Action is disabled. The challenge Action works today.',
      label: chain ? `Buy for ${chain.priceSkr} SKR` : 'Not on devnet yet',
      disabled: !chain,
      ...(chain ? {} : { error: { message: 'mempire_pass is not deployed on devnet yet' } }),
    });
  }
  if (req.method !== 'POST') return send(res, 405, { message: 'GET or POST' });
  if (!chain) return send(res, 422, { message: 'The Season Pass program is not deployed on devnet yet.' });
  try {
    const buyer = parseAccount(parseBody(req.body));
    const { blockhash } = await conn.getLatestBlockhash();
    return send(res, 200, { type: 'transaction', transaction: passTx(buyer, chain, blockhash), message: `Season Pass for ${chain.priceSkr} SKR (devnet)` });
  } catch (e) {
    return send(res, 400, { message: (e as Error).message });
  }
}
