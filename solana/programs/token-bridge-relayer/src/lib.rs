mod constants;
mod error;
mod message;
mod processor;
mod state;

use anchor_lang::prelude::*;
use processor::*;

type TargetChainGas = u64;
type KiloLamports = u64;

declare_id!("46kv4wCpfEtLsHPDh4zm7jJb2pVdvke8Pj2ABYYJotFD");

#[program]
pub mod token_bridge_relayer {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, quoter_program: Pubkey) -> Result<()> {
        processor::initialize(ctx, quoter_program)
    }

    /* Roles */

    /// Updates the owner account. This needs to be either cancelled or approved.
    pub fn submit_owner_transfer_request(
        ctx: Context<ConfigUpdate>,
        new_owner: Pubkey,
    ) -> Result<()> {
        processor::submit_owner_transfer_request(ctx, new_owner)
    }

    /// The new owner confirms to be so.
    pub fn confirm_owner_transfer_request(ctx: Context<ConfigUpdate>) -> Result<()> {
        processor::confirm_owner_transfer_request(ctx)
    }

    /// The owner role transfer is cancelled by the current one.
    pub fn cancel_owner_transfer_request(ctx: Context<ConfigUpdate>) -> Result<()> {
        processor::cancel_owner_transfer_request(ctx)
    }

    /// Updates the admin account.
    pub fn update_admin(ctx: Context<ConfigUpdate>, new_admin: Pubkey) -> Result<()> {
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
    pub fn update_canonical(
        ctx: Context<UpdateCanonical>,
        _chain_id: u16,
        peer_address: [u8; 32],
    ) -> Result<()> {
        processor::update_canonical(ctx, peer_address)
    }

    /* Config update */

    /// Forbids or allows any outbound transfer, *i.e.* from this chain.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn set_pause_for_outbound_transfers(
        ctx: Context<ConfigUpdate>,
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
        ctx: Context<ConfigUpdate>,
        new_fee_recipient: Pubkey,
    ) -> Result<()> {
        processor::update_fee_recipient(ctx, new_fee_recipient)
    }

    /// What is the maximum allowed gas dropoff for this chain.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_max_gas_dropoff(
        ctx: Context<UpdateMaxGasDropoff>,
        _chain_id: u16,
        max_gas_dropoff: u64,
    ) -> Result<()> {
        processor::update_max_gas_dropoff(ctx, max_gas_dropoff)
    }

    /// Updates the value of the relayer fee, *i.e.* the flat USD amount
    /// to pay for a transfer to be done.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_relayer_fee(ctx: Context<ConfigUpdate>, relayer_fee: u64) -> Result<()> {
        processor::update_relayer_fee(ctx, relayer_fee)
    }

    /// Updates the transaction size of the EVM receiving side.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_evm_transaction_config(
        ctx: Context<ConfigUpdate>,
        evm_transaction_gas: u64,
        evm_transaction_size: u64,
    ) -> Result<()> {
        processor::update_evm_transaction_size(ctx, evm_transaction_gas, evm_transaction_size)
    }

    /// Updates the address of the quoter program to fetch the prices from.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_quoter_program_address(
        ctx: Context<ConfigUpdate>,
        quoter_program_address: Pubkey,
    ) -> Result<()> {
        processor::update_quoter_program_address(ctx, quoter_program_address)
    }

    /* Transfers */

    /// Transfers original tokens to another chain.
    pub fn transfer_native_tokens(
        ctx: Context<OutboundTransfer>,
        recipient_chain: u16,
        recipient_address: [u8; 32],
        transferred_amount: u64,
        gas_dropoff_amount: TargetChainGas,
        max_fee_sol: KiloLamports,
    ) -> Result<()> {
        processor::transfer_native_tokens(
            ctx,
            recipient_chain,
            transferred_amount,
            gas_dropoff_amount,
            max_fee_sol,
            recipient_address,
        )
    }

    /// Transfers Wormhole tokens back to their original chain.
    pub fn transfer_wrapped_tokens(
        ctx: Context<OutboundTransfer>,
        recipient_chain: u16,
        recipient_address: [u8; 32],
        transferred_amount: u64,
        gas_dropoff_amount: TargetChainGas,
        max_fee_sol: KiloLamports,
    ) -> Result<()> {
        processor::transfer_wrapped_tokens(
            ctx,
            recipient_chain,
            transferred_amount,
            gas_dropoff_amount,
            max_fee_sol,
            recipient_address,
        )
    }

    /// Complete a native transfer initiated on another chain.
    pub fn complete_native_transfer(
        ctx: Context<CompleteTransfer>,
        _vaa_hash: [u8; 32],
    ) -> Result<()> {
        processor::complete_native_transfer(ctx)
    }

    /// Complete a wrapped transfer initiated on another chain.
    pub fn complete_wrapped_transfer(
        ctx: Context<CompleteTransfer>,
        _vaa_hash: [u8; 32],
    ) -> Result<()> {
        processor::complete_wrapped_transfer(ctx)
    }
}
