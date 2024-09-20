use crate::{
    error::TokenBridgeRelayerError,
    state::{AdminState, TbrConfigState},
};
use anchor_lang::prelude::*;

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
        bump = tbr_config.bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        init,
        payer = owner,
        space = 8 + AdminState::INIT_SPACE,
        seeds = [AdminState::SEED_PREFIX, new_admin.to_bytes().as_ref()],
        bump
    )]
    pub admin_badge: Account<'info, AdminState>,

    pub system_program: Program<'info, System>,
}

pub fn add_admin(ctx: Context<AddAdmin>, _new_admin: Pubkey) -> Result<()> {
    ctx.accounts.admin_badge.bump = ctx.bumps.admin_badge;

    Ok(())
}

#[derive(Accounts)]
#[instruction(
    admin_to_be_removed: Pubkey,
)]
pub struct RemoveAdmin<'info> {
    /// The signer can be the owner or an admin.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// If the signer is an admin, prove it with this PDA.
    #[account(
    seeds = [AdminState::SEED_PREFIX, signer.key.to_bytes().as_ref()],
    bump = admin_badge.bump
)]
    pub admin_badge: Option<Account<'info, AdminState>>,

    /// Program Config account. This program requires that the [`owner`] specified
    /// in the context equals the owner role stored in the config.
    #[account(
        seeds = [TbrConfigState::SEED_PREFIX],
        bump = tbr_config.bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        mut,
        close = signer,
        seeds = [AdminState::SEED_PREFIX, admin_to_be_removed.to_bytes().as_ref()],
        bump = admin_badge_to_be_removed.bump
    )]
    pub admin_badge_to_be_removed: Account<'info, AdminState>,
}

pub fn remove_admin(ctx: Context<RemoveAdmin>) -> Result<()> {
    require!(
        ctx.accounts.admin_badge.is_some()
            || ctx.accounts.tbr_config.is_owner(ctx.accounts.signer.key),
        TokenBridgeRelayerError::OwnerOrAdminOnly
    );

    Ok(())
}
