use anchor_lang::prelude::*;

/// A peer chain. Nothing is stored in it for now.
#[account]
#[derive(InitSpace)]
pub struct PeerAccount {}

/// The config for every chain.
#[account]
#[derive(InitSpace)]
pub struct ChainConfigAccount {
    pub canonical_peer_address: [u8; 32],
    pub max_gas_dropoff: u64,
}

impl PeerAccount {
    /// AKA `b"peer"`.
    pub const SEED_PREFIX: &'static [u8; 4] = b"peer";
}

impl ChainConfigAccount {
    pub fn is_uninitialized(&self) -> bool {
        self.canonical_peer_address == [0; 32]
    }

    /// AKA `b"canonical"`.
    pub const SEED_PREFIX: &'static [u8; 9] = b"canonical";
}
