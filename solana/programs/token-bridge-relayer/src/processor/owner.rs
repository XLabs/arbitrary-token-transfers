//! Everything about the owner or admin role transfer.

use crate::{error::TokenBridgeRelayerError, processor::UpdateTbrConfig};
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
