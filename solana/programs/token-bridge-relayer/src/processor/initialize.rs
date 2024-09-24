use crate::state::{AdminState, TbrConfigState};
use anchor_lang::prelude::*;
use wormhole_anchor_sdk::token_bridge;

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Owner of the program as set in the [`OwnerConfig`] account.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The admin badge for the owner.
    #[account(
        init,
        payer = owner,
        space = 8 + AdminState::INIT_SPACE,
        seeds = [AdminState::SEED_PREFIX, owner.key.to_bytes().as_ref()],
        bump
    )]
    pub admin_badge: Account<'info, AdminState>,

    /// Owner Config account. This program requires that the `owner` specified
    /// in the context equals the pubkey specified in this account. Mutable.
    #[account(
        init,
        payer = owner,
        space = 8 + TbrConfigState::INIT_SPACE,
        seeds = [TbrConfigState::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_SENDER],
        bump
    )]
    pub wormhole_sender: UncheckedAccount<'info>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_REDEEMER],
        bump
    )]
    pub wormhole_redeemer: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let owner = ctx.accounts.owner.key();

    *ctx.accounts.tbr_config = TbrConfigState {
        owner,
        pending_owner: None,
        fee_recipient: owner,
        evm_transaction_size: 0,
        evm_transaction_gas: 0,
        sender_bump: ctx.bumps.wormhole_sender,
        redeemer_bump: ctx.bumps.wormhole_redeemer,
        bump: ctx.bumps.tbr_config,
    };
    ctx.accounts.admin_badge.bump = ctx.bumps.admin_badge;

    Ok(())
}
