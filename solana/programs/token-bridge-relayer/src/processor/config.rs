use crate::{
    error::TokenBridgeRelayerError,
    state::{AuthBadgeState, TbrConfigState},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateTbrConfig<'info> {
    /// The signer may be the owner, or admin, depending on the operation.
    pub signer: Signer<'info>,

    /// Proof that the signer is authorized.
    #[account(constraint = &auth_badge.address == signer.key @ TokenBridgeRelayerError::RequiresAuthBadge)]
    pub auth_badge: Account<'info, AuthBadgeState>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(mut)]
    pub tbr_config: Account<'info, TbrConfigState>,
}

pub fn update_fee_recipient(
    ctx: Context<UpdateTbrConfig>,
    new_fee_recipient: Pubkey,
) -> Result<()> {
    ctx.accounts.tbr_config.fee_recipient = new_fee_recipient;

    Ok(())
}

pub fn update_evm_transaction_config(
    ctx: Context<UpdateTbrConfig>,
    evm_transaction_gas: u32,
    evm_transaction_size: u32,
) -> Result<()> {
    let tbr_config = &mut ctx.accounts.tbr_config;
    tbr_config.evm_transaction_gas = evm_transaction_gas;
    tbr_config.evm_transaction_size = evm_transaction_size;

    Ok(())
}
