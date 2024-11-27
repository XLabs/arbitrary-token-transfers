use crate::{
    error::{TokenBridgeRelayerError, TokenBridgeRelayerResult},
    state::{ChainConfigState, TbrConfigState},
};
use anchor_lang::{
    prelude::*,
    solana_program::{native_token::LAMPORTS_PER_SOL, program_option::COption},
};
use anchor_spl::token::Mint;
use solana_price_oracle::state::{EvmPricesState, PriceOracleConfigState};

const MWEI_PER_MICRO_ETH: u64 = 1_000_000;
const MWEI_PER_ETH: u128 = 1_000_000_000_000;

/// Returns the transfer fee in lamports.
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
/// - `gas_dropoff_amount_micro`: the amount of target token the user wants, in µ-target-token.
pub fn calculate_total_fee(
    config: &TbrConfigState,
    chain_config: &ChainConfigState,
    oracle_evm_prices: &EvmPricesState,
    oracle_config: &PriceOracleConfigState,
    dropoff_amount_micro: u32,
) -> Result<u64> {
    check_prices_are_set(oracle_evm_prices)?;

    /*
    msg!(
        "Values:
    EVM transaction gas: {}Gas
    EVM gas price: {}Mwei/gas
    EVM transaction size: {}Bytes
    EVM price per byte: {}Mwei/byte
    Dropoff amount: {}µToken
    Gas token price: {}µUSD/Token
    Relayer fee: {}µUSD
    Sol price: {}µUSD/SOL",
        config.evm_transaction_gas,
        oracle_evm_prices.gas_price,
        config.evm_transaction_size,
        oracle_evm_prices.price_per_byte,
        dropoff_amount_micro,
        oracle_evm_prices.gas_token_price,
        chain_config.relayer_fee_micro_usd,
        oracle_config.sol_price,
    );
    */

    // Mwei = gas * Mwei/gas + bytes * Mwei/byte + µToken * Mwei/µToken
    let total_fees_mwei = config.evm_transaction_gas * u64::from(oracle_evm_prices.gas_price)
        + config.evm_transaction_size * u64::from(oracle_evm_prices.price_per_byte)
        + u64::from(dropoff_amount_micro) * MWEI_PER_MICRO_ETH;

    // μusd = Mwei * μusd/Token / Mwei/Token + μusd)
    let total_fees_micro_usd = u64::try_from(
        u128::from(total_fees_mwei) * u128::from(oracle_evm_prices.gas_token_price) / MWEI_PER_ETH,
    )
    .expect("Overflow")
        + u64::from(chain_config.relayer_fee_micro_usd);

    // lamports/SOL * μusd / μusd/SOL
    Ok((LAMPORTS_PER_SOL * total_fees_micro_usd) / oracle_config.sol_price)
}

/// This is a basic security against a wrong manip, to be sure that the prices
/// have been set correctly.
fn check_prices_are_set(evm_prices: &EvmPricesState) -> Result<()> {
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

    // We don't need to check the SOL price, because it will cause a division by 0

    Ok(())
}

impl TbrConfigState {
    /// Creates a closure allowing to verify that a native/wrapped transfer is indeed
    /// what it pretends to be.
    pub(crate) fn create_native_check(
        &self,
        mint_authority: COption<Pubkey>,
    ) -> impl Fn(bool) -> TokenBridgeRelayerResult<bool> {
        let is_wormhole_mint = mint_authority == COption::Some(self.mint_authority);

        return move |expected_native| {
            // Valid values: either:
            // - The transfer is native and the mint is not the Wormhole one;
            // - Or the transfer is wrapped and the mint is the Wormhole one.
            (expected_native != is_wormhole_mint)
                .then_some(expected_native)
                .ok_or(TokenBridgeRelayerError::WrongMintAuthority)
        };
    }
}

/// The Token Bridge uses 8 decimals. If we want to transfer a token whose mint has more decimals,
/// we need to set the decimals past 8 to zero.
pub fn normalize_token_amount(transferred_amount: u64, mint: &Mint) -> u64 {
    if mint.decimals > 8 {
        //WARNING: Do not compute the values. It is heavy and make the call exceed the CU limit.
        let factor = match mint.decimals - 8 {
            1 => 10,
            2 => 100,
            3 => 1000,
            4 => 10_000,
            5 => 100_000,
            6 => 1000_000,
            7 => 10_000_000,
            8 => 100_000_000,
            9 => 1000_000_000,
            10 => 10_000_000_000,
            11 => 100_000_000_000,
            12 => 1000_000_000_000,
            13 => 10_000_000_000_000,
            14 => 100_000_000_000_000,
            15 => 1000_000_000_000_000,
            16 => 10_000_000_000_000_000,
            _ => panic!("Too many decimals in the mint"),
        };

        transferred_amount / factor * factor
    } else {
        transferred_amount
    }
}
