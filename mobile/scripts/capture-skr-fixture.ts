/**
 * Capture real mainnet accounts for the .skr resolution tests (read-only).
 *   npx tsx scripts/capture-skr-fixture.ts alice.skr > ../app/tests/fixtures/skr-mainnet.json
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { SKR_PARENT, hashedName, mainDomainKey, nameAccountKey, resolveSkr, reverseKey } from '../src/chain/skrName';

const conn = new Connection(process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
(async () => {
  const name = (process.argv[2] || 'alice.skr').replace(/\.skr$/, '');
  const nameKey = nameAccountKey(hashedName(name), undefined, SKR_PARENT);
  const rec = await conn.getAccountInfo(nameKey);
  if (!rec) throw new Error(`${name}.skr not found`);
  const owner = new PublicKey(rec.data.subarray(40, 72));
  const rev = reverseKey(nameKey, '.skr');
  const [revInfo, mdInfo] = await conn.getMultipleAccountsInfo([rev, mainDomainKey(owner)]);
  const resolved = await resolveSkr(conn, owner.toBase58());
  const b64 = (d?: Buffer | null) => (d ? Buffer.from(d).toString('base64') : null);
  console.log(JSON.stringify({
    capturedAt: new Date().toISOString(), cluster: 'mainnet-beta', name: `${name}.skr`, owner: owner.toBase58(),
    accounts: {
      [nameKey.toBase58()]: b64(rec.data),
      [rev.toBase58()]: b64(revInfo?.data),
      [mainDomainKey(owner).toBase58()]: b64(mdInfo?.data),
    },
    ownedNameAccounts: [nameKey.toBase58()],
    resolvedLive: resolved,
  }, null, 2));
})();
