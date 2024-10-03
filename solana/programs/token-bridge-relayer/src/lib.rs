mod error;
mod message;
mod processor;
mod state;
mod utils;

use anchor_lang::prelude::*;
use processor::*;

cfg_if::cfg_if! {
    if #[cfg(feature = "mainnet")] {
        declare_id!("AtTrxsPbTfBhC9uwwJGJbkFMux78t5EWTAXAbwUW8yC7");
        const WORMHOLE_MINT_AUTHORITY: Pubkey = anchor_lang::pubkey!("BCD75RNBHrJJpW4dXVagL5mPjzRLnVZq4YirJdjEYMV7");
    } else if #[cfg(feature = "solana-devnet")] {
        declare_id!("ATT7enfWTMV4dDTe2NQ2yBaTByuXXwrYRznsioQEUW6r");
        const WORMHOLE_MINT_AUTHORITY: Pubkey = anchor_lang::pubkey!("rRsXLHe7sBHdyKU3KY3wbcgWvoT1Ntqudf6e9PKusgb");
    } else if #[cfg(feature = "tilt-devnet")] {
        declare_id!("46kv4wCpfEtLsHPDh4zm7jJb2pVdvke8Pj2ABYYJotFD");
        const WORMHOLE_MINT_AUTHORITY: Pubkey = anchor_lang::pubkey!("8P2wAnHr2t4pAVEyJftzz7k6wuCE7aP1VugNwehzCJJY");
    } else if #[cfg(feature = "localnet")] {
        declare_id!("7TLiBkpDGshV4o3jmacTCx93CLkmo3VjZ111AsijN9f8");
        const WORMHOLE_MINT_AUTHORITY: Pubkey = anchor_lang::pubkey!("BCD75RNBHrJJpW4dXVagL5mPjzRLnVZq4YirJdjEYMV7");
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

    pub fn initialize<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Initialize<'info>>,
        fee_recipient: Pubkey,
        admins: Vec<Pubkey>,
    ) -> Result<()> {
        processor::initialize(ctx, fee_recipient, admins)
    }

    /* Roles */

    /// Updates the owner account. This needs to be either cancelled or approved.
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

    /// Register a new peer for the given chain.
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
    pub fn update_relayer_fee(ctx: Context<UpdateChainConfig>, relayer_fee: u32) -> Result<()> {
        processor::update_relayer_fee(ctx, relayer_fee)
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
        evm_transaction_gas: u64,
        evm_transaction_size: u64,
    ) -> Result<()> {
        processor::update_evm_transaction_config(ctx, evm_transaction_gas, evm_transaction_size)
    }

    /* Transfers */

    /// # Parameters
    ///
    /// - `dropoff_amount_micro`: the dropoff in µ-target-token.
    /// - `max_fee_klam`: the maximum fee the user is willing to pay, in Klamports, aka µSOL.
    pub fn transfer_tokens(
        ctx: Context<OutboundTransfer>,
        recipient_address: [u8; 32],
        transferred_amount: u64,
        unwrap_intent: bool,
        dropoff_amount_micro: u32,
        max_fee_klam: u64,
    ) -> Result<()> {
        processor::transfer_tokens(
            ctx,
            transferred_amount,
            unwrap_intent,
            dropoff_amount_micro,
            max_fee_klam,
            recipient_address,
        )
    }

    /// Complete a transfer initiated from another chain.
    pub fn complete_transfer(ctx: Context<CompleteTransfer>, _vaa_hash: [u8; 32]) -> Result<()> {
        processor::complete_transfer(ctx)
    }

    /* Helpers */

    /// Returns a quote for a transfer, in µUSD.
    pub fn relaying_fee(ctx: Context<QuoteQuery>, dropoff_amount_micro: u32) -> Result<u64> {
        processor::relaying_fee(ctx, dropoff_amount_micro)
    }
}
