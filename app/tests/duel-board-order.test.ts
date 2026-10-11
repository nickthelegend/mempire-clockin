/**
 * The duel board pairs each transaction with its own signature, even when the
 * RPC answers a batch out of order (the public devnet RPC did, which left a
 * challenger's own row at "No fights yet" after a result was posted).
 *
 *   cd app && npx vitest run tests/duel-board-order.test.ts
 */
import { describe, expect, it } from 'vitest';
import { getTxsBySig } from '../../mobile/src/chain/txs';

const fake = (sig: string) => ({ transaction: { signatures: [sig] }, meta: { err: null } });

describe('getTxsBySig', () => {
  it('aligns a reordered batch to the requested signatures', async () => {
    const conn = { getTransactions: async (sigs: string[]) => [...sigs].reverse().map(fake) } as never;
    const out = await getTxsBySig(conn, ['a', 'b', 'c']);
    expect(out.map((t) => t?.transaction.signatures[0])).toEqual(['a', 'b', 'c']);
  });
  it('leaves a missing answer as null instead of shifting the rest', async () => {
    const conn = { getTransactions: async () => [null, fake('c'), fake('a')] } as never;
    const out = await getTxsBySig(conn, ['a', 'b', 'c']);
    expect(out.map((t) => t?.transaction.signatures[0] ?? null)).toEqual(['a', null, 'c']);
  });
  it('makes no request for an empty list', async () => {
    const conn = { getTransactions: async () => { throw new Error('called'); } } as never;
    expect(await getTxsBySig(conn, [])).toEqual([]);
  });
});
