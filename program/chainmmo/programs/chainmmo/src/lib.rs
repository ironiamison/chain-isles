use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("BkP5QCG2x67bqXkngUFRBUzoGx5fNZzW5vY2nHZydjFv");

/// Marketplace fee in basis points (500 = 5%).
pub const MARKETPLACE_FEE_BPS: u16 = 500;

/// Game server authority — only this key may attest in-game gold balances.
pub const GAME_AUTHORITY: Pubkey = pubkey!("GTYkSZA9BzAo8mEX98dx61fPUaauoD6L3ERtS2Go9PqV");

#[program]
pub mod chainmmo {
    use super::*;

    /// Link a Kaetram character name to the connected wallet.
    pub fn register_player(ctx: Context<RegisterPlayer>, character_name: String) -> Result<()> {
        require!(
            !character_name.is_empty() && character_name.len() <= PlayerProfile::MAX_NAME_LEN,
            ChainmmoError::InvalidName
        );

        let player = &mut ctx.accounts.player;
        player.authority = ctx.accounts.authority.key();
        player.character_name = character_name;
        player.gold_balance = 0;
        player.listed_gold = 0;
        player.total_listings = 0;
        player.bump = ctx.bumps.player;

        Ok(())
    }

    /// Sync in-game gold balance. Only the game server authority may call this.
    pub fn sync_gold(ctx: Context<SyncGold>, gold_balance: u64) -> Result<()> {
        let player = &mut ctx.accounts.player;
        require!(
            gold_balance >= player.listed_gold,
            ChainmmoError::InsufficientGold
        );
        player.gold_balance = gold_balance;
        Ok(())
    }

    /// List in-game gold for sale at a SOL price.
    pub fn create_listing(
        ctx: Context<CreateListing>,
        gold_amount: u64,
        price_lamports: u64,
    ) -> Result<()> {
        require!(gold_amount > 0, ChainmmoError::InvalidAmount);
        require!(price_lamports > 0, ChainmmoError::InvalidAmount);

        let player = &mut ctx.accounts.player;
        let available = player
            .gold_balance
            .checked_sub(player.listed_gold)
            .ok_or(ChainmmoError::InsufficientGold)?;
        require!(available >= gold_amount, ChainmmoError::InsufficientGold);

        let listing_id = player.total_listings;
        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.authority.key();
        listing.listing_id = listing_id;
        listing.gold_amount = gold_amount;
        listing.price_lamports = price_lamports;
        listing.active = true;
        listing.buyer = Pubkey::default();
        listing.bump = ctx.bumps.listing;

        player.listed_gold = player
            .listed_gold
            .checked_add(gold_amount)
            .ok_or(ChainmmoError::Overflow)?;
        player.total_listings = player
            .total_listings
            .checked_add(1)
            .ok_or(ChainmmoError::Overflow)?;

        Ok(())
    }

    /// Cancel an active listing and release reserved gold.
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let listing = &ctx.accounts.listing;
        require!(listing.active, ChainmmoError::ListingInactive);

        let player = &mut ctx.accounts.player;
        player.listed_gold = player
            .listed_gold
            .checked_sub(listing.gold_amount)
            .ok_or(ChainmmoError::Overflow)?;

        let listing = &mut ctx.accounts.listing;
        listing.active = false;

        Ok(())
    }

    /// Buy a gold listing. Buyer pays SOL; seller receives 95%.
    pub fn buy_listing(ctx: Context<BuyListing>) -> Result<()> {
        let listing = &ctx.accounts.listing;
        require!(listing.active, ChainmmoError::ListingInactive);
        require!(
            listing.seller != ctx.accounts.buyer.key(),
            ChainmmoError::SelfPurchase
        );

        let price = listing.price_lamports;
        let fee = (price as u128)
            .checked_mul(MARKETPLACE_FEE_BPS as u128)
            .ok_or(ChainmmoError::Overflow)?
            .checked_div(10_000)
            .ok_or(ChainmmoError::Overflow)? as u64;
        let seller_amount = price.checked_sub(fee).ok_or(ChainmmoError::Overflow)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.seller.to_account_info(),
                },
            ),
            seller_amount,
        )?;

        if fee > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.buyer.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        let listing_key = listing.key();
        let gold_amount = listing.gold_amount;

        let seller_player = &mut ctx.accounts.seller_player;
        seller_player.listed_gold = seller_player
            .listed_gold
            .checked_sub(gold_amount)
            .ok_or(ChainmmoError::Overflow)?;

        let listing = &mut ctx.accounts.listing;
        listing.active = false;
        listing.buyer = ctx.accounts.buyer.key();

        emit!(ListingPurchased {
            listing: listing_key,
            seller: listing.seller,
            buyer: ctx.accounts.buyer.key(),
            gold_amount,
            price_lamports: price,
        });

        Ok(())
    }
}

#[account]
pub struct PlayerProfile {
    pub authority: Pubkey,
    pub character_name: String,
    pub gold_balance: u64,
    pub listed_gold: u64,
    pub total_listings: u64,
    pub bump: u8,
}

impl PlayerProfile {
    pub const MAX_NAME_LEN: usize = 32;
    pub const LEN: usize = 8 + 32 + (4 + Self::MAX_NAME_LEN) + 8 + 8 + 8 + 1;
}

#[account]
pub struct MarketplaceListing {
    pub seller: Pubkey,
    pub listing_id: u64,
    pub gold_amount: u64,
    pub price_lamports: u64,
    pub active: bool,
    pub buyer: Pubkey,
    pub bump: u8,
}

impl MarketplaceListing {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1 + 32 + 1;
}

#[event]
pub struct ListingPurchased {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub gold_amount: u64,
    pub price_lamports: u64,
}

#[derive(Accounts)]
pub struct RegisterPlayer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = PlayerProfile::LEN,
        seeds = [b"player", authority.key().as_ref()],
        bump
    )]
    pub player: Account<'info, PlayerProfile>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SyncGold<'info> {
    pub game_authority: Signer<'info>,
    /// CHECK: Player wallet — PDA owner, verified via seeds below.
    pub player_wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"player", player_wallet.key().as_ref()],
        bump = player.bump,
        constraint = player.authority == player_wallet.key() @ ChainmmoError::Unauthorized,
        constraint = game_authority.key() == GAME_AUTHORITY @ ChainmmoError::Unauthorized
    )]
    pub player: Account<'info, PlayerProfile>,
}

#[derive(Accounts)]
#[instruction(gold_amount: u64, price_lamports: u64)]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"player", authority.key().as_ref()],
        bump = player.bump,
        has_one = authority
    )]
    pub player: Account<'info, PlayerProfile>,
    #[account(
        init,
        payer = authority,
        space = MarketplaceListing::LEN,
        seeds = [
            b"listing",
            authority.key().as_ref(),
            &player.total_listings.to_le_bytes()
        ],
        bump
    )]
    pub listing: Account<'info, MarketplaceListing>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"player", authority.key().as_ref()],
        bump = player.bump,
        has_one = authority
    )]
    pub player: Account<'info, PlayerProfile>,
    #[account(
        mut,
        seeds = [
            b"listing",
            authority.key().as_ref(),
            &listing.listing_id.to_le_bytes()
        ],
        bump = listing.bump,
        constraint = listing.seller == authority.key()
    )]
    pub listing: Account<'info, MarketplaceListing>,
}

#[derive(Accounts)]
pub struct BuyListing<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Seller wallet receives SOL payment.
    #[account(mut)]
    pub seller: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"player", seller.key().as_ref()],
        bump = seller_player.bump
    )]
    pub seller_player: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub listing: Account<'info, MarketplaceListing>,
    /// CHECK: Treasury receives marketplace fee.
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum ChainmmoError {
    #[msg("Character name must be 1-32 characters.")]
    InvalidName,
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Not enough gold available to list.")]
    InsufficientGold,
    #[msg("Listing is no longer active.")]
    ListingInactive,
    #[msg("You cannot buy your own listing.")]
    SelfPurchase,
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Arithmetic overflow.")]
    Overflow,
}
