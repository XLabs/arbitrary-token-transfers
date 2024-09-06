mod config;
pub use config::*;

mod chain;
pub use chain::*;

mod foreign_contract;
pub use foreign_contract::*;

mod signer_sequence;
pub use signer_sequence::*;
use solana_price_oracle::state::{EvmPricesAccount, PriceOracleConfigAccount};

const KLAMPORTS_PER_SOL: u64 = 1_000_000;

/// Returns the transfer fee in Klamports.
///
/// # Arguments
///
/// - `config`: the config for this program (hold the EVM info and the relayer fee).
/// - `target_evm_quote`: (quoter program) the prices for the EVM chain the tokens will be sent to.
/// - `local_quote`: (quoter program) the prices for the local Solana chain.
/// - `chain_id`: the ID of the target chain.
/// - `dropoff_amount`: the amount of target token the user wants.
pub fn calculate_total_fee(
    config: &TbrConfigAccount,
    target_evm_quote: &EvmPricesAccount,
    local_quote: &PriceOracleConfigAccount,
    recipient_chain: u16,
    dropoff_amount: u32,
) -> u64 {
    let transaction_size = if evm_tx_size_matters(recipient_chain) {
        config.evm_transaction_size
    } else {
        0
    };

    // gas * Mwei/gas + bytes * Mwei/byte + Mwei
    let total_fees_mwei = config.evm_transaction_gas * u64::from(target_evm_quote.gas_price)
        + transaction_size * u64::from(target_evm_quote.blob_base_fee)
        + u64::from(dropoff_amount);

    //  Mwei * μusd/Mwei + μusd
    let total_fees_usd = total_fees_mwei * target_evm_quote.gas_token_price + config.relayer_fee;

    // Klamports/SOL * μusd / μusd/SOL
    (KLAMPORTS_PER_SOL * total_fees_usd) / local_quote.sol_price
}

/// Returns whether the transaction size changes the transaction price or not.
///
/// This are the chain where it matters (from the SDK):
/// [ARBITRUM, BASE, OPTIMISM, BLAST, SCROLL, ARBITRUM_SEPOLIA, OPTIMISM_SEPOLIA, BASE_SEPOLIA];
fn evm_tx_size_matters(chain_id: u16) -> bool {
    const ARBITRUM: u16 = 8;
    const OPTIMISM: u16 = 9;
    const BASE: u16 = 11;
    const ARBITRUM_SEPOLIA: u16 = 13;
    const OPTIMISM_SEPOLIA: u16 = 14;
    const BASE_SEPOLIA: u16 = 15;
    const SCROLL: u16 = 16;
    const BLAST: u16 = 17;

    chain_id == ARBITRUM
        || chain_id == OPTIMISM
        || chain_id == BASE
        || chain_id == ARBITRUM_SEPOLIA
        || chain_id == OPTIMISM_SEPOLIA
        || chain_id == BASE_SEPOLIA
        || chain_id == SCROLL
        || chain_id == BLAST
}
