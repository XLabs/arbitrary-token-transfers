mod error;
mod id;
mod message;
mod processor;
mod state;
mod utils;

use anchor_lang::prelude::*;
use processor::*;

pub use id::ID;

pub mod constant {
    use anchor_lang::prelude::*;

    #[constant]
    pub const SEED_PREFIX_BRIDGED: &[u8] = b"bridged";

    #[constant]
    pub const SEED_PREFIX_TEMPORARY: &[u8] = b"tmp";

    #[constant]
    pub const SEED_PREFIX_UPGRADE_LOCK: &[u8] = b"upgrade_lock";
}

#[program]
pub mod token_bridge_relayer {
    use super::*;

    pub fn initialize<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Initialize<'info>>,
        fee_recipient: Pubkey,
        admins: Vec<Pubkey>,
    ) -> Result<()> {
        processor::initialize(ctx, fee_recipient, admins)
    }

    /* Roles */

    /// Updates the owner account. This needs to be either cancelled or approved.
    ///
    /// For safety reasons, transferring ownership is a 2-step process. This first step is to set the
    /// new owner, and the second step is for the new owner to claim the ownership.
    /// This is to prevent a situation where the ownership is transferred to an
    /// address that is not able to claim the ownership (by mistake).
    pub fn submit_owner_transfer_request(
        ctx: Context<SubmitOwnerTransfer>,
        new_owner: Pubkey,
    ) -> Result<()> {
        processor::submit_owner_transfer_request(ctx, new_owner)
    }

    /// The new owner confirms to be so.
    pub fn confirm_owner_transfer_request(ctx: Context<ConfirmOwnerTransfer>) -> Result<()> {
        processor::confirm_owner_transfer_request(ctx)
    }

    /// The owner role transfer is cancelled by the current one.
    pub fn cancel_owner_transfer_request(ctx: Context<CancelOwnerTransfer>) -> Result<()> {
        processor::cancel_owner_transfer_request(ctx)
    }

    /// Adds a new admin account.
    pub fn add_admin(ctx: Context<AddAdmin>, new_admin: Pubkey) -> Result<()> {
        processor::add_admin(ctx, new_admin)
    }

    /// Removes a previously added admin account.
    pub fn remove_admin(ctx: Context<RemoveAdmin>) -> Result<()> {
        processor::remove_admin(ctx)
    }

    /* Peer management */

    /// Register a new peer for the given chain. If this peer is the first one to be registered
    /// on this chain,  it becomes the canonical peer for this chain.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn register_peer(
        ctx: Context<RegisterPeer>,
        chain_id: u16,
        peer_address: [u8; 32],
    ) -> Result<()> {
        processor::register_peer(ctx, chain_id, peer_address)
    }

    /// Set a different peer as canonical.
    ///
    /// # Authorization
    ///
    /// Owner.
    pub fn update_canonical_peer(ctx: Context<UpdateCanonicalPeer>) -> Result<()> {
        processor::update_canonical_peer(ctx)
    }

    /* Chain config */

    /// Forbids or allows any outbound transfer, *i.e.* from this chain.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn set_pause_for_outbound_transfers(
        ctx: Context<UpdateChainConfig>,
        paused: bool,
    ) -> Result<()> {
        processor::set_pause_for_outbound_transfers(ctx, paused)
    }

    /// What is the maximum allowed gas dropoff for this chain.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_max_gas_dropoff(
        ctx: Context<UpdateChainConfig>,
        max_gas_dropoff_micro_token: u32,
    ) -> Result<()> {
        processor::update_max_gas_dropoff(ctx, max_gas_dropoff_micro_token)
    }

    /// Updates the value of the relayer fee, *i.e.* the flat USD amount
    /// to pay for a transfer to be done.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_relayer_fee(
        ctx: Context<UpdateChainConfig>,
        relayer_fee_micro_usd: u32,
    ) -> Result<()> {
        processor::update_relayer_fee(ctx, relayer_fee_micro_usd)
    }

    /* Config update */

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

    /// Updates the transaction size of the EVM receiving side.
    ///
    /// # Authorization
    ///
    /// Owner or Admin.
    pub fn update_evm_transaction_config(
        ctx: Context<UpdateTbrConfig>,
        evm_transaction_gas: u32,
        evm_transaction_size: u32,
    ) -> Result<()> {
        processor::update_evm_transaction_config(ctx, evm_transaction_gas, evm_transaction_size)
    }

    /* Transfers */

    /// # Parameters
    ///
    /// - `dropoff_amount_micro`: the dropoff in µ-target-token.
    /// - `max_fee_lamports`: the maximum fee the user is willing to pay, in lamports.
    pub fn transfer_tokens(
        ctx: Context<OutboundTransfer>,
        temporary_account_bump: u8,
        wormhole_message_bump: u8,
        recipient_address: [u8; 32],
        transferred_amount: u64,
        unwrap_intent: bool,
        dropoff_amount_micro: u32,
        max_fee_lamports: u64,
    ) -> Result<()> {
        processor::transfer_tokens(
            ctx,
            temporary_account_bump,
            wormhole_message_bump,
            transferred_amount,
            unwrap_intent,
            dropoff_amount_micro,
            max_fee_lamports,
            recipient_address,
        )
    }

    /// Complete a transfer initiated from another chain.
    pub fn complete_transfer(
        ctx: Context<CompleteTransfer>,
        temporary_account_bump: u8,
    ) -> Result<()> {
        processor::complete_transfer(ctx, temporary_account_bump)
    }

    /* Helpers */

    /// Returns a quote for a transfer, in µUSD.
    pub fn relaying_fee(ctx: Context<QuoteQuery>, dropoff_amount_micro: u32) -> Result<u64> {
        processor::relaying_fee(ctx, dropoff_amount_micro)
    }
}
