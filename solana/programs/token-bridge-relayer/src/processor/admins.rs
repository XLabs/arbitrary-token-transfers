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
    #[account(has_one = owner @ TokenBridgeRelayerError::OwnerOnly)]
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

pub fn add_admin(ctx: Context<AddAdmin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.admin_badge.set_inner( AdminState {
        address: new_admin,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RemoveAdmin<'info> {
    /// The signer can be the owner or an admin.
    #[account(
        mut,
        constraint = {
            tbr_config.is_owner_or_admin(&signer, &maybe_admin_badge)
        } @ TokenBridgeRelayerError::OwnerOrAdminOnly
    )]
    pub signer: Signer<'info>,

    /// If the signer is an admin, prove it with this PDA.
    pub maybe_admin_badge: Option<Account<'info, AdminState>>,

    /// Program Config account. This program requires that the [`owner`] specified
    /// in the context equals the owner role stored in the config.
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        mut,
        close = signer,
    )]
    pub admin_badge_to_be_removed: Account<'info, AdminState>,
}

pub fn remove_admin(ctx: Context<RemoveAdmin>) -> Result<()> {
    Ok(())
}
