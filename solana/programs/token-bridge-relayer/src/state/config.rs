use anchor_lang::prelude::*;

/// The program's main account.
#[account]
#[derive(InitSpace)]
pub struct TbrConfigAccount {
    /// Program's owner.
    pub owner: Pubkey,
    /// Program's admin. Can be used to update the quotes or appoint a new price updater.
    pub admin: Pubkey,
    /// Intermediate storage for the pending owner. Is used to transfer ownership.
    pub pending_owner: Option<Pubkey>,

    pub quoter_program_address: Pubkey,
    pub fee_recipient: Pubkey,

    //pub token_bridge_address: Pubkey,
    pub paused_outbound_transfers: bool,
    /// The fee for the relayer, in μUSD.
    pub relayer_fee: u64,
    pub evm_transaction_gas: u64,
    pub evm_transaction_size: u64,
}

impl TbrConfigAccount {
    /// Has any authority:
    /// - Owner
    /// - Admin
    pub fn is_authorized(&self, key: &Pubkey) -> bool {
        key == &self.owner || key == &self.admin
    }

    /// Has owner authority:
    pub fn is_owner(&self, key: &Pubkey) -> bool {
        key == &self.owner
    }

    pub fn is_pending_owner(&self, key: &Pubkey) -> bool {
        self.pending_owner.as_ref() == Some(key)
    }

    /// AKA `b"config"`.
    pub const SEED_PREFIX: &'static [u8; 6] = b"config";
}
