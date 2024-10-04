use anchor_lang::prelude::*;

/// A badge indicating that an admin account is authorized.
#[account]
#[derive(InitSpace)]
pub struct AuthBadgeState {
    pub address: Pubkey,
}

impl AuthBadgeState {
    /// Value `b"authbadge"`.
    pub const SEED_PREFIX: &'static [u8] = b"authbadge";
}
