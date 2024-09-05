//! Everything about the owner or assistant role transfer.

use crate::{
    error::TokenBridgeRelayerError,
    processor::ConfigUpdate,
    state::{ChainConfigAccount, TbrConfigAccount},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(chain_id: u16)]
pub struct UpdateMaxGasDropoff<'info> {
    /// Owner or  of the program as set in the [`TbrConfig`] account.
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            ChainConfigAccount::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
        ],
        bump
    )]
    pub chain_config: Account<'info, ChainConfigAccount>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        seeds = [TbrConfigAccount::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigAccount>,
}

pub fn set_pause_for_outbound_transfers(ctx: Context<ConfigUpdate>, paused: bool) -> Result<()> {
    // Verify the authority (owner or admin):
    require!(
        ctx.accounts
            .tbr_config
            .is_authorized(ctx.accounts.signer.key),
        TokenBridgeRelayerError::AuthorizedOnly
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.paused_outbound_transfers = paused;

    Ok(())
}

pub fn update_fee_recipient(ctx: Context<ConfigUpdate>, new_fee_recipient: Pubkey) -> Result<()> {
    // Verify the authority (owner or admin):
    require!(
        ctx.accounts
            .tbr_config
            .is_authorized(ctx.accounts.signer.key),
        TokenBridgeRelayerError::AuthorizedOnly
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.fee_recipient = new_fee_recipient;

    Ok(())
}

pub fn update_max_gas_dropoff(
    ctx: Context<UpdateMaxGasDropoff>,
    max_gas_dropoff: u64,
) -> Result<()> {
    // Verify the authority (owner or admin):
    require!(
        ctx.accounts
            .tbr_config
            .is_authorized(ctx.accounts.signer.key),
        TokenBridgeRelayerError::AuthorizedOnly
    );

    let chain_config = &mut ctx.accounts.chain_config;
    chain_config.max_gas_dropoff = max_gas_dropoff;

    Ok(())
}

pub fn update_relayer_fee(ctx: Context<ConfigUpdate>, relayer_fee: u64) -> Result<()> {
    // Verify the authority (owner or admin):
    require!(
        ctx.accounts
            .tbr_config
            .is_authorized(ctx.accounts.signer.key),
        TokenBridgeRelayerError::AuthorizedOnly
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.relayer_fee = relayer_fee;

    Ok(())
}

pub fn update_evm_transaction_size(
    ctx: Context<ConfigUpdate>,
    evm_transaction_gas: u64,
    evm_transaction_size: u64,
) -> Result<()> {
    // Verify the authority (owner or admin):
    require!(
        ctx.accounts
            .tbr_config
            .is_authorized(ctx.accounts.signer.key),
        TokenBridgeRelayerError::AuthorizedOnly
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.evm_transaction_gas = evm_transaction_gas;
    tbr_config.evm_transaction_size = evm_transaction_size;

    Ok(())
}

pub fn update_quoter_program_address(
    ctx: Context<ConfigUpdate>,
    quoter_program_address: Pubkey,
) -> Result<()> {
    // Verify the authority (owner or admin):
    require!(
        ctx.accounts
            .tbr_config
            .is_authorized(ctx.accounts.signer.key),
        TokenBridgeRelayerError::AuthorizedOnly
    );

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.quoter_program_address = quoter_program_address;

    Ok(())
}
