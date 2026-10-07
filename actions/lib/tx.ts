import {
  PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';

/**
 * Pure builders for the Mempire Solana Actions (Blinks). Devnet only.
 * Shared by the Vercel functions in ../api and by app/tests/blink-actions.test.ts.
 */
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
export const BLOCKCHAIN_ID = `solana:${DEVNET_GENESIS}`;
export const ACTION_VERSION = '2.4';
export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** The four AI rivals in the app, by index (mobile/src/game/rules.ts RIVALS). */
export const RIVALS = [
  { slug: 'doggo-pack', name: 'Doggo Pack', blurb: 'Easier' },
  { slug: 'blue-chips', name: 'Blue Chips', blurb: 'Even' },
  { slug: 'degen-swarm', name: 'Degen Swarm', blurb: 'Even' },
  { slug: 'whale-court', name: 'Whale Court', blurb: 'Harder' },
] as const;

export function rivalIndex(q: string | null | undefined): number {
  if (q == null || q === '') return 1;
  const n = Number(q);
  if (Number.isInteger(n) && n >= 0 && n < RIVALS.length) return n;
  const i = RIVALS.findIndex((r) => r.slug === q);
  if (i < 0) throw new Error(`unknown rival "${q}"`);
  return i;
}

export const deepLink = (rival: number, rush = false) => `mempire://battle?rival=${rival}${rush ? '&rush=1' : ''}`;
export const challengeMemoText = (rival: number) => `mempire:challenge:v1:${RIVALS[rival].slug}`;

export function parseAccount(body: unknown): PublicKey {
  const a = (body as { account?: unknown } | null)?.account;
  if (typeof a !== 'string') throw new Error('body.account (base58 public key) is required');
  try { return new PublicKey(a); } catch { throw new Error('body.account is not a valid public key'); }
}

/** One memo, signed by the challenger (also the fee payer). Unsigned, base64. */
export function challengeTx(account: PublicKey, rival: number, blockhash: string): string {
  const ix = new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: account, isSigner: true, isWritable: false }],
    data: Buffer.from(challengeMemoText(rival), 'utf8'),
  });
  const msg = new TransactionMessage({ payerKey: account, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString('base64');
}

// ── Season Pass (mempire_pass, from the season-pass work) ───────────────────
// Same derivations and account order as mobile/src/chain/pass.ts; a test
// checks the two builders produce the identical instruction.

export const PASS_PROGRAM = new PublicKey('3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G');
export const SEASON_ID = 1;
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const BUY_PASS = [57, 144, 218, 182, 67, 42, 234, 124];

const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; };
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, PASS_PROGRAM)[0];
const ata = (mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];

export const PASS_CONFIG = pda(Buffer.from('config'));
export const seasonPda = (id = SEASON_ID) => pda(Buffer.from('season'), u16(id));
export const passMint = (id = SEASON_ID) => pda(Buffer.from('pass_mint'), u16(id));

export interface PassChain { skrMint: PublicKey; treasury: PublicKey; priceSkr: number; endsAt: number }

/** Parse config + season accounts (layouts as in mobile/src/chain/pass.ts). */
export function parsePassChain(config: Uint8Array, season: Uint8Array): PassChain {
  const c = Buffer.from(config);
  const s = Buffer.from(season);
  let price = 0;
  for (let i = 7; i >= 0; i--) price = price * 256 + s[10 + i];
  return {
    skrMint: new PublicKey(c.subarray(40, 72)),
    treasury: new PublicKey(c.subarray(72, 104)),
    priceSkr: price / 1_000_000,
    endsAt: s.readInt32LE(22) * 2 ** 32 + s.readUInt32LE(18),
  };
}

export function buyPassIx(buyer: PublicKey, chain: Pick<PassChain, 'skrMint' | 'treasury'>, id = SEASON_ID): TransactionInstruction {
  const season = seasonPda(id);
  const mint = passMint(id);
  const receipt = pda(Buffer.from('pass_receipt'), season.toBuffer(), buyer.toBuffer());
  const k = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
  return new TransactionInstruction({
    programId: PASS_PROGRAM,
    keys: [
      k(buyer, true, true),
      k(PASS_CONFIG),
      k(season, true),
      k(mint, true),
      k(receipt, true),
      k(ata(mint, buyer, TOKEN_2022), true),
      k(chain.skrMint),
      k(ata(chain.skrMint, buyer, TOKEN_PROGRAM), true),
      k(chain.treasury, true),
      k(pda(Buffer.from('mint_auth'))),
      k(TOKEN_PROGRAM),
      k(TOKEN_2022),
      k(ATA_PROGRAM),
      k(SystemProgram.programId),
    ],
    data: Buffer.concat([Buffer.from(BUY_PASS), u16(id)]),
  });
}

export function passTx(buyer: PublicKey, chain: PassChain, blockhash: string): string {
  const msg = new TransactionMessage({ payerKey: buyer, recentBlockhash: blockhash, instructions: [buyPassIx(buyer, chain)] }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString('base64');
}
