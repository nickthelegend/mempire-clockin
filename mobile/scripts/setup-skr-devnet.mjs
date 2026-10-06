#!/usr/bin/env node
/**
 * One command: create the "SKR (devnet stand-in)" token and its public faucet.
 *
 *   node scripts/setup-skr-devnet.mjs            # from mobile/
 *   KEYPAIR=~/.config/solana/mempire-clockin/deployer.json node scripts/setup-skr-devnet.mjs
 *
 * Real SKR (SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3, classic SPL, 6 decimals)
 * does not exist on devnet, so the app uses a stand-in with the same shape:
 * a classic SPL mint, 6 decimals, moved with `transferChecked`.
 *
 * Players earn it without the app holding any secret key. The mint authority
 * is handed to the public devnet `spl-token-faucet` program
 * (4bXpkKSV8swHSnwqtzuboGPaPDeEgAn4Vt8GfarV5rZt), whose PDA can mint up to a
 * per-request cap to anyone who asks. That is what a worthless devnet stand-in
 * should look like: no key in the APK, no server, and nothing of value to
 * drain. The app labels it "SKR (devnet stand-in)" everywhere it appears.
 *
 * Writes src/data/skr-devnet.json, which the app reads at build time. Costs
 * about 0.007 devnet SOL. Idempotent: an existing config is left alone unless
 * FORCE=1.
 */
import {
  Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY,
  Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  AuthorityType, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction, createSetAuthorityInstruction,
  getAssociatedTokenAddressSync, getMinimumBalanceForRentExemptMint, MINT_SIZE,
} from '@solana/spl-token';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT ?? join(HERE, '..', 'src', 'data', 'skr-devnet.json');
const RPC = process.env.RPC ?? 'https://api.devnet.solana.com';
const KEYPAIR = (process.env.KEYPAIR ?? '~/.config/solana/mempire-clockin/deployer.json')
  .replace(/^~/, homedir());
const FAUCET_PROGRAM = new PublicKey('4bXpkKSV8swHSnwqtzuboGPaPDeEgAn4Vt8GfarV5rZt');
const DECIMALS = 6;
/** Most a single faucet request may mint: 100 SKR. The app asks for far less. */
const CAP_RAW = 100n * 10n ** BigInt(DECIMALS);
const FAUCET_SIZE = 77; // is_initialized u8 + admin COption<Pubkey> + mint + amount u64

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
if (existing?.configured && !process.env.FORCE) {
  console.log(`already configured: ${OUT}\n${readFileSync(OUT, 'utf8')}`);
  process.exit(0);
}
if (/mainnet/i.test(RPC)) throw new Error('devnet only');
const LOCAL = /127\.0\.0\.1|localhost/.test(RPC);

const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR, 'utf8'))));
const conn = new Connection(RPC, 'confirmed');
const bal = await conn.getBalance(payer.publicKey);
console.log(`payer ${payer.publicKey.toBase58()} has ${bal / 1e9} SOL`);
if (bal < 10_000_000) {
  throw new Error(`fund ${payer.publicKey.toBase58()} with >= 0.01 devnet SOL first (faucet.solana.com)`);
}

const mint = Keypair.generate();
const faucet = Keypair.generate();
const [faucetPda] = PublicKey.findProgramAddressSync([Buffer.from('faucet')], FAUCET_PROGRAM);
const treasury = payer.publicKey;
const treasuryAta = getAssociatedTokenAddressSync(mint.publicKey, treasury);

// 1. The mint, with the deployer as temporary authority, and the treasury's
//    account that SKR payments land in.
const tx1 = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: payer.publicKey, newAccountPubkey: mint.publicKey, space: MINT_SIZE,
    lamports: await getMinimumBalanceForRentExemptMint(conn), programId: TOKEN_PROGRAM_ID,
  }),
  createInitializeMint2Instruction(mint.publicKey, DECIMALS, payer.publicKey, null),
  createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, treasuryAta, treasury, mint.publicKey),
);
const sig1 = await sendAndConfirmTransaction(conn, tx1, [payer, mint]);
console.log('mint created', mint.publicKey.toBase58(), sig1);

// 2. Hand minting to the faucet PDA and initialise the faucet with its cap.
const data = Buffer.alloc(9);
data.writeUInt8(0, 0); // InitFaucet
data.writeBigUInt64LE(CAP_RAW, 1);
const tx2 = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: payer.publicKey, newAccountPubkey: faucet.publicKey, space: FAUCET_SIZE,
    lamports: await conn.getMinimumBalanceForRentExemption(FAUCET_SIZE), programId: FAUCET_PROGRAM,
  }),
  createSetAuthorityInstruction(mint.publicKey, payer.publicKey, AuthorityType.MintTokens, faucetPda),
  new TransactionInstruction({
    programId: FAUCET_PROGRAM,
    // InitFaucet accounts: [mint (authority already = PDA), faucet (w), rent]
    // — order verified against the live program by scripts/verify-local.sh.
    keys: [
      { pubkey: mint.publicKey, isSigner: false, isWritable: false },
      { pubkey: faucet.publicKey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  }),
);
const sig2 = await sendAndConfirmTransaction(conn, tx2, [payer, faucet]);
console.log('faucet initialised', faucet.publicKey.toBase58(), sig2);

const cfg = {
  configured: true,
  label: 'SKR (devnet stand-in)',
  note: 'Not real SKR. Real SKR is SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3 on mainnet; this devnet mint has the same decimals and token program.',
  cluster: LOCAL ? 'localnet' : 'devnet',
  mint: mint.publicKey.toBase58(),
  decimals: DECIMALS,
  faucetProgram: FAUCET_PROGRAM.toBase58(),
  faucet: faucet.publicKey.toBase58(),
  faucetPda: faucetPda.toBase58(),
  capRaw: CAP_RAW.toString(),
  treasury: treasury.toBase58(),
  treasuryAta: treasuryAta.toBase58(),
  txs: [sig1, sig2],
  createdAt: new Date().toISOString(),
};
writeFileSync(OUT, `${JSON.stringify(cfg, null, 2)}\n`);
console.log(`wrote ${OUT}`);
