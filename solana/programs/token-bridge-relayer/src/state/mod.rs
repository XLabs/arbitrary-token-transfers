mod config;
pub use config::*;

mod chain;
pub use chain::*;

mod signer_sequence;
pub use signer_sequence::*;
use solana_price_oracle::state::{EvmPricesAccount, PriceOracleConfigAccount};

const KLAMPORTS_PER_SOL: u64 = 1_000_000;

/// Returns the transfer fee in Klamports.
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
    target_evm_quote: &EvmPricesAccount,
    local_quote: &PriceOracleConfigAccount,
    relayer_fee: u64,
    dropoff_amount: u32,
) -> u64 {
    // gas * Mwei/gas + bytes * Mwei/byte + Mwei
    let total_fees_mwei = config.evm_transaction_gas * u64::from(target_evm_quote.gas_price)
        + config.evm_transaction_size * u64::from(target_evm_quote.price_per_byte)
        + u64::from(dropoff_amount);

    //  Mwei * μusd/Mwei + μusd
    let total_fees_usd = total_fees_mwei * target_evm_quote.gas_token_price + relayer_fee;

    // Klamports/SOL * μusd / μusd/SOL
    (KLAMPORTS_PER_SOL * total_fees_usd) / local_quote.sol_price
}
