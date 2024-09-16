use crate::{error::TokenBridgeRelayerError, state::TbrConfigState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateTbrConfig<'info> {
    /// The signer may be the owner, pending owner or admin, depending on the operation.
    pub signer: Signer<'info>,

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

    pub fn only_owner_or_admin(&self) -> Result<()> {
        require!(
            self.tbr_config.is_owner_or_admin(self.signer.key),
            TokenBridgeRelayerError::OwnerOrAdminOnly
        );

        Ok(())
    }
}

pub fn update_fee_recipient(
    ctx: Context<UpdateTbrConfig>,
    new_fee_recipient: Pubkey,
) -> Result<()> {
    ctx.accounts.only_owner_or_admin()?;

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.fee_recipient = new_fee_recipient;

    Ok(())
}

pub fn update_evm_transaction_config(
    ctx: Context<UpdateTbrConfig>,
    evm_transaction_gas: u64,
    evm_transaction_size: u64,
) -> Result<()> {
    ctx.accounts.only_owner_or_admin()?;

    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.evm_transaction_gas = evm_transaction_gas;
    tbr_config.evm_transaction_size = evm_transaction_size;

    Ok(())
}
