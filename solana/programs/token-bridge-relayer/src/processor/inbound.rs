use crate::{
    constants::SEED_PREFIX_CUSTODY, error::TokenBridgeRelayerError, message::RelayerMessage,
    state::TbrConfigAccount,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use wormhole_anchor_sdk::{
    token_bridge::{self, program::TokenBridge},
    wormhole::{self, program::Wormhole},
};

type PostedRelayerMessage = token_bridge::PostedTransferWith<RelayerMessage>;

/// Complete a native token transfer. That means we will issue a wrapped token
/// from this side.
#[derive(Accounts)]
#[instruction(vaa_hash: [u8; 32])]
pub struct CompleteTransfer<'info> {
    /// Payer will pay for completing the Wormhole transfer tokens and create temporary
    /// token account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// This program's config.
    #[account(
        seeds = [TbrConfigAccount::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigAccount>,

    /// Mint info. This is the SPL token that will be bridged over to the
    /// foreign contract. Mutable.
    ///
    /// In the case of a native transfer, it's the mint for the token wrapped by Wormhole;
    /// in the case of a wrapped transfer, it's the native SPL token mint.
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// Paye
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
        constraint = vaa.data().token_chain() == wormhole::CHAIN_ID_SOLANA @ TokenBridgeRelayerError::InvalidTransferTokenChain
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
            SEED_PREFIX_CUSTODY,
            mint.key().as_ref(),
        ],
        bump,
        token::mint = mint,
        token::authority = tbr_config
    )]
    pub temporary_account: Account<'info, TokenAccount>,

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
    /// Only used in wrapped transfers.
    #[account(mut)]
    pub token_bridge_custody: Option<UncheckedAccount<'info>>,

    /// CHECK: Token Bridge custody signer. Read-only.
    ///
    /// Only used in wrapped transfers.
    pub token_bridge_custody_signer: Option<UncheckedAccount<'info>>,

    /// CHECK: Token Bridge custody signer. Read-only.
    ///
    /// Only used in wrapped transfers.
    pub token_bridge_mint_authority: Option<UncheckedAccount<'info>>,

    /// CHECK: Token Bridge program's wrapped metadata, which stores info
    /// about the token from its native chain:
    ///   * Wormhole Chain ID
    ///   * Token's native contract address
    ///   * Token's native decimals
    ///
    /// Only used in wrapped transfers.
    pub token_bridge_wrapped_meta: Option<UncheckedAccount<'info>>,

    /* Programs */
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub wormhole_program: Program<'info, Wormhole>,
    pub token_bridge_program: Program<'info, TokenBridge>,
    pub rent: Sysvar<'info, Rent>,
}

fn complete_transfer(ctx: Context<CompleteTransfer>, native: bool) -> Result<()> {
    // The intended recipient must agree with the recipient account.
    let RelayerMessage::V0 {
        gas_dropoff_amount,
        recipient,
    } = *ctx.accounts.vaa.message().data();
    require!(
        ctx.accounts.recipient.key() == Pubkey::from(recipient),
        TokenBridgeRelayerError::InvalidRecipient
    );

    if native {
        token_bridge_complete_native(&ctx)?;
    } else {
        token_bridge_complete_wrapped(&ctx)?;
    }

    // Redeem the gas dropoff:

    // Denormalize the gas_dropoff_amount:
    let gas_dropoff_amount =
        token_bridge::denormalize_amount(u64::from(gas_dropoff_amount), ctx.accounts.mint.decimals);

    // Transfer lamports from the payer to the recipient if the
    // gas_dropoff_amount is nonzero:
    if gas_dropoff_amount > 0 {
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

pub fn complete_native_transfer(ctx: Context<CompleteTransfer>) -> Result<()> {
    complete_transfer(ctx, true)
}

pub fn complete_wrapped_transfer(ctx: Context<CompleteTransfer>) -> Result<()> {
    complete_transfer(ctx, false)
}

fn token_bridge_complete_native(ctx: &Context<CompleteTransfer>) -> Result<()> {
    let config_seed = &[
        TbrConfigAccount::SEED_PREFIX.as_ref(),
        &[ctx.bumps.tbr_config],
    ];

    let token_bridge_custody = ctx
        .accounts
        .token_bridge_custody
        .as_ref()
        .ok_or(TokenBridgeRelayerError::MissingCustody)?;
    let token_bridge_custody_signer = ctx
        .accounts
        .token_bridge_custody_signer
        .as_ref()
        .ok_or(TokenBridgeRelayerError::MissingCustody)?;

    token_bridge::complete_transfer_native_with_payload(CpiContext::new_with_signer(
        ctx.accounts.token_bridge_program.to_account_info(),
        token_bridge::CompleteTransferNativeWithPayload {
            payer: ctx.accounts.payer.to_account_info(),
            config: ctx.accounts.token_bridge_config.to_account_info(),
            vaa: ctx.accounts.vaa.to_account_info(),
            claim: ctx.accounts.token_bridge_claim.to_account_info(),
            foreign_endpoint: ctx.accounts.token_bridge_foreign_endpoint.to_account_info(),
            to: ctx.accounts.temporary_account.to_account_info(),
            redeemer: ctx.accounts.tbr_config.to_account_info(),
            custody: token_bridge_custody.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            custody_signer: token_bridge_custody_signer.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
        },
        &[config_seed],
    ))
}

fn token_bridge_complete_wrapped(ctx: &Context<CompleteTransfer>) -> Result<()> {
    let config_seed = &[
        TbrConfigAccount::SEED_PREFIX.as_ref(),
        &[ctx.bumps.tbr_config],
    ];

    let token_bridge_wrapped_meta = ctx
        .accounts
        .token_bridge_wrapped_meta
        .as_ref()
        .ok_or(TokenBridgeRelayerError::MissingWrappedMeta)?;
    let token_bridge_mint_authority = ctx
        .accounts
        .token_bridge_mint_authority
        .as_ref()
        .ok_or(TokenBridgeRelayerError::MissingMintAuthority)?;

    // Redeem the token transfer to the recipient token account.
    token_bridge::complete_transfer_wrapped_with_payload(CpiContext::new_with_signer(
        ctx.accounts.token_bridge_program.to_account_info(),
        token_bridge::CompleteTransferWrappedWithPayload {
            payer: ctx.accounts.payer.to_account_info(),
            config: ctx.accounts.token_bridge_config.to_account_info(),
            vaa: ctx.accounts.vaa.to_account_info(),
            claim: ctx.accounts.token_bridge_claim.to_account_info(),
            foreign_endpoint: ctx.accounts.token_bridge_foreign_endpoint.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            redeemer: ctx.accounts.tbr_config.to_account_info(),
            wrapped_mint: ctx.accounts.mint.to_account_info(),
            wrapped_metadata: token_bridge_wrapped_meta.to_account_info(),
            mint_authority: token_bridge_mint_authority.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
        },
        &[config_seed],
    ))
}
