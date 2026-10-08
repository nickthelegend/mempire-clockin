import { describe, expect, it } from 'vitest';
import { PublicKey, TransactionMessage, TransactionInstruction, type VersionedTransactionResponse } from '@solana/web3.js';
import { ownerClockIn } from '../../mobile/src/chain/clockInLedger';
const owner = new PublicKey('11111111111111111111111111111112');
const attacker = new PublicKey('11111111111111111111111111111113');
const memo = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const text = 'mempire:clockin:v1:day=20261008:streak=4';
function transaction(o: { signed?: boolean; includesOwner?: boolean; data?: string; program?: PublicKey; failed?: boolean; legacy?: boolean } = {}) {
  const message = new TransactionMessage({
    payerKey: o.signed === false ? attacker : owner,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [new TransactionInstruction({
      programId: o.program ?? memo,
      keys: o.includesOwner === false ? [] : [{ pubkey: owner, isSigner: o.signed !== false, isWritable: false }],
      data: Buffer.from(o.data ?? text),
    })],
  });
  return { meta: { err: o.failed ? { InstructionError: [0, 'InvalidArgument'] } : null },
    transaction: { message: o.legacy ? message.compileToLegacyMessage() : message.compileToV0Message() },
  } as unknown as VersionedTransactionResponse;
}
describe('owner Clock-In chain evidence', () => {
  it.each([false, true])('accepts an owner-signed Memo (legacy=%s)', (legacy) => {
    expect(ownerClockIn(owner.toBase58(), 'sig', transaction({ legacy }))).toEqual({ day: 20261008, streak: 4, sig: 'sig' });
  });
  it('accepts a signed season pledge', () => {
    expect(ownerClockIn(owner.toBase58(), 'sig', transaction({ data: `${text}:war=1:side=BONK` }))?.streak).toBe(4);
  });
  it('rejects an attacker naming the wallet as a nonsigner', () => {
    expect(ownerClockIn(owner.toBase58(), 'sig', transaction({ signed: false }))).toBeNull();
  });
  it('requires the owner in the memo accounts even when it pays the fee', () => {
    expect(ownerClockIn(owner.toBase58(), 'sig', transaction({ includesOwner: false }))).toBeNull();
  });
  it('rejects another program carrying Clock-In text', () => {
    expect(ownerClockIn(owner.toBase58(), 'sig', transaction({ program: attacker }))).toBeNull();
  });
  it('rejects failed and unavailable transactions', () => {
    expect(ownerClockIn(owner.toBase58(), 'sig', transaction({ failed: true }))).toBeNull();
    expect(ownerClockIn(owner.toBase58(), 'sig', null)).toBeNull();
  });
  it.each([`${text}:owner=${owner}`, 'mempire:clockin:v1:day=20260230:streak=1', 'mempire:clockin:v1:day=20261008:streak=0', `junk ${text}`, `${text}:streak=999`])('rejects unsupported or malformed memo %s', (data) => {
    expect(ownerClockIn(owner.toBase58(), 'sig', transaction({ data }))).toBeNull();
  });
});
