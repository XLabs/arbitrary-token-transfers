use crate::{
    state::{ChainConfigState, TbrConfigState},
    utils::calculate_total_fee,
};
use anchor_lang::prelude::*;
use solana_price_oracle::{
    state::{EvmPricesAccount, PriceOracleConfigAccount},
    PriceOracle,
};

#[derive(Accounts)]
#[instruction(
    chain_id: u16,
)]
pub struct QuoteQuery<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// This program's config.
    #[account(
        seeds = [TbrConfigState::SEED_PREFIX],
        bump = tbr_config.bump
    )]
    pub tbr_config: Box<Account<'info, TbrConfigState>>,

    /// The peer config. We need to verify that the transfer is sent to the
    /// canonical peer.
    #[account(
        seeds = [
            ChainConfigState::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
        ],
        bump = chain_config.bump
    )]
    pub chain_config: Box<Account<'info, ChainConfigState>>,

    #[account(
        seeds = [PriceOracleConfigAccount::SEED_PREFIX],
        seeds::program = PriceOracle::id(),
        bump,
    )]
    pub oracle_config: Box<Account<'info, PriceOracleConfigAccount>>,

    #[account(
        seeds = [EvmPricesAccount::SEED_PREFIX, chain_id.to_be_bytes().as_ref()],
        seeds::program = PriceOracle::id(),
        bump,
    )]
    pub oracle_evm_prices: Box<Account<'info, EvmPricesAccount>>,
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
