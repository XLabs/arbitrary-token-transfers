use anchor_lang::prelude::*;

/// A peer chain. Nothing is stored in it for now.
#[account]
#[derive(InitSpace)]
pub struct AdminState {}

impl AdminState {
    /// Value `b"admin"`.
    pub const SEED_PREFIX: &'static [u8; 5] = b"admin";
}
