use crate::{error::TokenBridgeRelayerError, message::PostedRelayerMessage};
use anchor_lang::prelude::*;

/// A peer chain. Nothing is stored in it for now.
#[account]
#[derive(InitSpace)]
pub struct PeerState {
    pub address: [u8; 32],
    pub chain: u16,
    pub bump: u8,
}

/// The config for a single chain.
#[account]
#[derive(InitSpace)]
pub struct ChainConfigState {
    pub canonical_peer: [u8; 32],
    /// The maximum amount of target token the user can ask a dropoff for, in µ-target-token.
    pub max_gas_dropoff_micro_token: u32,
    /// The fee for the relayer, in μUSD.
    pub relayer_fee_micro_usd: u32,
    pub paused_outbound_transfers: bool,
    pub bump: u8,
}

impl PeerState {
    /// Value `b"peer"`.
    pub const SEED_PREFIX: &'static [u8] = b"peer";
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
    pub const SEED_PREFIX: &'static [u8] = b"chainconfig";
}

impl PeerState {
    /// Checks that the peer matches the sender information from the VAA.
    pub fn check_origin(&self, vaa: &PostedRelayerMessage) -> Result<()> {
        require_eq!(
            self.chain,
            vaa.meta.emitter_chain,
            TokenBridgeRelayerError::InvalidSendingPeer
        );
        require!(
            &self.address == vaa.data().from_address(),
            TokenBridgeRelayerError::InvalidSendingPeer
        );

        Ok(())
    }
}
