//! Mempire Season Pass and skins.
//!
//! * A **Season Pass** is a Token-2022 mint with the `NonTransferable`,
//!   `MetadataPointer` and `TokenMetadata` extensions: a soulbound token whose
//!   name, symbol, uri and extra fields (`season`, `tier`, `ends_at`) live on the
//!   mint itself. Holding one unlocks the premium track in the app.
//! * A **skin** is a Token-2022 mint with `MetadataPointer` + `TokenMetadata`
//!   (transferable, so it can be traded later), with `skin_type` / `skin_id`
//!   in the additional metadata.
//!
//! Both are sold for SKR (a classic SPL token, the devnet stand-in mint is set
//! in `Config`) in ONE instruction: SKR moves buyer -> treasury vault PDA, then
//! the program's mint-authority PDA mints exactly 1 token to the buyer. A
//! receipt PDA per (item, buyer) makes a second purchase fail.
//!
//! Cosmetic only. Nothing here changes battle stats.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::spl_token_2022::{
    self, extension::ExtensionType, state::Mint as MintState,
};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_2022_extensions::spl_token_metadata_interface::state::Field;
use anchor_spl::token_2022_extensions::{
    metadata_pointer_initialize, non_transferable_mint_initialize, token_metadata_initialize,
    token_metadata_update_field, MetadataPointerInitialize, NonTransferableMintInitialize,
    TokenMetadataInitialize, TokenMetadataUpdateField,
};
use anchor_spl::token_interface::{
    self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G");

pub const CONFIG_SEED: &[u8] = b"config";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const MINT_AUTH_SEED: &[u8] = b"mint_auth";
pub const SEASON_SEED: &[u8] = b"season";
pub const PASS_MINT_SEED: &[u8] = b"pass_mint";
pub const PASS_RECEIPT_SEED: &[u8] = b"pass_receipt";
pub const SKIN_SEED: &[u8] = b"skin";
pub const SKIN_MINT_SEED: &[u8] = b"skin_mint";
pub const SKIN_RECEIPT_SEED: &[u8] = b"skin_receipt";

const MAX_NAME: usize = 32;
const MAX_SYMBOL: usize = 10;
const MAX_URI: usize = 200;
const MAX_KIND: usize = 16;

#[program]
pub mod mempire_pass {
    use super::*;

    /// One-time setup: who may create seasons/skins, which mint is SKR, and the
    /// treasury vault (a token account owned by the config PDA).
    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.skr_mint = ctx.accounts.skr_mint.key();
        c.treasury = ctx.accounts.treasury.key();
        c.bump = ctx.bumps.config;
        c.mint_auth_bump = ctx.bumps.mint_authority;
        Ok(())
    }

    /// Admin: create Season N and its soulbound pass mint.
    pub fn init_season(
        ctx: Context<InitSeason>,
        season_id: u16,
        price_skr: u64,
        ends_at: i64,
        uri: String,
    ) -> Result<()> {
        require!(price_skr > 0, PassError::BadPrice);
        require!(uri.len() <= MAX_URI, PassError::TooLong);
        let name = format!("Mempire Season {} Pass", season_id);
        let extra = vec![
            ("season".to_string(), season_id.to_string()),
            ("tier".to_string(), "premium".to_string()),
            ("ends_at".to_string(), ends_at.to_string()),
        ];
        let sid = season_id.to_le_bytes();
        let mint_seeds: &[&[u8]] = &[PASS_MINT_SEED, &sid, &[ctx.bumps.pass_mint]];
        create_metadata_mint(
            &ctx.accounts.admin.to_account_info(),
            &ctx.accounts.pass_mint.to_account_info(),
            mint_seeds,
            &ctx.accounts.mint_authority.to_account_info(),
            ctx.accounts.config.mint_auth_bump,
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            true,
            name,
            "MPASS".to_string(),
            uri,
            extra,
        )?;
        let s = &mut ctx.accounts.season;
        s.season_id = season_id;
        s.price_skr = price_skr;
        s.ends_at = ends_at;
        s.mint = ctx.accounts.pass_mint.key();
        s.sold = 0;
        s.bump = ctx.bumps.season;
        Ok(())
    }

    /// Buy the pass: SKR to the treasury, 1 soulbound pass token to the buyer.
    pub fn buy_pass(ctx: Context<BuyPass>, season_id: u16) -> Result<()> {
        let season = &mut ctx.accounts.season;
        require!(season.season_id == season_id, PassError::WrongItem);
        let now = Clock::get()?.unix_timestamp;
        require!(now < season.ends_at, PassError::SeasonOver);
        require!(
            ctx.accounts.buyer_skr.amount >= season.price_skr,
            PassError::InsufficientSkr
        );
        pay_skr(
            &ctx.accounts.skr_token_program,
            &ctx.accounts.buyer_skr,
            &ctx.accounts.skr_mint,
            &ctx.accounts.treasury,
            &ctx.accounts.buyer,
            season.price_skr,
        )?;
        mint_one(
            &ctx.accounts.token_program,
            &ctx.accounts.pass_mint.to_account_info(),
            &ctx.accounts.buyer_pass.to_account_info(),
            &ctx.accounts.mint_authority,
            ctx.accounts.config.mint_auth_bump,
        )?;
        season.sold = season.sold.checked_add(1).ok_or(PassError::Overflow)?;
        let r = &mut ctx.accounts.receipt;
        r.owner = ctx.accounts.buyer.key();
        r.item = season.key();
        r.paid = season.price_skr;
        r.at = now;
        emit!(PassBought {
            season_id,
            buyer: r.owner,
            price_skr: r.paid
        });
        Ok(())
    }

    /// Admin: create a skin (arena skin or card frame) as a transferable
    /// Token-2022 mint with on-chain metadata.
    pub fn init_skin(
        ctx: Context<InitSkin>,
        skin_id: u16,
        price_skr: u64,
        name: String,
        symbol: String,
        uri: String,
        skin_type: String,
        season_id: u16,
    ) -> Result<()> {
        require!(price_skr > 0, PassError::BadPrice);
        require!(
            name.len() <= MAX_NAME
                && symbol.len() <= MAX_SYMBOL
                && uri.len() <= MAX_URI
                && skin_type.len() <= MAX_KIND,
            PassError::TooLong
        );
        let extra = vec![
            ("skin_type".to_string(), skin_type.clone()),
            ("skin_id".to_string(), skin_id.to_string()),
            ("season".to_string(), season_id.to_string()),
        ];
        let kid = skin_id.to_le_bytes();
        let mint_seeds: &[&[u8]] = &[SKIN_MINT_SEED, &kid, &[ctx.bumps.skin_mint]];
        create_metadata_mint(
            &ctx.accounts.admin.to_account_info(),
            &ctx.accounts.skin_mint.to_account_info(),
            mint_seeds,
            &ctx.accounts.mint_authority.to_account_info(),
            ctx.accounts.config.mint_auth_bump,
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            false,
            name,
            symbol,
            uri,
            extra,
        )?;
        let s = &mut ctx.accounts.skin;
        s.skin_id = skin_id;
        s.price_skr = price_skr;
        s.mint = ctx.accounts.skin_mint.key();
        s.sold = 0;
        s.bump = ctx.bumps.skin;
        Ok(())
    }

    /// Buy a skin once: SKR to the treasury, 1 skin token to the buyer.
    pub fn buy_skin(ctx: Context<BuySkin>, skin_id: u16) -> Result<()> {
        let skin = &mut ctx.accounts.skin;
        require!(skin.skin_id == skin_id, PassError::WrongItem);
        require!(
            ctx.accounts.buyer_skr.amount >= skin.price_skr,
            PassError::InsufficientSkr
        );
        pay_skr(
            &ctx.accounts.skr_token_program,
            &ctx.accounts.buyer_skr,
            &ctx.accounts.skr_mint,
            &ctx.accounts.treasury,
            &ctx.accounts.buyer,
            skin.price_skr,
        )?;
        mint_one(
            &ctx.accounts.token_program,
            &ctx.accounts.skin_mint.to_account_info(),
            &ctx.accounts.buyer_skin.to_account_info(),
            &ctx.accounts.mint_authority,
            ctx.accounts.config.mint_auth_bump,
        )?;
        skin.sold = skin.sold.checked_add(1).ok_or(PassError::Overflow)?;
        let r = &mut ctx.accounts.receipt;
        r.owner = ctx.accounts.buyer.key();
        r.item = skin.key();
        r.paid = skin.price_skr;
        r.at = Clock::get()?.unix_timestamp;
        emit!(SkinBought {
            skin_id,
            buyer: r.owner,
            price_skr: r.paid
        });
        Ok(())
    }
}

// ---------------------------------------------------------------- helpers

fn pay_skr<'info>(
    program: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    owner: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new(
            program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: owner.to_account_info(),
            },
        ),
        amount,
        mint.decimals,
    )
}

fn mint_one<'info>(
    program: &Program<'info, Token2022>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &UncheckedAccount<'info>,
    auth_bump: u8,
) -> Result<()> {
    let seeds: &[&[u8]] = &[MINT_AUTH_SEED, &[auth_bump]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            program.to_account_info(),
            MintTo {
                mint: mint.clone(),
                to: to.clone(),
                authority: authority.to_account_info(),
            },
            &[seeds],
        ),
        1,
    )
}

/// Size of the TokenMetadata TLV entry (4-byte TLV header + borsh body).
fn metadata_len(name: &str, symbol: &str, uri: &str, extra: &[(String, String)]) -> usize {
    let body = 32 // update_authority (OptionalNonZeroPubkey)
        + 32 // mint
        + 4 + name.len()
        + 4 + symbol.len()
        + 4 + uri.len()
        + 4
        + extra
            .iter()
            .map(|(k, v)| 4 + k.len() + 4 + v.len())
            .sum::<usize>();
    4 + body
}

/// Create a decimals-0 Token-2022 mint at a PDA, with MetadataPointer (to
/// itself) and, if `soulbound`, NonTransferable; then write TokenMetadata
/// (name/symbol/uri + additional fields) into the mint. Mint and metadata
/// update authority are the program's `mint_auth` PDA.
#[allow(clippy::too_many_arguments)]
fn create_metadata_mint<'info>(
    payer: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    mint_seeds: &[&[u8]],
    mint_auth: &AccountInfo<'info>,
    auth_bump: u8,
    token_program: &AccountInfo<'info>,
    system: &AccountInfo<'info>,
    soulbound: bool,
    name: String,
    symbol: String,
    uri: String,
    extra: Vec<(String, String)>,
) -> Result<()> {
    let mut exts = vec![ExtensionType::MetadataPointer];
    if soulbound {
        exts.push(ExtensionType::NonTransferable);
    }
    let base = ExtensionType::try_calculate_account_len::<MintState>(&exts)
        .map_err(|_| error!(PassError::Overflow))?;
    let meta = metadata_len(&name, &symbol, &uri, &extra);
    let rent = Rent::get()?;

    // Allocate only the fixed extensions; fund for the metadata realloc too.
    system_program::create_account(
        CpiContext::new_with_signer(
            system.clone(),
            system_program::CreateAccount {
                from: payer.clone(),
                to: mint.clone(),
            },
            &[mint_seeds],
        ),
        rent.minimum_balance(base + meta),
        base as u64,
        &spl_token_2022::ID,
    )?;

    if soulbound {
        non_transferable_mint_initialize(CpiContext::new(
            token_program.clone(),
            NonTransferableMintInitialize {
                token_program_id: token_program.clone(),
                mint: mint.clone(),
            },
        ))?;
    }
    metadata_pointer_initialize(
        CpiContext::new(
            token_program.clone(),
            MetadataPointerInitialize {
                token_program_id: token_program.clone(),
                mint: mint.clone(),
            },
        ),
        Some(mint_auth.key()),
        Some(mint.key()),
    )?;
    let ix = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::ID,
        mint.key,
        mint_auth.key,
        None,
        0,
    )?;
    anchor_lang::solana_program::program::invoke(&ix, &[mint.clone(), token_program.clone()])?;

    let auth_seeds: &[&[u8]] = &[MINT_AUTH_SEED, &[auth_bump]];
    token_metadata_initialize(
        CpiContext::new_with_signer(
            token_program.clone(),
            TokenMetadataInitialize {
                program_id: token_program.clone(),
                metadata: mint.clone(),
                update_authority: mint_auth.clone(),
                mint_authority: mint_auth.clone(),
                mint: mint.clone(),
            },
            &[auth_seeds],
        ),
        name,
        symbol,
        uri,
    )?;
    for (k, v) in extra {
        token_metadata_update_field(
            CpiContext::new_with_signer(
                token_program.clone(),
                TokenMetadataUpdateField {
                    program_id: token_program.clone(),
                    metadata: mint.clone(),
                    update_authority: mint_auth.clone(),
                },
                &[auth_seeds],
            ),
            Field::Key(k),
            v,
        )?;
    }
    Ok(())
}

// ---------------------------------------------------------------- accounts

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub skr_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        seeds = [TREASURY_SEED],
        bump,
        token::mint = skr_mint,
        token::authority = config,
        token::token_program = skr_token_program,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: PDA used only as mint / metadata authority; holds no data.
    #[account(seeds = [MINT_AUTH_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub skr_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(season_id: u16)]
pub struct InitSeason<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ PassError::NotAdmin)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + Season::INIT_SPACE,
        seeds = [SEASON_SEED, &season_id.to_le_bytes()],
        bump
    )]
    pub season: Account<'info, Season>,
    /// CHECK: created here as a Token-2022 mint at this PDA.
    #[account(mut, seeds = [PASS_MINT_SEED, &season_id.to_le_bytes()], bump)]
    pub pass_mint: UncheckedAccount<'info>,
    /// CHECK: PDA authority, checked by seeds.
    #[account(seeds = [MINT_AUTH_SEED], bump = config.mint_auth_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(season_id: u16)]
pub struct BuyPass<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = skr_mint, has_one = treasury)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [SEASON_SEED, &season_id.to_le_bytes()], bump = season.bump)]
    pub season: Box<Account<'info, Season>>,
    #[account(mut, address = season.mint @ PassError::WrongItem)]
    pub pass_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [PASS_RECEIPT_SEED, season.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = pass_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_pass: Box<InterfaceAccount<'info, TokenAccount>>,
    pub skr_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = skr_mint, token::authority = buyer, token::token_program = skr_token_program)]
    pub buyer_skr: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: PDA authority, checked by seeds.
    #[account(seeds = [MINT_AUTH_SEED], bump = config.mint_auth_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub skr_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(skin_id: u16)]
pub struct InitSkin<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ PassError::NotAdmin)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + Skin::INIT_SPACE,
        seeds = [SKIN_SEED, &skin_id.to_le_bytes()],
        bump
    )]
    pub skin: Account<'info, Skin>,
    /// CHECK: created here as a Token-2022 mint at this PDA.
    #[account(mut, seeds = [SKIN_MINT_SEED, &skin_id.to_le_bytes()], bump)]
    pub skin_mint: UncheckedAccount<'info>,
    /// CHECK: PDA authority, checked by seeds.
    #[account(seeds = [MINT_AUTH_SEED], bump = config.mint_auth_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(skin_id: u16)]
pub struct BuySkin<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = skr_mint, has_one = treasury)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [SKIN_SEED, &skin_id.to_le_bytes()], bump = skin.bump)]
    pub skin: Box<Account<'info, Skin>>,
    #[account(mut, address = skin.mint @ PassError::WrongItem)]
    pub skin_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [SKIN_RECEIPT_SEED, skin.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = skin_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_skin: Box<InterfaceAccount<'info, TokenAccount>>,
    pub skr_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = skr_mint, token::authority = buyer, token::token_program = skr_token_program)]
    pub buyer_skr: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: PDA authority, checked by seeds.
    #[account(seeds = [MINT_AUTH_SEED], bump = config.mint_auth_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub skr_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub skr_mint: Pubkey,
    pub treasury: Pubkey,
    pub bump: u8,
    pub mint_auth_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Season {
    pub season_id: u16,
    pub price_skr: u64,
    pub ends_at: i64,
    pub mint: Pubkey,
    pub sold: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Skin {
    pub skin_id: u16,
    pub price_skr: u64,
    pub mint: Pubkey,
    pub sold: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub owner: Pubkey,
    pub item: Pubkey,
    pub paid: u64,
    pub at: i64,
}

#[event]
pub struct PassBought {
    pub season_id: u16,
    pub buyer: Pubkey,
    pub price_skr: u64,
}

#[event]
pub struct SkinBought {
    pub skin_id: u16,
    pub buyer: Pubkey,
    pub price_skr: u64,
}

#[error_code]
pub enum PassError {
    #[msg("Only the admin can do this")]
    NotAdmin,
    #[msg("Price must be above zero")]
    BadPrice,
    #[msg("A string is too long")]
    TooLong,
    #[msg("This season has ended")]
    SeasonOver,
    #[msg("Not enough SKR")]
    InsufficientSkr,
    #[msg("Account does not match the item")]
    WrongItem,
    #[msg("Arithmetic overflow")]
    Overflow,
}
