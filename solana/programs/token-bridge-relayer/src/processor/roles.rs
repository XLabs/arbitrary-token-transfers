//! Everything about the owner or assistant role transfer.

use crate::{error::TokenBridgeRelayerError, processor::ConfigUpdate};
use anchor_lang::prelude::*;

pub fn submit_owner_transfer_request(ctx: Context<ConfigUpdate>, new_owner: Pubkey) -> Result<()> {
    // Verify the authority (owner):
    require!(
        ctx.accounts.tbr_config.is_owner(ctx.accounts.signer.key),
        TokenBridgeRelayerError::OwnerOnly
    );

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

pub fn confirm_owner_transfer_request(ctx: Context<ConfigUpdate>) -> Result<()> {
    // Verify the authority (pending owner):
    require!(
        ctx.accounts
            .tbr_config
            .is_pending_owner(ctx.accounts.signer.key),
        TokenBridgeRelayerError::NotPendingOwner
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.owner = ctx.accounts.signer.key();
    tbr_config.pending_owner = None;

    Ok(())
}

pub fn cancel_owner_transfer_request(ctx: Context<ConfigUpdate>) -> Result<()> {
    // Verify the authority (owner):
    require!(
        ctx.accounts.tbr_config.is_owner(ctx.accounts.signer.key),
        TokenBridgeRelayerError::OwnerOnly
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.pending_owner = None;

    Ok(())
}

pub fn update_admin(ctx: Context<ConfigUpdate>, new_admin: Pubkey) -> Result<()> {
    // Verify the authority (owner):
    require!(
        ctx.accounts.tbr_config.is_owner(ctx.accounts.signer.key),
        TokenBridgeRelayerError::OwnerOnly
    );

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
