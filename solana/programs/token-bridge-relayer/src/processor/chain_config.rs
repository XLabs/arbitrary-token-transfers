use crate::{
    error::TokenBridgeRelayerError,
    state::{AuthBadgeState, ChainConfigState},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateChainConfig<'info> {
    /// Owner as set in the [`TbrConfigState`] account, or an admin.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Proof that the signer is authorized.
    #[account(constraint = &auth_badge.address == signer.key @ TokenBridgeRelayerError::RequiresAuthBadge)]
    pub auth_badge: Account<'info, AuthBadgeState>,

    #[account(mut)]
    pub chain_config: Account<'info, ChainConfigState>,
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
