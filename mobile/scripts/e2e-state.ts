/** Audit helper: the owner's ClockInState and SessionRecords, SKR and Token-2022 holdings on devnet. */
import { Connection, PublicKey } from '@solana/web3.js';
import { readClockState, sessionRecordPda } from '../src/chain/clockin';
import { heldToken2022 } from '../src/chain/pass';
const conn = new Connection(process.env.EXPO_PUBLIC_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
(async () => {
  const owner = process.argv[2];
  console.log('ClockInState', JSON.stringify(await readClockState(conn, owner)));
  for (const k of process.argv.slice(3)) {
    const info = await conn.getAccountInfo(sessionRecordPda(new PublicKey(owner), new PublicKey(k)));
    console.log('SessionRecord', k, info ? `exists (${info.data.length} bytes)` : 'absent');
  }
  const held = await heldToken2022(owner);
  console.log('Token-2022 held', [...held].join(', ') || 'none');
  const toks = await conn.getParsedTokenAccountsByOwner(new PublicKey(owner), { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
  console.log('SPL', toks.value.map((t) => `${t.account.data.parsed.info.mint.slice(0, 8)}… ${t.account.data.parsed.info.tokenAmount.uiAmount}`).join(', '));
})();
