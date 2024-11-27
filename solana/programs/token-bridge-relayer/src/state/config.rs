use anchor_lang::prelude::*;

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

    /// The mint authority used by the Token Bridge. Used to check whether a transfer is native
    /// or wrapped.
    pub mint_authority: Pubkey,

    pub sender_bump: u8,
    pub redeemer_bump: u8,
    pub bump: u8,
}

impl TbrConfigState {
    pub fn is_pending_owner(&self, account: &impl Key) -> bool {
        self.pending_owner == Some(account.key())
    }

    /// Value `b"config"`.
    pub const SEED_PREFIX: &'static [u8] = b"config";
}
