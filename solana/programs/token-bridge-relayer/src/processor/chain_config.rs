use crate::{
    error::TokenBridgeRelayerError,
    state::{AuthBadgeState, ChainConfigState, TbrConfigState},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateChainConfig<'info> {
    /// Owner as set in the [`TbrConfig`] account, or an admin.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Proof that the signer is authorized.
    #[account(constraint = &auth_badge.address == signer.key @ TokenBridgeRelayerError::OwnerOrAdminOnly)]
    pub auth_badge: Account<'info, AuthBadgeState>,

    #[account(mut)]
    pub chain_config: Account<'info, ChainConfigState>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    pub tbr_config: Account<'info, TbrConfigState>,
}

pub fn set_pause_for_outbound_transfers(
    ctx: Context<UpdateChainConfig>,
    paused: bool,
) -> Result<()> {
    ctx.accounts.chain_config.paused_outbound_transfers = paused;

    Ok(())
}

pub fn update_max_gas_dropoff(
    ctx: Context<UpdateChainConfig>,
    max_gas_dropoff_micro_token: u32,
) -> Result<()> {
    ctx.accounts.chain_config.max_gas_dropoff_micro_token = max_gas_dropoff_micro_token;

    Ok(())
}

pub fn update_relayer_fee(
    ctx: Context<UpdateChainConfig>,
    relayer_fee_micro_usd: u32,
) -> Result<()> {
    ctx.accounts.chain_config.relayer_fee_micro_usd = relayer_fee_micro_usd;

    Ok(())
}
