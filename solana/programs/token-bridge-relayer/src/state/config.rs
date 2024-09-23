use anchor_lang::prelude::*;
use crate::state::AdminState;

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

    pub sender_bump: u8,
    pub redeemer_bump: u8,
    pub bump: u8,
}

impl TbrConfigState {
    pub fn is_owner_or_admin<'info>(
        &self,
        signer: &Signer<'info>,
        maybe_admin_badge: &Option<Account<'info, AdminState>>
    ) -> bool {
        Some(signer.key()) == maybe_admin_badge.as_ref().map(|state| state.address) ||
            signer.key() == self.owner
    }

    /// Value `b"config"`.
    pub const SEED_PREFIX: &'static [u8] = b"config";
}
