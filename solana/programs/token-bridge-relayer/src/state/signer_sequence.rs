use anchor_lang::prelude::*;

/// Adds a number to a user's message PDA seed, so that a different account is
/// generated every transfer.
#[account]
#[derive(InitSpace)]
pub struct SignerSequenceState {
    pub value: u64,
    pub signer: Pubkey,
}

impl SignerSequenceState {
    pub const SEED_PREFIX: &'static [u8] = b"seq";

    pub fn take_and_uptick(&mut self) -> [u8; 8] {
        let seq = self.value;

        self.value += 1;

        seq.to_be_bytes()
    }
}

impl std::ops::Deref for SignerSequenceState {
    type Target = u64;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}
