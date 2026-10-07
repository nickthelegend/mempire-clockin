/**
 * Create the Mempire Season Pass config, Season 1 and the skin catalogue on a
 * cluster where mempire_pass is already deployed. Idempotent: anything that
 * exists is skipped.
 *
 *   npx tsx scripts/setup.ts --url http://127.0.0.1:4170 --admin .keys/test-admin.json [--fund <address>]
 *   npx tsx scripts/setup.ts --url https://api.devnet.solana.com --admin ~/.config/solana/id.json
 *
 * SKR: on devnet the pass is priced in the SKR stand-in from
 * mobile/src/data/skr-devnet.json when that has been set up; otherwise (and
 * always on localnet) a fresh 6-decimal classic SPL stand-in is created, with
 * the admin as mint authority, and recorded in .keys/<cluster>-skr.json.
 *
 * --fund (localnet only) airdrops SOL to an address and mints it 400 stand-in
 * SKR, so the app's dev wallet can buy on a local validator.
 */
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotent, createMint, getAssociatedTokenAddressSync, mintTo,
} from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { MempirePass } from '../target/types/mempire_pass';

const HERE = resolve(__dirname, '..');
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const url = arg('url', 'http://127.0.0.1:4170')!;
if (/mainnet/i.test(url)) throw new Error('devnet / localnet only');
const local = /127\.0\.0\.1|localhost/.test(url);
const clusterName = local ? 'localnet' : 'devnet';
const adminPath = (arg('admin', local ? join(HERE, '.keys/test-admin.json') : join(homedir(), '.config/solana/id.json'))!)
  .replace(/^~/, homedir());
const fund = arg('fund');

const RAW = 'https://raw.githubusercontent.com/nickthelegend/mempire-clockin/main/chain/pass/metadata';
const catalog = JSON.parse(readFileSync(join(HERE, '../../mobile/src/data/skins.json'), 'utf8')) as {
  arena: { id: number; key: string; name: string; symbol: string; price: number }[];
  frames: { id: number; key: string; name: string; symbol: string; price: number }[];
};
const SEASON = { id: 1, priceSkr: 150, endsAt: Date.UTC(2026, 10, 9) / 1000 }; // = mobile/src/game/season.ts
const SKR = 1_000_000;
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };

async function main() {
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(adminPath, 'utf8'))));
  const conn = new Connection(url, 'confirmed');
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(admin), { commitment: 'confirmed' });
  const idl = JSON.parse(readFileSync(join(HERE, 'target/idl/mempire_pass.json'), 'utf8'));
  const program = new Program<MempirePass>(idl, provider);
  const pid = program.programId;
  const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, pid)[0];
  const exists = async (k: PublicKey) => !!(await conn.getAccountInfo(k));

  const prog = await conn.getAccountInfo(pid);
  if (!prog?.executable) throw new Error(`mempire_pass ${pid.toBase58()} is not deployed on ${url}`);
  console.log(`cluster ${clusterName} · program ${pid.toBase58()} · admin ${admin.publicKey.toBase58()}`);
  if (local && (await conn.getBalance(admin.publicKey)) < LAMPORTS_PER_SOL) {
    await conn.confirmTransaction(await conn.requestAirdrop(admin.publicKey, 10 * LAMPORTS_PER_SOL), 'confirmed');
  }

  const config = pda(Buffer.from('config'));
  const treasury = pda(Buffer.from('treasury'));
  const mintAuthority = pda(Buffer.from('mint_auth'));
  mkdirSync(join(HERE, '.keys'), { recursive: true });
  const skrRecord = join(HERE, `.keys/${clusterName}-skr.json`);

  let skrMint: PublicKey;
  if (await exists(config)) {
    skrMint = (await program.account.config.fetch(config)).skrMint;
    console.log(`config exists · SKR mint ${skrMint.toBase58()}`);
  } else {
    const devnetSkr = join(HERE, '../../mobile/src/data/skr-devnet.json');
    const cfg = !local && existsSync(devnetSkr) ? JSON.parse(readFileSync(devnetSkr, 'utf8')) : null;
    if (cfg?.configured && cfg.mint) {
      skrMint = new PublicKey(cfg.mint);
      console.log(`using the devnet SKR stand-in ${skrMint.toBase58()}`);
    } else {
      skrMint = await createMint(conn, admin, admin.publicKey, null, 6);
      writeFileSync(skrRecord, JSON.stringify({ mint: skrMint.toBase58(), decimals: 6, mintAuthority: admin.publicKey.toBase58() }, null, 2));
      console.log(`created SKR stand-in ${skrMint.toBase58()} (recorded in .keys/)`);
    }
    await program.methods.initConfig()
      .accountsPartial({ admin: admin.publicKey, config, skrMint, treasury, mintAuthority, skrTokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    console.log(`config ${config.toBase58()} · treasury ${treasury.toBase58()}`);
  }

  const season = pda(Buffer.from('season'), u16(SEASON.id));
  const passMint = pda(Buffer.from('pass_mint'), u16(SEASON.id));
  if (!(await exists(season))) {
    const sig = await program.methods.initSeason(SEASON.id, new BN(SEASON.priceSkr * SKR), new BN(SEASON.endsAt), `${RAW}/season-${SEASON.id}.json`)
      .accountsPartial({ admin: admin.publicKey, config, season, passMint, mintAuthority })
      .rpc();
    console.log(`season ${SEASON.id} · pass mint ${passMint.toBase58()} · ${sig}`);
  } else console.log(`season ${SEASON.id} exists · pass mint ${passMint.toBase58()}`);

  for (const [kind, items] of [['arena', catalog.arena], ['frame', catalog.frames]] as const) {
    for (const it of items) {
      const skin = pda(Buffer.from('skin'), u16(it.id));
      const skinMint = pda(Buffer.from('skin_mint'), u16(it.id));
      if (await exists(skin)) { console.log(`skin ${it.id} ${it.name} exists`); continue; }
      await program.methods.initSkin(it.id, new BN(it.price * SKR), it.name, it.symbol, `${RAW}/skin-${it.id}.json`, kind, SEASON.id)
        .accountsPartial({ admin: admin.publicKey, config, skin, skinMint, mintAuthority })
        .rpc();
      console.log(`skin ${it.id} ${it.name} (${kind}) · mint ${skinMint.toBase58()}`);
    }
  }

  if (fund) {
    if (!local) throw new Error('--fund is localnet-only');
    const to = new PublicKey(fund);
    await conn.confirmTransaction(await conn.requestAirdrop(to, 2 * LAMPORTS_PER_SOL), 'confirmed');
    await createAssociatedTokenAccountIdempotent(conn, admin, skrMint, to);
    await mintTo(conn, admin, skrMint, getAssociatedTokenAddressSync(skrMint, to), admin, 400 * SKR);
    console.log(`funded ${fund}: 2 SOL + 400 SKR (local stand-in)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
