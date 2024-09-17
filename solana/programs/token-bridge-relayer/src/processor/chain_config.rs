use crate::{
    error::TokenBridgeRelayerError,
    state::{AdminState, ChainConfigState, TbrConfigState},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(chain_id: u16)]
pub struct UpdateChainConfig<'info> {
    /// Owner as set in the [`TbrConfig`] account, or an admin.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// If the signer is an admin, prove it with this PDA.
    #[account(
        seeds = [AdminState::SEED_PREFIX, signer.key.to_bytes().as_ref()],
        bump
    )]
    pub admin_badge: Option<Account<'info, AdminState>>,

    #[account(
        mut,
        seeds = [
            ChainConfigState::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
        ],
        bump
    )]
    pub chain_config: Account<'info, ChainConfigState>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        seeds = [TbrConfigState::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,
}

impl<'info> UpdateChainConfig<'info> {
    pub fn only_owner_or_admin(&self) -> Result<()> {
        require!(
            self.admin_badge.is_some() || self.tbr_config.is_owner(self.signer.key),
            TokenBridgeRelayerError::OwnerOrAdminOnly
        );

        Ok(())
    }
}

pub fn set_pause_for_outbound_transfers(
    ctx: Context<UpdateChainConfig>,
    paused: bool,
) -> Result<()> {
    ctx.accounts.only_owner_or_admin()?;

    let chain_config = &mut ctx.accounts.chain_config;
    chain_config.paused_outbound_transfers = paused;

    Ok(())
}

pub fn update_max_gas_dropoff(ctx: Context<UpdateChainConfig>, max_gas_dropoff: u64) -> Result<()> {
    ctx.accounts.only_owner_or_admin()?;

    let chain_config = &mut ctx.accounts.chain_config;
    chain_config.max_gas_dropoff = max_gas_dropoff;

    Ok(())
}

pub fn update_relayer_fee(ctx: Context<UpdateChainConfig>, relayer_fee: u64) -> Result<()> {
    ctx.accounts.only_owner_or_admin()?;

    let chain_config = &mut ctx.accounts.chain_config;
    chain_config.relayer_fee = relayer_fee;

    Ok(())
}
