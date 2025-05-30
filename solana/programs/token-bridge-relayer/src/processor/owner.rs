//! Everything about the owner or admin role transfer.

use crate::{
    constant::SEED_PREFIX_UPGRADE_LOCK,
    error::TokenBridgeRelayerError,
    state::{AuthBadgeState, TbrConfigState},
};
use anchor_lang::{
    prelude::*,
    solana_program::{bpf_loader_upgradeable, program::invoke_signed},
};

#[derive(Accounts)]
pub struct OwnerContext<'info> {
    /// CHECK: The seeds constraint enforces that this is the correct address
    #[account(
        seeds = [SEED_PREFIX_UPGRADE_LOCK],
        bump,
    )]
    upgrade_lock: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
    )]
    program_data: Account<'info, ProgramData>,

    /// CHECK: The BPF loader program.
    #[account(address = bpf_loader_upgradeable::ID)]
    pub bpf_loader_upgradeable: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SubmitOwnerTransfer<'info> {
    pub owner: Signer<'info>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        mut,
        has_one = owner @ TokenBridgeRelayerError::OwnerOnly,
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    pub owner_ctx: OwnerContext<'info>,
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

    // Change the program authority to the upgrade lock PDA, so that the owner does not need
    // to sign the transaction when confirming the ownership transfer:
    invoke_signed(
        &bpf_loader_upgradeable::set_upgrade_authority_checked(
            &ctx.program_id,
            &ctx.accounts.owner.key(),
            &ctx.accounts.owner_ctx.upgrade_lock.key(),
        ),
        &[
            ctx.accounts.owner_ctx.program_data.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.owner_ctx.upgrade_lock.to_account_info(),
        ],
        &[&[SEED_PREFIX_UPGRADE_LOCK, &[ctx.bumps.owner_ctx.upgrade_lock]]],
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct ConfirmOwnerTransfer<'info> {
    #[account(mut)]
    pub new_owner: Signer<'info>,

    /// CHECK: init_if_needed: If the new owner has already a badge, _i.e._ is an admin, we can reuse it. 
    #[account(
        init_if_needed,
        payer = new_owner,
        space = 8 + AuthBadgeState::INIT_SPACE,
        seeds = [AuthBadgeState::SEED_PREFIX, new_owner.key.to_bytes().as_ref()],
        bump
    )]
    pub auth_badge_new_owner: Account<'info, AuthBadgeState>,

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

    pub owner_ctx: OwnerContext<'info>,

    pub system_program: Program<'info, System>,
}

pub fn confirm_owner_transfer_request(ctx: Context<ConfirmOwnerTransfer>) -> Result<()> {
    let tbr_config = &mut ctx.accounts.tbr_config;

    // Change the program authority to the new owner:
    invoke_signed(
        &bpf_loader_upgradeable::set_upgrade_authority(
            &ctx.program_id,
            &ctx.accounts.owner_ctx.upgrade_lock.key(),
            Some(&ctx.accounts.new_owner.key()),
        ),
        &[
            ctx.accounts.owner_ctx.program_data.to_account_info(),
            ctx.accounts.owner_ctx.upgrade_lock.to_account_info(),
            ctx.accounts.new_owner.to_account_info(),
        ],
        &[&[SEED_PREFIX_UPGRADE_LOCK, &[ctx.bumps.owner_ctx.upgrade_lock]]],
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

    pub owner_ctx: OwnerContext<'info>,
}

pub fn cancel_owner_transfer_request(ctx: Context<CancelOwnerTransfer>) -> Result<()> {
    ctx.accounts.tbr_config.pending_owner = None;

    // Transfer the program authority back to the owner:
    invoke_signed(
        &bpf_loader_upgradeable::set_upgrade_authority(
            &ctx.program_id,
            &ctx.accounts.owner_ctx.upgrade_lock.key(),
            Some(&ctx.accounts.owner.key()),
        ),
        &[
            ctx.accounts.owner_ctx.program_data.to_account_info(),
            ctx.accounts.owner_ctx.upgrade_lock.to_account_info(),
            ctx.accounts.owner.to_account_info(),
        ],
        &[&[SEED_PREFIX_UPGRADE_LOCK, &[ctx.bumps.owner_ctx.upgrade_lock]]],
    )?;

    Ok(())
}
