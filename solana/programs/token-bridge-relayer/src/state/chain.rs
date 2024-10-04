use anchor_lang::prelude::*;

/// A peer chain for sending token to or from.
#[account]
#[derive(InitSpace)]
pub struct PeerState {
    pub chain_id: u16,
    pub address: [u8; 32],
}

/// The config for a single chain.
#[account]
#[derive(InitSpace)]
pub struct ChainConfigState {
    pub chain_id: u16,
    pub canonical_peer: [u8; 32],
    /// The maximum amount of target token the user can ask a dropoff for, in µ-target-token.
    pub max_gas_dropoff_micro_token: u32,
    /// The fee for the relayer, in μUSD.
    pub relayer_fee_micro_usd: u32,
    pub paused_outbound_transfers: bool,
}

impl PeerState {
    /// Value `b"peer"`.
    pub const SEED_PREFIX: &'static [u8] = b"peer";
}

impl ChainConfigState {
    pub fn is_uninitialized(&self) -> bool {
        self.chain_id == 0
    }

    /// Value `b"chainconfig"`.
    pub const SEED_PREFIX: &'static [u8] = b"chainconfig";
}
