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
    pub max_gas_dropoff: u64,
    pub paused_outbound_transfers: bool,
    /// The fee for the relayer, in μUSD.
    pub relayer_fee: u64,
}

impl PeerState {
    /// AKA `b"peer"`.
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

    /// AKA `b"chainconfig"`.
    pub const SEED_PREFIX: &'static [u8; 11] = b"chainconfig";
}
