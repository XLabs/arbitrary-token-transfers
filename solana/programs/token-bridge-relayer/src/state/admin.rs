use anchor_lang::prelude::*;

/// A badge indicating that an admin account is authorized.
#[account]
#[derive(InitSpace)]
pub struct AdminState {
    pub address: Pubkey,
}

impl AdminState {
    /// Value `b"admin"`.
    pub const SEED_PREFIX: &'static [u8] = b"admin";
}
