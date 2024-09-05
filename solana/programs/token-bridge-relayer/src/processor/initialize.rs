use crate::state::TbrConfigAccount;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Owner of the program as set in the [`OwnerConfig`] account.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Owner Config account. This program requires that the `owner` specified
    /// in the context equals the pubkey specified in this account. Mutable.
    #[account(
        init,
        payer = owner,
        space = 8 + TbrConfigAccount::INIT_SPACE,
        seeds = [TbrConfigAccount::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigAccount>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, quoter_program: Pubkey) -> Result<()> {
    let owner = ctx.accounts.owner.key();
    let tbr_config = &mut ctx.accounts.tbr_config;

    tbr_config.owner = owner;
    tbr_config.admin = owner;
    tbr_config.pending_owner = None;
    tbr_config.quoter_program_address = quoter_program;
    tbr_config.paused_outbound_transfers = true;
    tbr_config.relayer_fee = 0;
    tbr_config.fee_recipient = owner;
    tbr_config.evm_transaction_size = 0;

    Ok(())
}
