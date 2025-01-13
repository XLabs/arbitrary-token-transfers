use crate::{
    error::TokenBridgeRelayerError,
    state::{AuthBadgeState, TbrConfigState},
    utils::DrainAccount,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{bpf_loader_upgradeable, program::invoke};
use std::{iter::zip, ops::DerefMut};
use wormhole_anchor_sdk::token_bridge;

#[derive(Accounts)]
#[instruction(admin: Pubkey)]
pub struct Initialize<'info> {
    /// Since we are passing on the upgarde authority, the original deployer is the only one
    /// who can initialize the program.
    #[account(mut)]
    pub deployer: Signer<'info>,

    /// CHECK: The account to be used as the owner of the program.
    pub owner: UncheckedAccount<'info>,

    #[account(
        init,
        payer = deployer,
        space = 8 + AuthBadgeState::INIT_SPACE,
        seeds = [AuthBadgeState::SEED_PREFIX, owner.key.to_bytes().as_ref()],
        bump
    )]
    pub auth_badge: Account<'info, AuthBadgeState>,

    /// Owner Config account. This program requires that the `owner` specified
    /// in the context equals the pubkey specified in this account.
    #[account(
        init,
        payer = deployer,
        space = 8 + TbrConfigState::INIT_SPACE,
        seeds = [TbrConfigState::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        mut,
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
    )]
    program_data: Account<'info, ProgramData>,

    /// CHECK: An account used by the Token Bridge.
    #[account(
        seeds = [token_bridge::SEED_PREFIX_SENDER],
        bump
    )]
    pub wormhole_sender: UncheckedAccount<'info>,

    /// CHECK: An account used by the Token Bridge.
    #[account(
        seeds = [token_bridge::SEED_PREFIX_REDEEMER],
        bump
    )]
    pub wormhole_redeemer: UncheckedAccount<'info>,

    /// CHECK: The BPF loader program.
    #[account(address = bpf_loader_upgradeable::ID)]
    pub bpf_loader_upgradeable: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, Initialize<'info>>,
    fee_recipient: Pubkey,
    admins: Vec<Pubkey>,
) -> Result<()> {
    //We only update the upgrade authority if the program wasn't deployed by the designated owner
    if Some(ctx.accounts.owner.key()) != ctx.accounts.program_data.upgrade_authority_address {
        //This call fails for anyone but the deployer who must be the current update authority.
        invoke(
            &bpf_loader_upgradeable::set_upgrade_authority(
                &ctx.program_id,
                &ctx.accounts.deployer.key(),
                Some(&ctx.accounts.owner.key()),
            ),
            &[
                ctx.accounts.program_data.to_account_info(),
                ctx.accounts.deployer.to_account_info(),
                ctx.accounts.owner.to_account_info(),
            ],
        )?;
    }

    let (mint_authority, _) = Pubkey::find_program_address(
        &[b"mint_signer"],
        &wormhole_anchor_sdk::token_bridge::program::ID,
    );

    ctx.accounts.tbr_config.set_inner(TbrConfigState {
        owner: ctx.accounts.owner.key(),
        pending_owner: None,
        fee_recipient,
        evm_transaction_size: 0,
        evm_transaction_gas: 0,
        mint_authority,
        sender_bump: ctx.bumps.wormhole_sender,
        redeemer_bump: ctx.bumps.wormhole_redeemer,
        bump: ctx.bumps.tbr_config,
    });

    ctx.accounts.auth_badge.set_inner(AuthBadgeState {
        address: ctx.accounts.owner.key(),
    });

    require_eq!(
        admins.len(),
        ctx.remaining_accounts.len(),
        TokenBridgeRelayerError::AdminCountMismatch
    );

    for (admin, badge_acc_info) in zip(admins, ctx.remaining_accounts) {
        let (_pubkey, bump) = Pubkey::find_program_address(
            &[AuthBadgeState::SEED_PREFIX, admin.to_bytes().as_ref()],
            ctx.program_id,
        );
        let badge_seeds = [AuthBadgeState::SEED_PREFIX, &admin.to_bytes(), &[bump]];

        // Before calling `create_account`, we need to verify that the account
        // has an empty balance, otherwise the instruction would fail:
        DrainAccount {
            system_program: ctx.accounts.system_program.to_account_info(),
            account: badge_acc_info.to_account_info(),
            recipient: ctx.accounts.deployer.to_account_info(),
        }
        .run_with_seeds(&badge_seeds)?;

        anchor_lang::system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::CreateAccount {
                    from: ctx.accounts.deployer.to_account_info(),
                    to: badge_acc_info.clone(),
                },
                &[&badge_seeds],
            ),
            Rent::get()?.minimum_balance(8 + AuthBadgeState::INIT_SPACE),
            (8 + AuthBadgeState::INIT_SPACE) as u64,
            ctx.program_id,
        )?;

        AuthBadgeState::try_serialize(
            &AuthBadgeState { address: admin },
            badge_acc_info.try_borrow_mut_data()?.deref_mut(),
        )?;
    }

    Ok(())
}
