//! Everything about the owner or admin role transfer.

use crate::{
    error::TokenBridgeRelayerError,
    state::{AuthBadgeState, TbrConfigState},
};
use anchor_lang::{
    prelude::*,
    solana_program::{bpf_loader_upgradeable, program::invoke},
};

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
    #[account(mut)]
    pub new_owner: Signer<'info>,

    #[account(
        init,
        payer = new_owner,
        space = 8 + AuthBadgeState::INIT_SPACE,
        seeds = [AuthBadgeState::SEED_PREFIX, new_owner.key.to_bytes().as_ref()],
        bump
    )]
    pub auth_badge_new_owner: Account<'info, AuthBadgeState>,

    pub previous_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [AuthBadgeState::SEED_PREFIX, tbr_config.owner.to_bytes().as_ref()],
        bump,
        close = new_owner,
    )]
    pub auth_badge_previous_owner: Account<'info, AuthBadgeState>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        mut,
        constraint = tbr_config.is_pending_owner(&new_owner)
            @ TokenBridgeRelayerError::PendingOwnerOnly
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        mut,
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
    )]
    program_data: Account<'info, ProgramData>,

    #[account(address = bpf_loader_upgradeable::ID)]
    pub bpf_loader_upgradeable: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn confirm_owner_transfer_request(ctx: Context<ConfirmOwnerTransfer>) -> Result<()> {
    let tbr_config = &mut ctx.accounts.tbr_config;

    // Change the program authority to the new owner:
    invoke(
        &bpf_loader_upgradeable::set_upgrade_authority(
            &ctx.program_id,
            &ctx.accounts.previous_owner.key(),
            Some(&ctx.accounts.new_owner.key()),
        ),
        &[
            ctx.accounts.program_data.to_account_info(),
            ctx.accounts.previous_owner.to_account_info(),
            ctx.accounts.new_owner.to_account_info(),
        ],
    )?;

    tbr_config.owner = ctx.accounts.new_owner.key();
    tbr_config.pending_owner = None;

    ctx.accounts.auth_badge_new_owner.set_inner(AuthBadgeState {
        address: ctx.accounts.new_owner.key(),
    });

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
