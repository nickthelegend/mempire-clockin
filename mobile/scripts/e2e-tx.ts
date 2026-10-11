/**
 * Audit helper: show what a devnet transaction really did.
 *
 *   npx tsx scripts/e2e-tx.ts <signature> [...]      (RPC: EXPO_PUBLIC_RPC_URL or devnet)
 *   npx tsx scripts/e2e-tx.ts --recent <address> [n]  (the address's newest n signatures)
 *
 * Prints: confirmation status, error, signers, programs invoked, memos, SOL and
 * token balance changes, and the explorer link. Retries 429s with backoff.
 */
import { Connection, PublicKey } from '@solana/web3.js';

const RPC = process.env.EXPO_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, { commitment: 'confirmed', disableRetryOnRateLimit: true });
const NAMES: Record<string, string> = {
  '3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G': 'mempire_pass',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'memo-v3',
  Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: 'memo-v1',
  '4bXpkKSV8swHSnwqtzuboGPaPDeEgAn4Vt8GfarV5rZt': 'spl-token-faucet',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'spl-token',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'token-2022',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'ata',
  '11111111111111111111111111111111': 'system',
  ComputeBudget111111111111111111111111111111: 'compute-budget',
};

async function retry<T>(f: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await f(); } catch (e) {
      if (i < 8 && /429|Too many/i.test(String(e))) { await new Promise((r) => setTimeout(r, 2000 * 2 ** Math.min(i, 4))); continue; }
      throw e;
    }
  }
}

async function show(sig: string) {
  const tx = await retry(() => conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }));
  if (!tx) { console.log(`${sig}\n  NOT FOUND`); return; }
  const st = (await retry(() => conn.getSignatureStatuses([sig], { searchTransactionHistory: true }))).value[0];
  const msg = tx.transaction.message;
  const keys = msg.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).staticAccountKeys.map((k) => k.toBase58());
  const signers = keys.slice(0, msg.header.numRequiredSignatures);
  const programs = [...new Set(msg.compiledInstructions.map((i) => keys[i.programIdIndex]))].map((p) => NAMES[p] ?? p);
  const memos = (tx.meta?.logMessages ?? []).filter((l) => l.startsWith('Program log: Memo')).map((l) => l.slice(0, 160));
  const sol = keys.map((k, i) => [k, ((tx.meta!.postBalances[i] - tx.meta!.preBalances[i]) / 1e9)] as const).filter(([, d]) => d !== 0);
  const pre = new Map((tx.meta?.preTokenBalances ?? []).map((b) => [`${b.accountIndex}`, b]));
  const tok = (tx.meta?.postTokenBalances ?? []).map((b) => {
    const p = pre.get(`${b.accountIndex}`);
    const d = Number(b.uiTokenAmount.uiAmount ?? 0) - Number(p?.uiTokenAmount.uiAmount ?? 0);
    return d ? `${b.owner?.slice(0, 6)}… ${b.mint.slice(0, 6)}… ${d > 0 ? '+' : ''}${d}` : null;
  }).filter(Boolean);
  const anchor = (tx.meta?.logMessages ?? []).filter((l) => /Program log: (Instruction|AnchorError)|Program data:/.test(l)).slice(0, 6);
  console.log(`${sig}
  status ${st?.confirmationStatus ?? '?'}${tx.meta?.err ? `  ERROR ${JSON.stringify(tx.meta.err)}` : '  ok'} · slot ${tx.slot} · ${tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : ''}
  signers ${signers.join(', ')}
  programs ${programs.join(', ')}
  ${anchor.length ? `anchor ${anchor.join(' | ')}\n  ` : ''}${memos.length ? `memos ${memos.join(' | ')}\n  ` : ''}SOL Δ ${sol.map(([k, d]) => `${k.slice(0, 6)}… ${d > 0 ? '+' : ''}${d}`).join(', ')}
  ${tok.length ? `token Δ ${tok.join(', ')}\n  ` : ''}https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

(async () => {
  const a = process.argv.slice(2);
  if (a[0] === '--recent') {
    const sigs = await retry(() => conn.getSignaturesForAddress(new PublicKey(a[1]), { limit: Number(a[2] ?? 5) }));
    for (const s of sigs) { await show(s.signature); await new Promise((r) => setTimeout(r, 400)); }
  } else for (const s of a) { await show(s); await new Promise((r) => setTimeout(r, 400)); }
})().catch((e) => { console.error(e); process.exit(1); });
