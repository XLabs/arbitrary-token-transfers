use crate::{
    error::TokenBridgeRelayerError,
    state::{ChainConfigState, TbrConfigState},
    utils::calculate_total_fee,
};
use anchor_lang::prelude::*;
use solana_price_oracle::{
    state::{PricesState, PriceOracleConfigState},
};

#[derive(Accounts)]
pub struct QuoteQuery<'info> {
    /// This program's config.
    pub tbr_config: Account<'info, TbrConfigState>,

    /// The peer config. We need to verify that the transfer is sent to the
    /// canonical peer.
    #[account(
        constraint = chain_config.chain_id == oracle_prices.chain_id
          @ TokenBridgeRelayerError::ChainIdMismatch
    )]
    pub chain_config: Account<'info, ChainConfigState>,

    pub oracle_config: Account<'info, PriceOracleConfigState>,

    pub oracle_prices: Account<'info, PricesState>,
}

pub fn relaying_fee(ctx: Context<QuoteQuery>, dropoff_amount: u32) -> Result<u64> {
    calculate_total_fee(
        &ctx.accounts.tbr_config,
        &ctx.accounts.chain_config,
        &ctx.accounts.oracle_prices,
        &ctx.accounts.oracle_config,
        dropoff_amount,
    )
}
