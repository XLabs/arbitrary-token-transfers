use crate::state::{AdminState, ChainConfigState, TbrConfigState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(chain_id: u16)]
pub struct UpdateChainConfig<'info> {
    /// Owner as set in the [`TbrConfig`] account, or an admin.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Proof that the signer is an admin or the owner.
    #[account(
        seeds = [AdminState::SEED_PREFIX, signer.key.to_bytes().as_ref()],
        bump = admin_badge.bump
    )]
    pub admin_badge: Account<'info, AdminState>,

    #[account(
        mut,
        seeds = [
            ChainConfigState::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
        ],
        bump = chain_config.bump
    )]
    pub chain_config: Account<'info, ChainConfigState>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        seeds = [TbrConfigState::SEED_PREFIX],
        bump = tbr_config.bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,
}

pub fn set_pause_for_outbound_transfers(
    ctx: Context<UpdateChainConfig>,
    paused: bool,
) -> Result<()> {
    let chain_config = &mut ctx.accounts.chain_config;
    chain_config.paused_outbound_transfers = paused;

    Ok(())
}

pub fn update_max_gas_dropoff(
    ctx: Context<UpdateChainConfig>,
    max_gas_dropoff_micro_token: u32,
) -> Result<()> {
    let chain_config = &mut ctx.accounts.chain_config;
    chain_config.max_gas_dropoff_micro_token = max_gas_dropoff_micro_token;

    Ok(())
}

pub fn update_relayer_fee(ctx: Context<UpdateChainConfig>, relayer_fee: u32) -> Result<()> {
    let chain_config = &mut ctx.accounts.chain_config;
    chain_config.relayer_fee_micro_usd = relayer_fee;

    Ok(())
}
