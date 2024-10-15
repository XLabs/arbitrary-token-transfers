use crate::{
    state::{ChainConfigState, TbrConfigState},
    utils::calculate_total_fee,
};
use anchor_lang::prelude::*;
use solana_price_oracle::{
    state::{EvmPricesState, PriceOracleConfigState},
    PriceOracle,
};

#[derive(Accounts)]
pub struct QuoteQuery<'info> {
    /// This program's config.
    pub tbr_config: Account<'info, TbrConfigState>,

    /// The peer config. We need to verify that the transfer is sent to the
    /// canonical peer.
    pub chain_config: Account<'info, ChainConfigState>,

    pub oracle_config: Account<'info, PriceOracleConfigState>,

    #[account(
        seeds = [EvmPricesState::SEED_PREFIX, chain_config.chain_id.to_be_bytes().as_ref()],
        seeds::program = PriceOracle::id(),
        bump,
    )]
    pub oracle_evm_prices: Account<'info, EvmPricesState>,
}

pub fn relaying_fee(ctx: Context<QuoteQuery>, dropoff_amount: u32) -> Result<u64> {
    calculate_total_fee(
        &ctx.accounts.tbr_config,
        &ctx.accounts.chain_config,
        &ctx.accounts.oracle_evm_prices,
        &ctx.accounts.oracle_config,
        dropoff_amount,
    )
}
