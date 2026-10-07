import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import {
  ExtensionType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAccount, createMint,
  createAssociatedTokenAccountIdempotent, getAccount, getAssociatedTokenAddressSync, getExtensionTypes,
  getMint, getTokenMetadata, mintTo, transferChecked,
} from '@solana/spl-token';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { expect } from 'chai';
import type { MempirePass } from '../target/types/mempire_pass';

const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const SKR = 1_000_000; // 6 decimals

describe('mempire_pass (localnet)', () => {
  const envp = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(envp.connection.rpcEndpoint, 'confirmed'),
    envp.wallet,
    { commitment: 'confirmed', preflightCommitment: 'confirmed' },
  );
  anchor.setProvider(provider);
  const program = anchor.workspace.MempirePass as Program<MempirePass>;
  const conn = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;
  const pid = program.programId;
  const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, pid)[0];

  const config = pda(Buffer.from('config'));
  const treasury = pda(Buffer.from('treasury'));
  const mintAuth = pda(Buffer.from('mint_auth'));
  const season1 = pda(Buffer.from('season'), u16(1));
  const passMint1 = pda(Buffer.from('pass_mint'), u16(1));
  const season2 = pda(Buffer.from('season'), u16(2));
  const passMint2 = pda(Buffer.from('pass_mint'), u16(2));
  const skin1 = pda(Buffer.from('skin'), u16(1));
  const skinMint1 = pda(Buffer.from('skin_mint'), u16(1));

  const PRICE = 150 * SKR;
  const SKIN_PRICE = 60 * SKR;
  let skrMint: PublicKey;
  const rich = Keypair.generate();
  const poor = Keypair.generate();
  const friend = Keypair.generate();

  const airdrop = async (to: PublicKey, sol = 2) => {
    const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
    await conn.confirmTransaction({ signature: sig, ...(await conn.getLatestBlockhash()) }, 'confirmed');
  };
  const skrAta = (owner: PublicKey) => getAssociatedTokenAddressSync(skrMint, owner);
  const passAta = (owner: PublicKey, mint = passMint1) =>
    getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);

  const buyPass = (buyer: Keypair, sid = 1) => {
    const season = sid === 1 ? season1 : season2;
    const mint = sid === 1 ? passMint1 : passMint2;
    return program.methods.buyPass(sid).accountsPartial({
      buyer: buyer.publicKey, config, season, passMint: mint,
      receipt: pda(Buffer.from('pass_receipt'), season.toBuffer(), buyer.publicKey.toBuffer()),
      buyerPass: passAta(buyer.publicKey, mint), skrMint, buyerSkr: skrAta(buyer.publicKey), treasury,
      mintAuthority: mintAuth, skrTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_2022_PROGRAM_ID,
    }).signers([buyer]).rpc();
  };
  const buySkin = (buyer: Keypair) => program.methods.buySkin(1).accountsPartial({
    buyer: buyer.publicKey, config, skin: skin1, skinMint: skinMint1,
    receipt: pda(Buffer.from('skin_receipt'), skin1.toBuffer(), buyer.publicKey.toBuffer()),
    buyerSkin: getAssociatedTokenAddressSync(skinMint1, buyer.publicKey, false, TOKEN_2022_PROGRAM_ID),
    skrMint, buyerSkr: skrAta(buyer.publicKey), treasury, mintAuthority: mintAuth,
    skrTokenProgram: TOKEN_PROGRAM_ID, tokenProgram: TOKEN_2022_PROGRAM_ID,
  }).signers([buyer]).rpc();

  const expectFail = async (p: Promise<unknown>, re: RegExp) => {
    try { await p; } catch (e) {
      const msg = `${(e as Error).message} ${((e as { logs?: string[] }).logs ?? []).join(' ')}`;
      expect(msg).to.match(re);
      return;
    }
    expect.fail('expected the transaction to fail');
  };

  before(async () => {
    await Promise.all([rich, poor, friend].map((k) => airdrop(k.publicKey)));
    // A local stand-in for SKR: classic SPL, 6 decimals (the same shape as real SKR).
    skrMint = await createMint(conn, admin, admin.publicKey, null, 6);
    for (const [k, amt] of [[rich, 300], [poor, 10]] as const) {
      await createAssociatedTokenAccountIdempotent(conn, admin, skrMint, k.publicKey);
      await mintTo(conn, admin, skrMint, skrAta(k.publicKey), admin, amt * SKR);
    }
  });

  it('initialises config with a treasury vault PDA', async () => {
    await program.methods.initConfig().accountsPartial({
      admin: admin.publicKey, config, skrMint, treasury, mintAuthority: mintAuth, skrTokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();
    const c = await program.account.config.fetch(config);
    expect(c.skrMint.toBase58()).to.eq(skrMint.toBase58());
    expect(c.treasury.toBase58()).to.eq(treasury.toBase58());
  });

  it('creates Season 1 as a soulbound Token-2022 mint with on-chain metadata', async () => {
    const endsAt = Math.floor(Date.now() / 1000) + 30 * 86400;
    await program.methods.initSeason(1, new BN(PRICE), new BN(endsAt), 'https://example.invalid/season-1.json')
      .accountsPartial({ admin: admin.publicKey, config, season: season1, passMint: passMint1, mintAuthority: mintAuth })
      .rpc();
    const mint = await getMint(conn, passMint1, 'confirmed', TOKEN_2022_PROGRAM_ID);
    expect(mint.decimals).to.eq(0);
    expect(mint.mintAuthority!.toBase58()).to.eq(mintAuth.toBase58());
    const exts = getExtensionTypes(mint.tlvData);
    expect(exts).to.include.members([ExtensionType.NonTransferable, ExtensionType.MetadataPointer, ExtensionType.TokenMetadata]);
    const md = await getTokenMetadata(conn, passMint1, 'confirmed', TOKEN_2022_PROGRAM_ID);
    expect(md!.name).to.eq('Mempire Season 1 Pass');
    expect(md!.symbol).to.eq('MPASS');
    const extra = Object.fromEntries(md!.additionalMetadata);
    expect(extra.season).to.eq('1');
    expect(extra.tier).to.eq('premium');
    expect(extra.ends_at).to.eq(String(endsAt));
  });

  it('buys the pass in one instruction: SKR to the treasury, 1 pass token to the buyer', async () => {
    await buyPass(rich);
    expect(Number((await getAccount(conn, passAta(rich.publicKey), 'confirmed', TOKEN_2022_PROGRAM_ID)).amount)).to.eq(1);
    expect(Number((await getAccount(conn, skrAta(rich.publicKey))).amount)).to.eq(150 * SKR);
    expect(Number((await getAccount(conn, treasury)).amount)).to.eq(PRICE);
    const s = await program.account.season.fetch(season1);
    expect(s.sold).to.eq(1);
  });

  it('rejects a second purchase of the same season', async () => {
    await expectFail(buyPass(rich), /already in use|custom program error: 0x0/);
    expect(Number((await getAccount(conn, treasury)).amount)).to.eq(PRICE);
  });

  it('rejects a buyer without enough SKR', async () => {
    await expectFail(buyPass(poor), /InsufficientSkr|Not enough SKR/);
  });

  it('the pass is soulbound: a transfer is refused by Token-2022', async () => {
    const dest = await createAssociatedTokenAccountIdempotent(conn, admin, passMint1, friend.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    await expectFail(
      transferChecked(conn, rich, passAta(rich.publicKey), passMint1, dest, rich, 1, 0, [], {}, TOKEN_2022_PROGRAM_ID),
      /0x25|non-transferable|NonTransferable/i,
    );
  });

  it('refuses a pass for a season that has ended', async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    await program.methods.initSeason(2, new BN(PRICE), new BN(past), 'https://example.invalid/season-2.json')
      .accountsPartial({ admin: admin.publicKey, config, season: season2, passMint: passMint2, mintAuthority: mintAuth })
      .rpc();
    await expectFail(buyPass(rich, 2), /SeasonOver|season has ended/);
  });

  it('only the admin can create a season', async () => {
    const s3 = pda(Buffer.from('season'), u16(3));
    await expectFail(
      program.methods.initSeason(3, new BN(1), new BN(9_999_999_999), 'x')
        .accountsPartial({ admin: rich.publicKey, config, season: s3, passMint: pda(Buffer.from('pass_mint'), u16(3)), mintAuthority: mintAuth })
        .signers([rich]).rpc(),
      /NotAdmin|has_one|2001/,
    );
  });

  it('creates a transferable skin with metadata, sells it once per player', async () => {
    await program.methods.initSkin(1, new BN(SKIN_PRICE), 'Neon Night', 'MSKIN', 'https://example.invalid/skin-1.json', 'arena', 1)
      .accountsPartial({ admin: admin.publicKey, config, skin: skin1, skinMint: skinMint1, mintAuthority: mintAuth })
      .rpc();
    const mint = await getMint(conn, skinMint1, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const exts = getExtensionTypes(mint.tlvData);
    expect(exts).to.include.members([ExtensionType.MetadataPointer, ExtensionType.TokenMetadata]);
    expect(exts).to.not.include(ExtensionType.NonTransferable);
    const md = await getTokenMetadata(conn, skinMint1, 'confirmed', TOKEN_2022_PROGRAM_ID);
    expect(md!.name).to.eq('Neon Night');
    expect(Object.fromEntries(md!.additionalMetadata).skin_type).to.eq('arena');

    await buySkin(rich);
    const ata = getAssociatedTokenAddressSync(skinMint1, rich.publicKey, false, TOKEN_2022_PROGRAM_ID);
    expect(Number((await getAccount(conn, ata, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount)).to.eq(1);
    await expectFail(buySkin(rich), /already in use|custom program error: 0x0/);

    // Unlike the pass, a skin can be traded.
    const dest = await createAccount(conn, admin, skinMint1, friend.publicKey, Keypair.generate(), {}, TOKEN_2022_PROGRAM_ID);
    await transferChecked(conn, rich, ata, skinMint1, dest, rich, 1, 0, [], {}, TOKEN_2022_PROGRAM_ID);
    expect(Number((await getAccount(conn, dest, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount)).to.eq(1);
  });

  it('the treasury holds exactly what was paid', async () => {
    expect(Number((await getAccount(conn, treasury)).amount)).to.eq(PRICE + SKIN_PRICE);
    expect(Number((await getAccount(conn, skrAta(rich.publicKey))).amount)).to.eq((300 - 150 - 60) * SKR);
    expect(Number((await getAccount(conn, skrAta(poor.publicKey))).amount)).to.eq(10 * SKR);
  });
});
