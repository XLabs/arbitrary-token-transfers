use crate::{
    constant::{SEED_PREFIX_BRIDGED, SEED_PREFIX_TEMPORARY},
    error::{TokenBridgeRelayerError, TokenBridgeRelayerResult},
    message::RelayerMessage,
    state::{ChainConfigState, SignerSequenceState, TbrConfigState},
    utils::{calculate_total_fee, create_native_check},
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use solana_price_oracle::{
    state::{EvmPricesAccount, PriceOracleConfigAccount},
    PriceOracle,
};
use wormhole_anchor_sdk::{
    token_bridge::{self, program::TokenBridge},
    wormhole::program::Wormhole,
};

/// Transfer a native SPL token.
///
/// The other side will mint a wrapped token issued by Wormhole.
/// The other side will unbound a native ERC-20 token.
#[derive(Accounts)]
#[instruction(
    recipient_chain: u16,
    recipient_address: [u8; 32],
)]
pub struct OutboundTransfer<'info> {
    /// Payer will pay Wormhole fee to transfer tokens and create temporary
    /// token account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// This program's config.
    #[account(
        has_one = fee_recipient @ TokenBridgeRelayerError::WrongFeeRecipient,
        seeds = [TbrConfigState::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Box<Account<'info, TbrConfigState>>,

    /// The peer config. We need to verify that the transfer is sent to the
    /// canonical peer.
    #[account(
        seeds = [
            ChainConfigState::SEED_PREFIX,
            recipient_chain.to_be_bytes().as_ref(),
        ],
        bump
    )]
    pub chain_config: Box<Account<'info, ChainConfigState>>,

    /// Mint info. This is the SPL token that will be bridged over to the
    /// canonical peer. Mutable.
    ///
    /// In the case of a native transfer, it's the native mint; in the case of a
    /// wrapped transfer, it's the token wrapped by Wormhole.
    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,

    /// Payer's token account. It holds the SPL token that will be transferred.
    #[account(
        mut,
        constraint = user_token_account.mint == mint.key(),
        constraint = user_token_account.owner == payer.key(),
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    /// Program's temporary token account. This account is created before the
    /// instruction is invoked to temporarily take custody of the payer's
    /// tokens. When the tokens are finally bridged out, the token account
    /// will have zero balance and can be closed.
    #[account(
        init,
        payer = payer,
        seeds = [
            SEED_PREFIX_TEMPORARY,
            mint.key().as_ref(),
        ],
        bump,
        token::mint = mint,
        token::authority = tbr_config,
    )]
    pub temporary_account: Box<Account<'info, TokenAccount>>,

    /// Fee recipient's account. The fee will be transferred to this account.
    pub fee_recipient: UncheckedAccount<'info>,

    #[account(
        seeds = [PriceOracleConfigAccount::SEED_PREFIX],
        seeds::program = PriceOracle::id(),
        bump,
    )]
    pub oracle_config: Box<Account<'info, PriceOracleConfigAccount>>,

    #[account(
        seeds = [EvmPricesAccount::SEED_PREFIX, recipient_chain.to_be_bytes().as_ref()],
        seeds::program = PriceOracle::id(),
        bump,
    )]
    pub oracle_evm_prices: Box<Account<'info, EvmPricesAccount>>,

    /// CHECK: Token Bridge config. Read-only.
    pub token_bridge_config: UncheckedAccount<'info>,

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

    /// CHECK: Token Bridge authority signer. Read-only.
    pub token_bridge_authority_signer: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody signer. Read-only.
    ///
    /// # Exclusive
    ///
    /// Native transfer only.
    pub token_bridge_custody_signer: Option<UncheckedAccount<'info>>,

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

    /// CHECK: Wormhole bridge data. Mutable.
    #[account(mut)]
    pub wormhole_bridge: UncheckedAccount<'info>,

    /// CHECK: Token Bridge emitter.
    pub token_bridge_emitter: UncheckedAccount<'info>,

    /// CHECK: Token Bridge sequence.
    #[account(mut)]
    pub token_bridge_sequence: UncheckedAccount<'info>,

    /// CHECK: Wormhole Message. Token Bridge program writes info about the
    /// tokens transferred in this account for our program. Mutable.
    #[account(
        mut,
        seeds = [
            SEED_PREFIX_BRIDGED,
            payer.key().as_ref(),
            &payer_sequence.value.to_be_bytes()[..]
        ],
        bump,
    )]
    pub wormhole_message: AccountInfo<'info>,

    /// Used to keep track of payer's Wormhole sequence number.
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + SignerSequenceState::INIT_SPACE,
        seeds = [SignerSequenceState::SEED_PREFIX, payer.key().as_ref()],
        bump,
    )]
    payer_sequence: Account<'info, SignerSequenceState>,

    /* Programs */
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub token_bridge_program: Program<'info, TokenBridge>,
    pub wormhole_program: Program<'info, Wormhole>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn transfer_tokens(
    mut ctx: Context<OutboundTransfer>,
    recipient_chain: u16,
    transferred_amount: u64,
    unwrap_intent: bool,
    gas_dropoff_amount_mwei: u64,
    max_fee_klam: u64,
    recipient_address: [u8; 32],
) -> Result<()> {
    ctx.accounts.chain_config.transfer_allowed()?;

    // Seeds:
    let config_seed = &[
        TbrConfigState::SEED_PREFIX.as_ref(),
        &[ctx.bumps.tbr_config],
    ];

    let (transferred_amount, gas_dropoff_amount) = normalize_amounts(
        &ctx.accounts.mint,
        transferred_amount,
        gas_dropoff_amount_mwei,
    )?;

    let total_fees_klam = calculate_total_fee(
        &ctx.accounts.tbr_config,
        &ctx.accounts.chain_config,
        &ctx.accounts.oracle_evm_prices,
        &ctx.accounts.oracle_config,
        gas_dropoff_amount.into(),
    )?;
    require!(
        total_fees_klam <= max_fee_klam,
        TokenBridgeRelayerError::FeeExceedingMaximum
    );

    // Transfer the fee to the fee collector:
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.fee_recipient.to_account_info(),
            },
        ),
        total_fees_klam,
    )?;

    // Transfer the tokens to the custody account, to be transferred through the TBR:
    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.temporary_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        transferred_amount,
    )?;

    // Delegate spending to Token Bridge program's authority signer.
    anchor_spl::token::approve(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Approve {
                to: ctx.accounts.temporary_account.to_account_info(),
                delegate: ctx.accounts.token_bridge_authority_signer.to_account_info(),
                authority: ctx.accounts.tbr_config.to_account_info(),
            },
            &[config_seed],
        ),
        transferred_amount,
    )?;

    let relayer_message = RelayerMessage::new(recipient_address, gas_dropoff_amount, unwrap_intent);

    if is_native(&ctx)? {
        token_bridge_transfer_native(
            &mut ctx,
            transferred_amount,
            recipient_chain,
            &relayer_message,
        )?;
    } else {
        token_bridge_transfer_wrapped(
            &mut ctx,
            transferred_amount,
            recipient_chain,
            &relayer_message,
        )?;
    }

    // Finish instruction by closing tmp_token_account.
    anchor_spl::token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::CloseAccount {
            account: ctx.accounts.temporary_account.to_account_info(),
            destination: ctx.accounts.payer.to_account_info(),
            authority: ctx.accounts.tbr_config.to_account_info(),
        },
        &[config_seed],
    ))
}

fn normalize_amounts(
    mint: &Account<Mint>,
    transferred_amount: u64,
    gas_dropoff_amount: u64,
) -> Result<(u64, u32)> {
    // Token Bridge program truncates amounts to 8 decimals, so there will
    // be a residual amount if decimals of the SPL is >8. We need to take
    // into account how much will actually be bridged:
    let truncated_amount = token_bridge::truncate_amount(transferred_amount, mint.decimals);
    require!(
        truncated_amount > 0,
        TokenBridgeRelayerError::ZeroBridgeAmount
    );

    // Normalize the dropoff amount:
    //FIXME: it should not be the mint decimals
    let normalized_dropoff_amount =
        token_bridge::normalize_amount(gas_dropoff_amount, mint.decimals)
            .try_into()
            .map_err(|_| TokenBridgeRelayerError::Overflow)?;
    require!(
        gas_dropoff_amount == 0 || normalized_dropoff_amount > 0,
        TokenBridgeRelayerError::InvalidToNativeAmount
    );

    Ok((truncated_amount, normalized_dropoff_amount))
}

fn token_bridge_transfer_native(
    ctx: &mut Context<OutboundTransfer>,
    transferred_amount: u64,
    recipient_chain: u16,
    relayer_message: &RelayerMessage,
) -> Result<()> {
    let config_seed = &[
        TbrConfigState::SEED_PREFIX.as_ref(),
        &[ctx.bumps.tbr_config],
    ];

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

    token_bridge::transfer_native_with_payload(
        CpiContext::new_with_signer(
            ctx.accounts.token_bridge_program.to_account_info(),
            token_bridge::TransferNativeWithPayload {
                payer: ctx.accounts.payer.to_account_info(),
                config: ctx.accounts.token_bridge_config.to_account_info(),
                from: ctx.accounts.temporary_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                custody: token_bridge_custody.to_account_info(),
                authority_signer: ctx.accounts.token_bridge_authority_signer.to_account_info(),
                custody_signer: token_bridge_custody_signer.to_account_info(),
                wormhole_bridge: ctx.accounts.wormhole_bridge.to_account_info(),
                wormhole_message: ctx.accounts.wormhole_message.to_account_info(),
                wormhole_emitter: ctx.accounts.token_bridge_emitter.to_account_info(),
                wormhole_sequence: ctx.accounts.token_bridge_sequence.to_account_info(),
                wormhole_fee_collector: ctx.accounts.fee_recipient.to_account_info(),
                clock: ctx.accounts.clock.to_account_info(),
                sender: ctx.accounts.tbr_config.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
            },
            &[
                config_seed,
                &[
                    SEED_PREFIX_BRIDGED,
                    ctx.accounts.payer.key().as_ref(),
                    &ctx.accounts.payer_sequence.take_and_uptick()[..],
                    &[ctx.bumps.wormhole_message],
                ],
            ],
        ),
        0,
        transferred_amount,
        ctx.accounts.chain_config.canonical_peer,
        recipient_chain,
        relayer_message.try_to_vec()?,
        &crate::ID,
    )
}

fn token_bridge_transfer_wrapped(
    ctx: &mut Context<OutboundTransfer>,
    transferred_amount: u64,
    recipient_chain: u16,
    relayer_message: &RelayerMessage,
) -> Result<()> {
    let config_seed = &[
        TbrConfigState::SEED_PREFIX.as_ref(),
        &[ctx.bumps.tbr_config],
    ];

    let token_bridge_wrapped_meta = ctx
        .accounts
        .token_bridge_wrapped_meta
        .as_ref()
        .expect("We have checked that before");

    token_bridge::transfer_wrapped_with_payload(
        CpiContext::new_with_signer(
            ctx.accounts.token_bridge_program.to_account_info(),
            token_bridge::TransferWrappedWithPayload {
                payer: ctx.accounts.payer.to_account_info(),
                config: ctx.accounts.token_bridge_config.to_account_info(),
                from: ctx.accounts.temporary_account.to_account_info(),
                from_owner: ctx.accounts.tbr_config.to_account_info(),
                wrapped_mint: ctx.accounts.mint.to_account_info(),
                wrapped_metadata: token_bridge_wrapped_meta.to_account_info(),
                authority_signer: ctx.accounts.token_bridge_authority_signer.to_account_info(),
                wormhole_bridge: ctx.accounts.wormhole_bridge.to_account_info(),
                wormhole_message: ctx.accounts.wormhole_message.to_account_info(),
                wormhole_emitter: ctx.accounts.token_bridge_emitter.to_account_info(),
                wormhole_sequence: ctx.accounts.token_bridge_sequence.to_account_info(),
                wormhole_fee_collector: ctx.accounts.fee_recipient.to_account_info(),
                clock: ctx.accounts.clock.to_account_info(),
                sender: ctx.accounts.tbr_config.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
            },
            &[
                config_seed,
                &[
                    SEED_PREFIX_BRIDGED,
                    ctx.accounts.payer.key().as_ref(),
                    &ctx.accounts.payer_sequence.take_and_uptick()[..],
                    &[ctx.bumps.wormhole_message],
                ],
            ],
        ),
        0,
        transferred_amount,
        ctx.accounts.chain_config.canonical_peer,
        recipient_chain,
        relayer_message.try_to_vec()?,
        &crate::ID,
    )
}

fn is_native(ctx: &Context<OutboundTransfer>) -> TokenBridgeRelayerResult<bool> {
    let check_native = create_native_check(ctx.accounts.mint.mint_authority);

    match (
        &ctx.accounts.token_bridge_wrapped_meta,
        &ctx.accounts.token_bridge_custody,
        &ctx.accounts.token_bridge_custody_signer,
    ) {
        (None, Some(_), Some(_)) => check_native(true),
        (Some(_), None, None) => check_native(false),
        _ => Err(TokenBridgeRelayerError::WronglySetOptionalAccounts),
    }
    .map_err(|e| {
        msg!("Could not determine whether it is a native or wrapped transfer");
        e
    })
}
