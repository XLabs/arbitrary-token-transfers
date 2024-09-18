use anchor_lang::prelude::*;
use wormhole_anchor_sdk::token_bridge;

/// Empty account. Exists only because the Wormhole program expects it.
#[account]
#[derive(Default, InitSpace)]
pub struct SenderState {}

impl SenderState {
    /// Value: sender.
    pub const SEED_PREFIX: &'static [u8] = token_bridge::SEED_PREFIX_SENDER;
}
