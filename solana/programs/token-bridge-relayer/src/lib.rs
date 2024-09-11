mod error;
mod message;
mod processor;
mod state;

use anchor_lang::prelude::*;
use processor::*;

type TargetChainGas = u64;
type KiloLamports = u64;

cfg_if::cfg_if! {
    if #[cfg(feature = "mainnet")] {
        declare_id!("46kv4wCpfEtLsHPDh4zm7jJb2pVdvke8Pj2ABYYJotFD");
        const WORMHOLE_MINT_AUTHORITY: Pubkey = anchor_lang::pubkey!("BCD75RNBHrJJpW4dXVagL5mPjzRLnVZq4YirJdjEYMV7");
    } else if #[cfg(feature = "solana-devnet")] {
        declare_id!("46kv4wCpfEtLsHPDh4zm7jJb2pVdvke8Pj2ABYYJotFD");
        const WORMHOLE_MINT_AUTHORITY: Pubkey = anchor_lang::pubkey!("rRsXLHe7sBHdyKU3KY3wbcgWvoT1Ntqudf6e9PKusgb");
    } else if #[cfg(feature = "tilt-devnet")] {
        declare_id!("46kv4wCpfEtLsHPDh4zm7jJb2pVdvke8Pj2ABYYJotFD");
        const WORMHOLE_MINT_AUTHORITY: Pubkey = anchor_lang::pubkey!("8P2wAnHr2t4pAVEyJftzz7k6wuCE7aP1VugNwehzCJJY");
    }
}

pub mod constant {
    use anchor_lang::prelude::*;

    #[constant]
    pub const SEED_PREFIX_BRIDGED: &[u8] = b"bridged";

    #[constant]
    pub const SEED_PREFIX_TEMPORARY: &[u8] = b"tmp";
}

#[program]
pub mod token_bridge_relayer {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        processor::initialize(ctx)
    }

    /* Roles */

    /// Updates the owner account. This needs to be either cancelled or approved.
    pub fn submit_owner_transfer_request(
        ctx: Context<UpdateTbrConfig>,
        new_owner: Pubkey,
    ) -> Result<()> {
        processor::submit_owner_transfer_request(ctx, new_owner)
    }

    /// The new owner confirms to be so.
    pub fn confirm_owner_transfer_request(ctx: Context<UpdateTbrConfig>) -> Result<()> {
        processor::confirm_owner_transfer_request(ctx)
    }

    /// The owner role transfer is cancelled by the current one.
    pub fn cancel_owner_transfer_request(ctx: Context<UpdateTbrConfig>) -> Result<()> {
        processor::cancel_owner_transfer_request(ctx)
    }

    /// Updates the admin account.
    pub fn update_admin(ctx: Context<UpdateTbrConfig>, new_admin: Pubkey) -> Result<()> {
        processor::update_admin(ctx, new_admin)
    }

    /* Peer management */

    /// Register a new peer for the given chain.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn register_peer(
        ctx: Context<RegisterPeer>,
        _chain_id: u16,
        peer_address: [u8; 32],
    ) -> Result<()> {
        processor::register_peer(ctx, peer_address)
    }

    /// Set a different peer as canonical.
    ///
    /// # Authorization
    ///
    /// Owner.
    pub fn update_canonical_peer(
        ctx: Context<UpdateCanonicalPeer>,
        _chain_id: u16,
        peer_address: [u8; 32],
    ) -> Result<()> {
        processor::update_canonical_peer(ctx, peer_address)
    }

    /* Config update */

    /// Forbids or allows any outbound transfer, *i.e.* from this chain.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn set_pause_for_outbound_transfers(
        ctx: Context<UpdateChainConfig>,
        _chain_id: u16,
        paused: bool,
    ) -> Result<()> {
        processor::set_pause_for_outbound_transfers(ctx, paused)
    }

    /// Updates the account to which the fees will be sent.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_fee_recipient(
        ctx: Context<UpdateTbrConfig>,
        new_fee_recipient: Pubkey,
    ) -> Result<()> {
        processor::update_fee_recipient(ctx, new_fee_recipient)
    }

    /* Chain config */

    /// What is the maximum allowed gas dropoff for this chain.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_max_gas_dropoff(
        ctx: Context<UpdateChainConfig>,
        _chain_id: u16,
        max_gas_dropoff: TargetChainGas,
    ) -> Result<()> {
        processor::update_max_gas_dropoff(ctx, max_gas_dropoff)
    }

    /// Updates the value of the relayer fee, *i.e.* the flat USD amount
    /// to pay for a transfer to be done.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_relayer_fee(
        ctx: Context<UpdateChainConfig>,
        _chain_id: u16,
        relayer_fee: u64,
    ) -> Result<()> {
        processor::update_relayer_fee(ctx, relayer_fee)
    }

    /// Updates the transaction size of the EVM receiving side.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_evm_transaction_config(
        ctx: Context<UpdateTbrConfig>,
        evm_transaction_gas: u64,
        evm_transaction_size: u64,
    ) -> Result<()> {
        processor::update_evm_transaction_size(ctx, evm_transaction_gas, evm_transaction_size)
    }

    /* Transfers */

    pub fn transfer_tokens(
        ctx: Context<OutboundTransfer>,
        recipient_chain: u16,
        recipient_address: [u8; 32],
        transferred_amount: u64,
        gas_dropoff_amount: TargetChainGas,
        max_fee_klam: KiloLamports,
    ) -> Result<()> {
        processor::transfer_tokens(
            ctx,
            recipient_chain,
            transferred_amount,
            gas_dropoff_amount,
            max_fee_klam,
            recipient_address,
        )
    }

    /// Complete a transfer initiated from another chain.
    pub fn complete_transfer(ctx: Context<CompleteTransfer>, _vaa_hash: [u8; 32]) -> Result<()> {
        processor::complete_transfer(ctx)
    }
}
