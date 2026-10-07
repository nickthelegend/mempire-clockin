import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { create } from 'zustand';
import passCfg from '../data/pass.json';
import catalog from '../data/skins.json';
import { connection } from './solana';

/**
 * Client for the `mempire_pass` program (chain/pass): the soulbound Season
 * Pass and the skins, both Token-2022 mints with on-chain metadata, sold for
 * SKR in one instruction.
 *
 * Ownership is never stored by the app. Premium and skins are what
 * `getTokenAccountsByOwner(owner, Token-2022)` says the wallet holds right
 * now. When the program or its config is not on the cluster the app talks to
 * (devnet before the deploy), everything shows as preview and nothing can be
 * bought or claimed as premium.
 */
export const PASS_PROGRAM = new PublicKey(passCfg.programId);
export const SEASON_ID = passCfg.season;
const SKR_UNIT = 1_000_000;

export interface SkinDef { id: number; key: string; name: string; symbol: string; price: number; colors: [string, string] }
export const ARENA_SKINS = catalog.arena as SkinDef[];
export const FRAME_SKINS = catalog.frames as SkinDef[];
export const ALL_SKINS = [...ARENA_SKINS, ...FRAME_SKINS];

const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; };
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, PASS_PROGRAM)[0];

export const CONFIG = pda(Buffer.from('config'));
export const TREASURY = pda(Buffer.from('treasury'));
export const MINT_AUTH = pda(Buffer.from('mint_auth'));
export const seasonPda = (id: number) => pda(Buffer.from('season'), u16(id));
export const passMint = (id: number) => pda(Buffer.from('pass_mint'), u16(id));
export const skinPda = (id: number) => pda(Buffer.from('skin'), u16(id));
export const skinMint = (id: number) => pda(Buffer.from('skin_mint'), u16(id));

// Anchor instruction discriminators, from chain/pass/idl/mempire_pass.json.
const DISC = {
  buyPass: [57, 144, 218, 182, 67, 42, 234, 124],
  buySkin: [160, 172, 148, 145, 46, 58, 70, 228],
};

function readU64(b: Buffer, o: number): number {
  let v = 0;
  for (let i = 7; i >= 0; i--) v = v * 256 + b[o + i];
  return v;
}
function readI64(b: Buffer, o: number): number {
  const hi = b.readInt32LE(o + 4);
  return hi * 2 ** 32 + b.readUInt32LE(o);
}

export interface PassChain {
  skrMint: PublicKey;
  treasury: PublicKey;
  season: { id: number; priceSkr: number; endsAt: number; mint: PublicKey; sold: number } | null;
  skins: Record<number, { priceSkr: number; mint: PublicKey; sold: number }>;
}

/** Read config, Season and skins. null = the program/config is not on this cluster. */
export async function readPassChain(): Promise<PassChain | null> {
  const [prog, cfg] = await connection.getMultipleAccountsInfo([PASS_PROGRAM, CONFIG]);
  if (!prog?.executable || !cfg) return null;
  const c = Buffer.from(cfg.data);
  // 8 discriminator · admin 32 · skr_mint 32 · treasury 32 · bump · mint_auth_bump
  const skrMint = new PublicKey(c.subarray(40, 72));
  const treasury = new PublicKey(c.subarray(72, 104));
  const ids = ALL_SKINS.map((s) => s.id);
  const infos = await connection.getMultipleAccountsInfo([seasonPda(SEASON_ID), ...ids.map(skinPda)]);
  const [sInfo, ...skinInfos] = infos;
  let season: PassChain['season'] = null;
  if (sInfo) {
    const b = Buffer.from(sInfo.data);
    // 8 · season_id u16 · price u64 · ends_at i64 · mint 32 · sold u32 · bump
    season = {
      id: b.readUInt16LE(8), priceSkr: readU64(b, 10) / SKR_UNIT, endsAt: readI64(b, 18),
      mint: new PublicKey(b.subarray(26, 58)), sold: b.readUInt32LE(58),
    };
  }
  const skins: PassChain['skins'] = {};
  skinInfos.forEach((info, i) => {
    if (!info) return;
    const b = Buffer.from(info.data);
    // 8 · skin_id u16 · price u64 · mint 32 · sold u32 · bump
    skins[ids[i]] = { priceSkr: readU64(b, 10) / SKR_UNIT, mint: new PublicKey(b.subarray(18, 50)), sold: b.readUInt32LE(50) };
  });
  return { skrMint, treasury, season, skins };
}

/** Token-2022 mints this wallet holds at least one of. */
export async function heldToken2022(owner: string): Promise<Set<string>> {
  const res = await connection.getTokenAccountsByOwner(new PublicKey(owner), { programId: TOKEN_2022_PROGRAM_ID });
  const out = new Set<string>();
  for (const { account } of res.value) {
    const d = Buffer.from(account.data);
    // Token account layout: mint 0..32 · owner 32..64 · amount u64 64..72
    if (readU64(d, 64) > 0) out.add(new PublicKey(d.subarray(0, 32)).toBase58());
  }
  return out;
}

export async function skrOnChain(owner: string, mint: PublicKey): Promise<number> {
  try {
    const b = await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(mint, new PublicKey(owner)));
    return Number(b.value.amount) / SKR_UNIT;
  } catch {
    return 0;
  }
}

function buyIx(kind: 'pass' | 'skin', id: number, buyer: PublicKey, chain: PassChain): TransactionInstruction {
  const item = kind === 'pass' ? seasonPda(id) : skinPda(id);
  const mint = kind === 'pass' ? passMint(id) : skinMint(id);
  const receipt = pda(Buffer.from(kind === 'pass' ? 'pass_receipt' : 'skin_receipt'), item.toBuffer(), buyer.toBuffer());
  const data = Buffer.concat([Buffer.from(kind === 'pass' ? DISC.buyPass : DISC.buySkin), u16(id)]);
  const k = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
  // Account order = BuyPass / BuySkin in chain/pass/programs/mempire-pass/src/lib.rs.
  return new TransactionInstruction({
    programId: PASS_PROGRAM,
    keys: [
      k(buyer, true, true),
      k(CONFIG),
      k(item, true),
      k(mint, true),
      k(receipt, true),
      k(getAssociatedTokenAddressSync(mint, buyer, false, TOKEN_2022_PROGRAM_ID), true),
      k(chain.skrMint),
      k(getAssociatedTokenAddressSync(chain.skrMint, buyer), true),
      k(chain.treasury, true),
      k(MINT_AUTH),
      k(TOKEN_PROGRAM_ID),
      k(TOKEN_2022_PROGRAM_ID),
      k(ASSOCIATED_TOKEN_PROGRAM_ID),
      k(SystemProgram.programId),
    ],
    data,
  });
}
export const buyPassIx = (buyer: PublicKey, chain: PassChain) => buyIx('pass', SEASON_ID, buyer, chain);
export const buySkinIx = (skinId: number, buyer: PublicKey, chain: PassChain) => buyIx('skin', skinId, buyer, chain);

// ── live view of what the chain says ────────────────────────────────────────

export type PassStatus = 'idle' | 'loading' | 'live' | 'preview' | 'offline';

interface PassStore {
  status: PassStatus;
  /** Who the ownership below belongs to. */
  owner: string | null;
  chain: PassChain | null;
  held: Set<string>;
  skr: number | null;
  checkedAt: number | null;
  refresh: (owner: string | null) => Promise<void>;
}

export const usePassChain = create<PassStore>((set, get) => ({
  status: 'idle',
  owner: null,
  chain: null,
  held: new Set(),
  skr: null,
  checkedAt: null,
  refresh: async (owner) => {
    if (!owner) { set({ status: 'idle', owner: null, held: new Set(), skr: null, chain: null }); return; }
    if (get().owner !== owner) set({ owner, held: new Set(), skr: null, status: 'idle' });
    // A re-check keeps showing the last live read until the new one lands.
    if (get().status !== 'live') set({ status: 'loading' });
    try {
      const chain = await readPassChain();
      if (!chain) { if (get().owner === owner) set({ status: 'preview', chain: null, held: new Set(), checkedAt: Date.now() }); return; }
      const [held, skr] = await Promise.all([heldToken2022(owner), skrOnChain(owner, chain.skrMint)]);
      if (get().owner === owner) set({ status: 'live', chain, held, skr, checkedAt: Date.now() });
    } catch {
      // Unreachable RPC: nothing is shown as owned. Never fake ownership.
      if (get().owner === owner) set({ status: 'offline', held: new Set() });
    }
  },
}));

/** Premium = the wallet holds this season's soulbound pass (live read). */
export const hasPremium = (s: Pick<PassStore, 'status' | 'held'>) =>
  s.status === 'live' && s.held.has(passMint(SEASON_ID).toBase58());

export const ownsSkin = (s: Pick<PassStore, 'status' | 'held'>, id: number) =>
  s.status === 'live' && s.held.has(skinMint(id).toBase58());

export const skinByKey = (key: string) => ALL_SKINS.find((s) => s.key === key);
