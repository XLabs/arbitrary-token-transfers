use crate::error::TokenBridgeRelayerError;
use anchor_lang::prelude::*;

/// A peer chain. Nothing is stored in it for now.
#[account]
#[derive(InitSpace)]
pub struct PeerState {}

/// The config for a single chain.
#[account]
#[derive(InitSpace)]
pub struct ChainConfigState {
    pub canonical_peer: [u8; 32],
    /// The maximum amount of target token the user can ask a dropoff for, in µ-target-token.
    pub max_gas_dropoff_micro_token: u32,
    pub paused_outbound_transfers: bool,
    /// The fee for the relayer, in μUSD.
    pub relayer_fee_micro_usd: u32,
}

impl PeerState {
    /// Value `b"peer"`.
    pub const SEED_PREFIX: &'static [u8; 4] = b"peer";
}

impl ChainConfigState {
    pub fn is_uninitialized(&self) -> bool {
        self.canonical_peer == [0; 32]
    }

    /// Returns an error if the transfers are paused for this chain.
    pub fn transfer_allowed(&self) -> Result<()> {
        require!(
            false == self.paused_outbound_transfers,
            TokenBridgeRelayerError::PausedTransfers
        );

        Ok(())
    }

    /// Value `b"chainconfig"`.
    pub const SEED_PREFIX: &'static [u8; 11] = b"chainconfig";
}
