import type { Connection } from '@solana/web3.js';

export type FetchedTx = Awaited<ReturnType<Connection['getTransaction']>>;

/**
 * `getTransactions` for a list of signatures, aligned to that list by each
 * transaction's own signature. A JSON-RPC batch may answer out of order (the
 * public devnet RPC does), so pairing by array index can pin one transaction's
 * memo on another's signature. A signature the batch did not answer is null.
 */
export async function getTxsBySig(conn: Connection, sigs: string[]): Promise<FetchedTx[]> {
  if (!sigs.length) return [];
  const txs = await conn.getTransactions(sigs, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  const bySig = new Map<string, NonNullable<FetchedTx>>();
  for (const tx of txs) if (tx) bySig.set(tx.transaction.signatures[0], tx);
  return sigs.map((s) => bySig.get(s) ?? null);
}
