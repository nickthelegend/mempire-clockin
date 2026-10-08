import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, TransactionInstruction, type Connection } from '@solana/web3.js';

/**
 * Reference accounts: fixed, read-only keys that Mempire puts in a class of
 * transactions so the whole class is one `getSignaturesForAddress(ref)` away —
 * a global, serverless index that anyone can read.
 *
 *  - DUEL_REF: every ghost-duel challenge, result and accept.
 *  - WAR_REF: every Clock-In (wallet- or session-signed) and every session
 *    link / revoke, so the Season War tally and the streak board can be
 *    computed from chain.
 *
 * Each is a PDA of the Memo program: no private key exists for it, nobody can
 * sign as it or move anything in or out of it. Memo v3 refuses non-signer
 * accounts and Memo v1 crashes on any account, so the key rides as an extra
 * read-only account on a 0-lamport transfer from the payer to themself (the
 * System program ignores extra accounts; wallets show "0 SOL to yourself").
 */
export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const MEMO_V1 = new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');

export const refPda = (name: string) =>
  PublicKey.findProgramAddressSync([Buffer.from('mempire'), Buffer.from(name), Buffer.from('v1')], MEMO_PROGRAM)[0];
export const DUEL_REF = refPda('duels');
export const WAR_REF = refPda('war');

/** Puts `ref` in the transaction's account keys, read-only and unsigned. */
export function refIx(payer: PublicKey, ref: PublicKey): TransactionInstruction {
  const ix = SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 });
  ix.keys.push({ pubkey: ref, isSigner: false, isWritable: false });
  return ix;
}

export function memoIx(signer: PublicKey, text: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, 'utf8'),
  });
}

/**
 * Unlogged, cheap memo (SPL Memo v1, no accounts) for bulky text: v1 only
 * checks UTF-8, so 700 characters cost ~1k compute units instead of ~280k
 * through Memo v3, which logs the text. The transaction is signed as a whole.
 */
export const dataIx = (text: string) => new TransactionInstruction({ programId: MEMO_V1, keys: [], data: Buffer.from(text, 'utf8') });

type RawTx = NonNullable<Awaited<ReturnType<Connection['getTransaction']>>>;

/** The memo texts (v3 and v1) a transaction carries, decoded from its instructions. */
export function memoTexts(tx: RawTx): string[] {
  const msg = tx.transaction.message;
  const keys = msg.staticAccountKeys;
  return msg.compiledInstructions
    .filter((ix) => keys[ix.programIdIndex]?.equals(MEMO_PROGRAM) || keys[ix.programIdIndex]?.equals(MEMO_V1))
    .map((ix) => Buffer.from(ix.data).toString('utf8'));
}

/** Who signed a transaction (base58), fee payer first. */
export const signersOf = (tx: RawTx) =>
  tx.transaction.message.staticAccountKeys.slice(0, tx.transaction.message.header.numRequiredSignatures).map((k) => k.toBase58());
