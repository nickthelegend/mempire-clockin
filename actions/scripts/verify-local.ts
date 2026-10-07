/** Called by verify-local.sh: GET/POST both Actions through the real handlers, sign, send, check. */
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import challenge from '../api/actions/challenge';
import seasonPass from '../api/actions/season-pass';
import { passMint } from '../lib/tx';

const conn = new Connection(process.env.DEVNET_RPC_URL!, 'confirmed');
const buyer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.BUYER_KEY!, 'utf8'))));
let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures += 1; };

type H = (req: never, res: never) => Promise<void>;
async function call(h: H, method: string, query: Record<string, string>, body?: unknown) {
  const out: { code?: number; body?: any; headers: Record<string, string> } = { headers: {} };
  const res = { setHeader: (k: string, v: string) => { out.headers[k] = v; }, status: (c: number) => { out.code = c; return res; }, json: (b: unknown) => { out.body = b; }, end: () => {} };
  await h({ method, query, body, headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' } } as never, res as never);
  return out;
}
async function signSend(b64: string): Promise<string> {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
  tx.sign([buyer]);
  const sig = await conn.sendRawTransaction(tx.serialize());
  const bh = await conn.getLatestBlockhash();
  const r = await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (r.value.err) throw new Error(JSON.stringify(r.value.err));
  return sig;
}

(async () => {
  const g = await call(challenge as H, 'GET', { rival: 'blue-chips' });
  check(g.code === 200 && g.body.type === 'action' && g.headers['Access-Control-Allow-Origin'] === '*', 'challenge GET: action metadata + CORS');
  const p = await call(challenge as H, 'POST', { rival: 'blue-chips' }, { account: buyer.publicKey.toBase58() });
  check(p.code === 200 && p.body.links?.next?.action?.type === 'completed', 'challenge POST: transaction + completed next action with the deep link');
  const s1 = await signSend(p.body.transaction);
  const memo = (await conn.getSignaturesForAddress(buyer.publicKey, { limit: 5 })).find((x) => x.signature === s1)?.memo ?? '';
  check(memo.includes('mempire:challenge:v1:blue-chips'), `challenge tx landed with memo "${memo}"`);

  const sg = await call(seasonPass as H, 'GET', {});
  check(sg.code === 200 && sg.body.disabled === false && /SKR/.test(sg.body.label), `season-pass GET: enabled, "${sg.body.label}"`);
  const sp = await call(seasonPass as H, 'POST', {}, { account: buyer.publicKey.toBase58() });
  check(sp.code === 200 && !!sp.body.transaction, 'season-pass POST: buy_pass transaction');
  const s2 = await signSend(sp.body.transaction);
  const t22 = await conn.getParsedTokenAccountsByOwner(buyer.publicKey, { mint: passMint() });
  const amt = t22.value[0]?.account.data.parsed.info.tokenAmount.uiAmount;
  check(amt === 1, `Season Pass minted to the buyer via the Blink tx (${s2.slice(0, 10)}…), soulbound Token-2022 balance ${amt}`);
  const again = await call(seasonPass as H, 'POST', {}, { account: buyer.publicKey.toBase58() });
  let second = false;
  try { await signSend(again.body.transaction); second = true; } catch { second = false; }
  check(!second, 'a second purchase by the same wallet is refused on chain (receipt exists)');
  const badAcct = await call(seasonPass as H, 'POST', {}, { account: 'nope' });
  check(badAcct.code === 400, 'bad account → 400 with a message');
  console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
