use crate::{
    error::{TokenBridgeRelayerError, TokenBridgeRelayerResult},
    state::{ChainConfigState, TbrConfigState},
};
use anchor_lang::{prelude::*, solana_program::program_option::COption};
use solana_price_oracle::state::{EvmPricesAccount, PriceOracleConfigAccount};

const KLAM_PER_SOL: u64 = 1_000_000;
const MWEI_PER_ETH: u64 = 1_000_000_000_000;

/// Returns the transfer fee in Klamports aka µSOL.
///
/// If `price_per_byte` is set to 0, it means that the transaction size does
/// not matter.
///
/// # Arguments
///
/// - `config`: the config for this program (hold the EVM info and the relayer fee).
/// - `target_evm_quote`: (quoter program) the prices for the EVM chain the tokens will be sent to.
/// - `local_quote`: (quoter program) the prices for the local Solana chain.
/// - `chain_id`: the ID of the target chain.
/// - `dropoff_amount`: the amount of target token the user wants.
pub fn calculate_total_fee(
    config: &TbrConfigState,
    chain_config: &ChainConfigState,
    oracle_evm_prices: &EvmPricesAccount,
    oracle_config: &PriceOracleConfigAccount,
    dropoff_amount: u64,
) -> Result<u64> {
    check_prices_are_set(oracle_evm_prices)?;

    // Mwei = gas * Mwei/gas + bytes * Mwei/byte + Mwei
    let total_fees_mwei = config.evm_transaction_gas * u64::from(oracle_evm_prices.gas_price)
        + config.evm_transaction_size * u64::from(oracle_evm_prices.price_per_byte)
        + u64::from(dropoff_amount);

    // μusd = Mwei * μusd/Token / Mwei/Token + μusd)
    let total_fees_usd = total_fees_mwei * oracle_evm_prices.gas_token_price / MWEI_PER_ETH
        + chain_config.relayer_fee;

    // µSOL/SOL * μusd / μusd/SOL
    Ok((KLAM_PER_SOL * total_fees_usd) / oracle_config.sol_price)
}

/// This is a basic security against a wrong manip, to be sure that the prices
/// have been set correctly.
fn check_prices_are_set(evm_prices: &EvmPricesAccount) -> Result<()> {
    require_neq!(
        evm_prices.gas_price,
        0,
        TokenBridgeRelayerError::EvmChainPriceNotSet
    );
    require_neq!(
        evm_prices.gas_token_price,
        0,
        TokenBridgeRelayerError::EvmChainPriceNotSet
    );

    // We don't need to check the SOL price, because it will generate a division by 0

    Ok(())
}

/// Creates a closure allowing to verify that a native/wrapped transfer is indeed
/// what it pretends to be.
pub fn create_native_check(
    mint_authority: COption<Pubkey>,
) -> impl Fn(bool) -> TokenBridgeRelayerResult<bool> {
    let is_wormhole_mint = mint_authority == COption::Some(crate::WORMHOLE_MINT_AUTHORITY);

    return move |expected_native| {
        // Valid values: either:
        // - The transfer is native and the mint is not the Wormhole one;
        // - Or the transfer is wrapped and the mint is the Wormhole one.
        (expected_native != is_wormhole_mint)
            .then_some(expected_native)
            .ok_or(TokenBridgeRelayerError::WrongMintAuthority)
    };
}
