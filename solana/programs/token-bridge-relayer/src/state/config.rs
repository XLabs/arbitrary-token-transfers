use anchor_lang::prelude::*;
use wormhole_anchor_sdk::token_bridge;

/// The program's main account.
#[account]
#[derive(InitSpace)]
pub struct TbrConfigState {
    /// Program's owner.
    pub owner: Pubkey,
    /// Intermediate storage for the pending owner. Is used to transfer ownership.
    pub pending_owner: Option<Pubkey>,

    pub fee_recipient: Pubkey,

    pub evm_transaction_gas: u64,
    pub evm_transaction_size: u64,
}

impl TbrConfigState {
    // /// Has any authority:
    // /// - Owner
    // /// - Admin
    // pub fn is_owner_or_admin(&self, key: &Pubkey) -> bool {
    //     key == &self.owner || key == &self.admin
    // }

    /// Has owner authority:
    pub fn is_owner(&self, key: &Pubkey) -> bool {
        key == &self.owner
    }

    pub fn is_pending_owner(&self, key: &Pubkey) -> bool {
        self.pending_owner.as_ref() == Some(key)
    }

    /// Value `b"redeemer"`.
    ///
    /// It has to stay with that value because that is what the token-bridge is
    /// looking for.
    pub const SEED_PREFIX: &'static [u8; 8] = token_bridge::SEED_PREFIX_REDEEMER;
}
