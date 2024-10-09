use crate::{
    error::TokenBridgeRelayerError,
    state::{AuthBadgeState, TbrConfigState},
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
        space = 8 + AuthBadgeState::INIT_SPACE,
        seeds = [AuthBadgeState::SEED_PREFIX, new_admin.to_bytes().as_ref()],
        bump
    )]
    pub auth_badge: Account<'info, AuthBadgeState>,

    pub system_program: Program<'info, System>,
}

pub fn add_admin(ctx: Context<AddAdmin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts
        .auth_badge
        .set_inner(AuthBadgeState { address: new_admin });

    Ok(())
}

#[derive(Accounts)]
pub struct RemoveAdmin<'info> {
    /// The signer can be the owner or an admin.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Proof that the signer is authorized.
    #[account(constraint = &auth_badge.address == signer.key @ TokenBridgeRelayerError::OwnerOrAdminOnly)]
    pub auth_badge: Account<'info, AuthBadgeState>,

    /// Program Config account. This program requires that the [`owner`] specified
    /// in the context equals the owner role stored in the config.
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        mut,
        close = signer,
    )]
    pub auth_badge_to_be_removed: Account<'info, AuthBadgeState>,
}

pub fn remove_admin(_ctx: Context<RemoveAdmin>) -> Result<()> {
    Ok(())
}
