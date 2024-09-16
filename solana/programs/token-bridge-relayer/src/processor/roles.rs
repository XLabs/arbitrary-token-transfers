//! Everything about the owner or admin role transfer.

use crate::{
    error::TokenBridgeRelayerError,
    processor::UpdateTbrConfig,
    state::{AdminState, TbrConfigState},
};
use anchor_lang::prelude::*;

pub fn submit_owner_transfer_request(
    ctx: Context<UpdateTbrConfig>,
    new_owner: Pubkey,
) -> Result<()> {
    ctx.accounts.only_owner()?;

    // Verify we're not updating to the same account:
    require_keys_neq!(
        new_owner,
        ctx.accounts.tbr_config.owner,
        TokenBridgeRelayerError::AlreadyTheOwner
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.pending_owner = Some(new_owner);

    Ok(())
}

pub fn confirm_owner_transfer_request(ctx: Context<UpdateTbrConfig>) -> Result<()> {
    ctx.accounts.only_pending_owner()?;

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.owner = ctx.accounts.signer.key();
    tbr_config.pending_owner = None;

    Ok(())
}

pub fn cancel_owner_transfer_request(ctx: Context<UpdateTbrConfig>) -> Result<()> {
    ctx.accounts.only_owner()?;

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.pending_owner = None;

    Ok(())
}

pub fn update_admin(ctx: Context<UpdateTbrConfig>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.only_owner_or_admin()?;

    // Verify we're not updating to the same account:
    require_keys_neq!(
        new_admin,
        ctx.accounts.tbr_config.admin,
        TokenBridgeRelayerError::AlreadyTheAdmin
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.admin = new_admin;

    Ok(())
}

#[derive(Accounts)]
#[instruction(
    new_admin: Pubkey,
)]
pub struct AddAdmin<'info> {
    /// The signer must be the owner.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Program Config account. This program requires that the [`owner`] specified
    /// in the context equals the owner role stored in the config.
    #[account(
        has_one = owner @ TokenBridgeRelayerError::OwnerOnly,
        seeds = [TbrConfigState::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        init,
        payer = owner,
        space = 8 + AdminState::INIT_SPACE,
        seeds = [AdminState::SEED_PREFIX, new_admin.to_bytes().as_ref()],
        bump
    )]
    pub admin: Account<'info, AdminState>,

    pub system_program: Program<'info, System>,
}

pub fn add_admin(ctx: Context<UpdateTbrConfig>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.only_owner_or_admin()?;

    // Verify we're not updating to the same account:
    require_keys_neq!(
        new_admin,
        ctx.accounts.tbr_config.admin,
        TokenBridgeRelayerError::AlreadyTheAdmin
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.admin = new_admin;

    Ok(())
}

pub fn remove_admin(ctx: Context<UpdateTbrConfig>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.only_owner_or_admin()?;

    // Verify we're not updating to the same account:
    require_keys_neq!(
        new_admin,
        ctx.accounts.tbr_config.admin,
        TokenBridgeRelayerError::AlreadyTheAdmin
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.admin = new_admin;

    Ok(())
}
