use crate::{
    error::TokenBridgeRelayerError,
    state::{AdminState, TbrConfigState},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateTbrConfig<'info> {
    /// The signer may be the owner, or admin, depending on the operation.
    pub signer: Signer<'info>,

    /// Proof that the signer is an admin or the owner.
    #[account(
        seeds = [AdminState::SEED_PREFIX, signer.key.to_bytes().as_ref()],
        bump
    )]
    pub admin_badge: Account<'info, AdminState>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        mut,
        seeds = [TbrConfigState::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,
}

impl<'info> UpdateTbrConfig<'info> {
    pub fn only_owner(&self) -> Result<()> {
        require!(
            self.tbr_config.is_owner(self.signer.key),
            TokenBridgeRelayerError::OwnerOnly
        );

        Ok(())
    }

    pub fn only_pending_owner(&self) -> Result<()> {
        require!(
            self.tbr_config.is_pending_owner(self.signer.key),
            TokenBridgeRelayerError::PendingOwnerOnly
        );

        Ok(())
    }
}

pub fn update_fee_recipient(
    ctx: Context<UpdateTbrConfig>,
    new_fee_recipient: Pubkey,
) -> Result<()> {
    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.fee_recipient = new_fee_recipient;

    Ok(())
}

pub fn update_evm_transaction_config(
    ctx: Context<UpdateTbrConfig>,
    evm_transaction_gas: u64,
    evm_transaction_size: u64,
) -> Result<()> {
    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.evm_transaction_gas = evm_transaction_gas;
    tbr_config.evm_transaction_size = evm_transaction_size;

    Ok(())
}
