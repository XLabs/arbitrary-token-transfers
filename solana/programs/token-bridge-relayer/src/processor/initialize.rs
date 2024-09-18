use crate::state::{AdminState, TbrConfigState};
use anchor_lang::prelude::*;

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

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let owner = ctx.accounts.owner.key();
    let tbr_config = &mut ctx.accounts.tbr_config;

    tbr_config.owner = owner;
    tbr_config.pending_owner = None;
    tbr_config.fee_recipient = owner;
    tbr_config.evm_transaction_size = 0;

    Ok(())
}
