import { Buffer } from 'buffer';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction, getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import cfgJson from '../data/skr-devnet.json';
import { connection } from './solana';

/**
 * SKR in Mempire: earned by showing up, spent on keeping it up.
 *
 * Real SKR is `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` (mainnet, classic
 * SPL, 6 decimals) and does not exist on devnet. This build uses a devnet
 * stand-in with the same shape — classic SPL, 6 decimals, `transferChecked` —
 * created by `scripts/setup-skr-devnet.mjs`, and labels it "SKR (devnet
 * stand-in)" wherever it appears.
 *
 * Earning goes through the public devnet `spl-token-faucet` program, which
 * holds the stand-in's mint authority: the Clock-In transaction itself asks
 * it to mint the day's reward to the player. No key ships in the app.
 *
 * If the stand-in has not been deployed for this build (`configured: false`),
 * the app keeps a *simulated* balance instead and says so on every screen.
 */
interface SkrConfig {
  configured: boolean;
  label: string;
  mint?: string;
  decimals?: number;
  faucetProgram?: string;
  faucet?: string;
  faucetPda?: string;
  capRaw?: string;
  treasury?: string;
}
const cfg = cfgJson as SkrConfig;

export const SKR_MAINNET_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
export const SKR_LIVE = !!(cfg.configured && cfg.mint && cfg.faucet && cfg.faucetPda && cfg.faucetProgram && cfg.treasury);
export const SKR_LABEL = SKR_LIVE ? 'SKR (devnet stand-in)' : 'SKR (simulated)';
export const SKR_DECIMALS = cfg.decimals ?? 6;
export const SKR_MINT = SKR_LIVE ? new PublicKey(cfg.mint!) : null;
const UNIT = 10 ** SKR_DECIMALS;

export async function skrBalance(owner: string): Promise<number> {
  if (!SKR_MINT) return 0;
  const ata = getAssociatedTokenAddressSync(SKR_MINT, new PublicKey(owner));
  try {
    const b = await connection.getTokenAccountBalance(ata);
    return Number(b.value.amount) / UNIT;
  } catch {
    return 0; // no account yet = no SKR yet
  }
}

/** Instructions that mint `amount` stand-in SKR to `owner` from the public faucet. */
export function earnIxs(owner: PublicKey, amount: number): TransactionInstruction[] {
  if (!SKR_LIVE || !SKR_MINT) return [];
  const ata = getAssociatedTokenAddressSync(SKR_MINT, owner);
  const raw = BigInt(Math.round(amount * UNIT));
  const data = Buffer.alloc(9);
  data.writeUInt8(1, 0); // MintTokens
  // u64 little-endian, written by hand: the RN `buffer` polyfill's bigint
  // writers are not dependable across Hermes versions.
  for (let i = 0; i < 8; i++) data[1 + i] = Number((raw >> BigInt(8 * i)) & 0xffn);
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, SKR_MINT),
    new TransactionInstruction({
      programId: new PublicKey(cfg.faucetProgram!),
      keys: [
        { pubkey: new PublicKey(cfg.faucetPda!), isSigner: false, isWritable: false },
        { pubkey: SKR_MINT, isSigner: false, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(cfg.faucet!), isSigner: false, isWritable: false },
      ],
      data,
    }),
  ];
}

/** Instructions that pay `amount` SKR from `owner` to the game treasury. */
export function payIxs(owner: PublicKey, amount: number): TransactionInstruction[] {
  if (!SKR_LIVE || !SKR_MINT) return [];
  const from = getAssociatedTokenAddressSync(SKR_MINT, owner);
  const treasury = new PublicKey(cfg.treasury!);
  const to = getAssociatedTokenAddressSync(SKR_MINT, treasury, true);
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, to, treasury, SKR_MINT),
    createTransferCheckedInstruction(from, SKR_MINT, to, owner, BigInt(Math.round(amount * UNIT)), SKR_DECIMALS),
  ];
}
