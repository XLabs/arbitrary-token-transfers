//! Everything about the owner or admin role transfer.

use crate::{error::TokenBridgeRelayerError, state::TbrConfigState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SubmitOwnerTransfer<'info> {
    pub owner: Signer<'info>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        mut,
        has_one = owner @ TokenBridgeRelayerError::OwnerOnly,
        seeds = [TbrConfigState::SEED_PREFIX],
        bump = tbr_config.bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,
}

pub fn submit_owner_transfer_request(
    ctx: Context<SubmitOwnerTransfer>,
    new_owner: Pubkey,
) -> Result<()> {
    // Verify we're not updating to the same account:
    require_keys_neq!(
        new_owner,
        ctx.accounts.tbr_config.owner,
        TokenBridgeRelayerError::AlreadyTheOwner
    );

    ctx.accounts.tbr_config.pending_owner = Some(new_owner);

    Ok(())
}

#[derive(Accounts)]
pub struct ConfirmOwnerTransfer<'info> {
    #[account(
        mut,
        constraint = {
            Some(new_owner.key()) == tbr_config.pending_owner
        } @ TokenBridgeRelayerError::PendingOwnerOnly,
    )]
    pub new_owner: Signer<'info>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(mut)]
    pub tbr_config: Account<'info, TbrConfigState>,

    pub system_program: Program<'info, System>,
}

pub fn confirm_owner_transfer_request(ctx: Context<ConfirmOwnerTransfer>) -> Result<()> {
    let tbr_config = &mut ctx.accounts.tbr_config;

    tbr_config.owner = ctx.accounts.new_owner.key();
    tbr_config.pending_owner = None;

    Ok(())
}

#[derive(Accounts)]
pub struct CancelOwnerTransfer<'info> {
    pub owner: Signer<'info>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        mut,
        has_one = owner @ TokenBridgeRelayerError::OwnerOnly,
    )]
    pub tbr_config: Account<'info, TbrConfigState>,
}

pub fn cancel_owner_transfer_request(ctx: Context<CancelOwnerTransfer>) -> Result<()> {
    ctx.accounts.tbr_config.pending_owner = None;

    Ok(())
}
