use crate::{
    constant::SEED_PREFIX_TEMPORARY,
    error::{TokenBridgeRelayerError, TokenBridgeRelayerResult},
    message::{PostedRelayerMessage, RelayerMessage},
    state::{PeerState, TbrConfigState},
    utils::create_native_check,
};
use anchor_lang::{prelude::*, system_program};
use anchor_spl::token::{spl_token::native_mint, Mint, Token, TokenAccount};
use wormhole_anchor_sdk::{
    token_bridge::{self, program::TokenBridge},
    wormhole::{self, program::Wormhole},
};

#[derive(Accounts)]
#[instruction(vaa_hash: [u8; 32])]
pub struct CompleteTransfer<'info> {
    /// Payer will pay for completing the Wormhole transfer tokens and create temporary
    /// token account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// This program's config.
    #[account(
        seeds = [TbrConfigState::SEED_PREFIX],
        bump = tbr_config.bump
    )]
    pub tbr_config: Box<Account<'info, TbrConfigState>>,

    /// Mint info. This is the SPL token that will be bridged over to the
    /// foreign contract. Mutable.
    ///
    /// In the case of a native transfer, it's the mint for the token wrapped by Wormhole;
    /// in the case of a wrapped transfer, it's the native SPL token mint.
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// Recipient associated token account. The recipient authority check
    /// is necessary to ensure that the recipient is the intended recipient
    /// of the bridged tokens. Mutable.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = recipient
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: recipient may differ from payer if a relayer paid for this
    /// transaction. This instruction verifies that the recipient key
    /// passed in this context matches the intended recipient in the vaa.
    #[account(mut)]
    pub recipient: AccountInfo<'info>,

    /// Verified Wormhole message account. The Wormhole program verified
    /// signatures and posted the account data here. Read-only.
    #[account(
        seeds = [
            wormhole::SEED_PREFIX_POSTED_VAA,
            &vaa_hash
        ],
        seeds::program = wormhole_program.key(),
        bump,
        constraint = vaa.data().to() == crate::ID @ TokenBridgeRelayerError::InvalidTransferToAddress,
        constraint = vaa.data().to_chain() == wormhole::CHAIN_ID_SOLANA @ TokenBridgeRelayerError::InvalidTransferToChain,
    )]
    pub vaa: Account<'info, PostedRelayerMessage>,

    /// Program's temporary token account. This account is created before the
    /// instruction is invoked to temporarily take custody of the payer's
    /// tokens. When the tokens are finally bridged in, the tokens will be
    /// transferred to the destination token accounts. This account will have
    /// zero balance and can be closed.
    #[account(
        init,
        payer = payer,
        seeds = [
            SEED_PREFIX_TEMPORARY,
            mint.key().as_ref(),
        ],
        bump,
        token::mint = mint,
        token::authority = tbr_config
    )]
    pub temporary_account: Account<'info, TokenAccount>,

    pub peer: Account<'info, PeerState>,

    /// CHECK: Token Bridge config. Read-only.
    pub token_bridge_config: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = token_bridge_claim.data_is_empty() @ TokenBridgeRelayerError::AlreadyRedeemed
    )]
    /// CHECK: Token Bridge claim account. It stores a boolean, whose value
    /// is true if the bridged assets have been claimed. If the transfer has
    /// not been redeemed, this account will not exist yet.
    ///
    /// NOTE: The Token Bridge program's claim account is only initialized when
    /// a transfer is redeemed (and the boolean value `true` is written as
    /// its data).
    ///
    /// The Token Bridge program will automatically fail if this transfer
    /// is redeemed again. But we choose to short-circuit the failure as the
    /// first evaluation of this instruction.
    pub token_bridge_claim: AccountInfo<'info>,

    /// CHECK: Token Bridge foreign endpoint. This account should really be one
    /// endpoint per chain, but the PDA allows for multiple endpoints for each
    /// chain! We store the proper endpoint for the emitter chain.
    pub token_bridge_foreign_endpoint: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody. This is the Token Bridge program's token
    /// account that holds this mint's balance. This account needs to be
    /// unchecked because a token account may not have been created for this
    /// mint yet. Mutable.
    ///
    /// # Exclusive
    ///
    /// Native transfer only.
    #[account(mut)]
    pub token_bridge_custody: Option<UncheckedAccount<'info>>,

    /// CHECK: Token Bridge custody signer. Read-only.
    ///
    /// # Exclusive
    ///
    /// Native transfer only.
    pub token_bridge_custody_signer: Option<UncheckedAccount<'info>>,

    /// CHECK: Token Bridge custody signer. Read-only.
    ///
    /// # Exclusive
    ///
    /// Wrapped transfer only.
    pub token_bridge_mint_authority: Option<UncheckedAccount<'info>>,

    /// CHECK: Token Bridge program's wrapped metadata, which stores info
    /// about the token from its native chain:
    ///   * Wormhole Chain ID
    ///   * Token's native contract address
    ///   * Token's native decimals
    ///
    /// # Exclusive
    ///
    /// Wrapped transfer only.
    pub token_bridge_wrapped_meta: Option<UncheckedAccount<'info>>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_REDEEMER],
        bump = tbr_config.redeemer_bump
    )]
    pub wormhole_redeemer: UncheckedAccount<'info>,

    /* Programs */
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub wormhole_program: Program<'info, Wormhole>,
    pub token_bridge_program: Program<'info, TokenBridge>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn complete_transfer(ctx: Context<CompleteTransfer>) -> Result<()> {
    let RelayerMessage::V0 {
        recipient,
        gas_dropoff_amount,
        unwrap_intent,
    } = *ctx.accounts.vaa.message().data();

    let tbr_config_seeds = &[
        TbrConfigState::SEED_PREFIX.as_ref(),
        &[ctx.accounts.tbr_config.bump],
    ];
    let redeemer_seeds = &[
        token_bridge::SEED_PREFIX_REDEEMER.as_ref(),
        &[ctx.accounts.tbr_config.redeemer_bump],
    ];

    // The intended recipient must agree with the recipient account:
    require!(
        ctx.accounts.recipient.key() == Pubkey::from(recipient),
        TokenBridgeRelayerError::InvalidRecipient
    );

    ctx.accounts.peer.check_origin(&ctx.accounts.vaa)?;

    // The tokens are transferred into the temporary_account:
    if is_native(&ctx)? {
        token_bridge_complete_native(&ctx, redeemer_seeds)?;
    } else {
        token_bridge_complete_wrapped(&ctx, redeemer_seeds)?;
    }

    redeem_gas(&ctx, gas_dropoff_amount)?;
    redeem_token(&ctx, unwrap_intent, tbr_config_seeds)?;

    Ok(())
}

fn is_native(ctx: &Context<CompleteTransfer>) -> TokenBridgeRelayerResult<bool> {
    let check_native = create_native_check(ctx.accounts.mint.mint_authority);

    match (
        &ctx.accounts.token_bridge_mint_authority,
        &ctx.accounts.token_bridge_wrapped_meta,
        &ctx.accounts.token_bridge_custody,
        &ctx.accounts.token_bridge_custody_signer,
    ) {
        (None, None, Some(_), Some(_)) => check_native(true),
        (Some(_), Some(_), None, None) => check_native(false),
        _ => Err(TokenBridgeRelayerError::WronglySetOptionalAccounts),
    }
    .map_err(|e| {
        msg!("Could not determine whether it is a native or wrapped transfer");
        e
    })
}

fn token_bridge_complete_native(
    ctx: &Context<CompleteTransfer>,
    redeemer_seeds: &[&[u8]],
) -> Result<()> {
    let token_bridge_custody = ctx
        .accounts
        .token_bridge_custody
        .as_ref()
        .expect("We have checked that before");
    let token_bridge_custody_signer = ctx
        .accounts
        .token_bridge_custody_signer
        .as_ref()
        .expect("We have checked that before");

    token_bridge::complete_transfer_native_with_payload(CpiContext::new_with_signer(
        ctx.accounts.token_bridge_program.to_account_info(),
        token_bridge::CompleteTransferNativeWithPayload {
            payer: ctx.accounts.payer.to_account_info(),
            config: ctx.accounts.token_bridge_config.to_account_info(),
            vaa: ctx.accounts.vaa.to_account_info(),
            claim: ctx.accounts.token_bridge_claim.to_account_info(),
            foreign_endpoint: ctx.accounts.token_bridge_foreign_endpoint.to_account_info(),
            to: ctx.accounts.temporary_account.to_account_info(),
            redeemer: ctx.accounts.wormhole_redeemer.to_account_info(),
            custody: token_bridge_custody.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            custody_signer: token_bridge_custody_signer.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
        },
        &[redeemer_seeds],
    ))
}

fn token_bridge_complete_wrapped(
    ctx: &Context<CompleteTransfer>,
    redeemer_seeds: &[&[u8]],
) -> Result<()> {
    let token_bridge_wrapped_meta = ctx
        .accounts
        .token_bridge_wrapped_meta
        .as_ref()
        .expect("We have checked that before");
    let token_bridge_mint_authority = ctx
        .accounts
        .token_bridge_mint_authority
        .as_ref()
        .expect("We have checked that before");

    // Redeem the token transfer to the recipient token account.
    token_bridge::complete_transfer_wrapped_with_payload(CpiContext::new_with_signer(
        ctx.accounts.token_bridge_program.to_account_info(),
        token_bridge::CompleteTransferWrappedWithPayload {
            payer: ctx.accounts.payer.to_account_info(),
            config: ctx.accounts.token_bridge_config.to_account_info(),
            vaa: ctx.accounts.vaa.to_account_info(),
            claim: ctx.accounts.token_bridge_claim.to_account_info(),
            foreign_endpoint: ctx.accounts.token_bridge_foreign_endpoint.to_account_info(),
            to: ctx.accounts.temporary_account.to_account_info(),
            redeemer: ctx.accounts.wormhole_redeemer.to_account_info(),
            wrapped_mint: ctx.accounts.mint.to_account_info(),
            wrapped_metadata: token_bridge_wrapped_meta.to_account_info(),
            mint_authority: token_bridge_mint_authority.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
        },
        &[redeemer_seeds],
    ))
}

/// If the transfer includes a gas dropoff, the gas will be transferred to the recipient.
fn redeem_gas(ctx: &Context<CompleteTransfer>, gas_dropoff_amount: u32) -> Result<()> {
    // Denormalize the gas_dropoff_amount.
    // Since it is transferred as Klamports, we need to convert it to lamports:
    let gas_dropoff_amount = u64::from(gas_dropoff_amount) * 1_000;

    // Transfer lamports from the payer to the recipient if any and if they're different accounts:
    if gas_dropoff_amount > 0 && ctx.accounts.payer.key != ctx.accounts.recipient.key {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                },
            ),
            gas_dropoff_amount,
        )?;
    }

    Ok(())
}

fn redeem_token(
    ctx: &Context<CompleteTransfer>,
    unwrap_intent: bool,
    tbr_config_seeds: &[&[u8]],
) -> Result<()> {
    let unwrap_spl_sol_as_sol = unwrap_intent && ctx.accounts.mint.key() == native_mint::ID;
    let token_amount = ctx.accounts.temporary_account.amount;

    if unwrap_spl_sol_as_sol {
        // The SPL SOLs are transferred to the payer as gas:
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: ctx.accounts.temporary_account.to_account_info(),
                destination: ctx.accounts.payer.to_account_info(),
                authority: ctx.accounts.tbr_config.to_account_info(),
            },
            &[tbr_config_seeds],
        ))?;

        // If the payer is not the recipient, the tokens must be transferred to the recipient:
        if ctx.accounts.payer.key() != ctx.accounts.recipient.key() {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.payer.to_account_info(),
                        to: ctx.accounts.recipient.to_account_info(),
                    },
                ),
                token_amount,
            )?;
        }
    } else {
        // Transfer the SPL tokens from temporary_account to recipent_token_account
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.temporary_account.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.tbr_config.to_account_info(),
                },
                &[tbr_config_seeds],
            ),
            token_amount,
        )?;

        // Now that the tokens have been transferred, we can close the account
        // and let the payer collect the rent.
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: ctx.accounts.temporary_account.to_account_info(),
                destination: ctx.accounts.payer.to_account_info(),
                authority: ctx.accounts.tbr_config.to_account_info(),
            },
            &[tbr_config_seeds],
        ))?;
    }

    Ok(())
}
