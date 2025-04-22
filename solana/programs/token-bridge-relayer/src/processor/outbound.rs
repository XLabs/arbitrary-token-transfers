use crate::{
    constant::{SEED_PREFIX_BRIDGED, SEED_PREFIX_TEMPORARY},
    error::{TokenBridgeRelayerError, TokenBridgeRelayerResult},
    message::RelayerMessage,
    state::{ChainConfigState, SignerSequenceState, TbrConfigState},
    utils::{calculate_total_fee, normalize_token_amount, CreateAndInitTokenAccount},
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use solana_price_oracle::state::{PriceOracleConfigState, PricesState};
use wormhole_anchor_sdk::{
    token_bridge::{self, program::TokenBridge},
    wormhole::program::Wormhole,
};

/// Prepares TBRv3 user state so they can ask for transfers.
///
#[derive(Accounts)]
pub struct InitUser<'info> {
    /// Payer will pay rent of its own sequence.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Used to keep track of payer's Wormhole sequence number.
    #[account(
        init,
        payer = payer,
        space = 8 + SignerSequenceState::INIT_SPACE,
        seeds = [SignerSequenceState::SEED_PREFIX, payer.key().as_ref()],
        bump,
    )]
    payer_sequence: Account<'info, SignerSequenceState>,

    pub system_program: Program<'info, System>,
}

pub fn init_user(ctx: Context<InitUser>) -> Result<()> {
    ctx.accounts.payer_sequence.set_inner(
        SignerSequenceState { value: 0, signer: ctx.accounts.payer.key() }
    );
    Ok(())
}

/// Transfer a native SPL token.
///
/// The other side will mint a wrapped token issued by Wormhole.
/// The other side will unbound a native ERC-20 token.
#[derive(Accounts)]
pub struct OutboundTransfer<'info> {
    /// Payer will pay Wormhole fee to transfer tokens and create temporary
    /// token account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// This program's config.
    #[account(has_one = fee_recipient @ TokenBridgeRelayerError::WrongFeeRecipient)]
    pub tbr_config: Box<Account<'info, TbrConfigState>>,

    /// The peer config. We need to verify that the transfer is sent to the
    /// canonical peer.
    #[account(
        constraint = (!chain_config.paused_outbound_transfers) @ TokenBridgeRelayerError::PausedTransfers
    )]
    pub chain_config: Box<Account<'info, ChainConfigState>>,

    /// Mint info. This is the SPL token that will be bridged over to the
    /// canonical peer.
    ///
    /// In the case of a native transfer, it's the native mint; in the case of a
    /// wrapped transfer, it's the token wrapped by Wormhole.
    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,

    /// Payer's token account. It holds the SPL token that will be transferred.
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: This will be a `TokenAccount`. It is initialized with a seed provided from the client,
    /// so Anchor forces to initialize it by hand. Since it is closed in the same instruction,
    /// it causes no security problem.
    ///
    /// Program's temporary token account. This account is created before the
    /// instruction is invoked to temporarily take custody of the payer's
    /// tokens. When the tokens are finally bridged out, the token account
    /// will have zero balance and can be closed.
    #[account(mut)]
    pub temporary_account: UncheckedAccount<'info>,

    /// CHECK: Fee recipient's account. The fee will be transferred to this account.
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,

    pub oracle_config: Box<Account<'info, PriceOracleConfigState>>,

    #[account(
        constraint = oracle_prices.chain_id == chain_config.chain_id
            @ TokenBridgeRelayerError::ChainPriceMismatch,
    )]
    pub oracle_prices: Box<Account<'info, PricesState>>,

    /// CHECK: Token Bridge config. Read-only.
    pub token_bridge_config: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody. This is the Token Bridge program's token
    /// account that holds this mint's balance. This account needs to be
    /// unchecked because a token account may not have been created for this
    /// mint yet.
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

    /// CHECK: Token Bridge sequence. Mutable.
    #[account(mut)]
    pub token_bridge_sequence: UncheckedAccount<'info>,

    /// CHECK: Wormhole Message. Token Bridge program writes info about the
    /// tokens transferred in this account for our program. Mutable.
    #[account(mut)]
    pub wormhole_message: UncheckedAccount<'info>,

    /// CHECK: Wormhole sender.
    pub wormhole_sender: UncheckedAccount<'info>,

    /// CHECK: Wormhole fee collector. Mutable.
    #[account(mut)]
    pub wormhole_fee_collector: UncheckedAccount<'info>,

    /// Used to keep track of payer's Wormhole sequence number.
    #[account(
        mut,
        constraint = payer.key == &payer_sequence.signer
            @ TokenBridgeRelayerError::WrongSignerSequenceAccount
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
    temporary_account_bump: u8,
    wormhole_message_bump: u8,
    transferred_amount: u64,
    unwrap_intent: bool,
    dropoff_amount_micro: u32,
    max_fee_lamports: u64,
    recipient_address: [u8; 32],
) -> Result<()> {
    let recipient_chain = ctx.accounts.chain_config.chain_id;

    let tbr_config_seeds = &[
        TbrConfigState::SEED_PREFIX.as_ref(),
        &[ctx.accounts.tbr_config.bump],
    ];
    // Note that these seeds are entirely of our own choosing.
    // We're imitating the Wormhole emitter + sequence tuple to get per user derivations.
    let message_seeds = &[
        SEED_PREFIX_BRIDGED,
        ctx.accounts.payer.key.as_ref(),
        &ctx.accounts.payer_sequence.take_and_uptick(),
        &[wormhole_message_bump],
    ];
    let sender_seeds = &[
        token_bridge::SEED_PREFIX_SENDER.as_ref(),
        &[ctx.accounts.tbr_config.sender_bump],
    ];

    require!(
        dropoff_amount_micro <= ctx.accounts.chain_config.max_gas_dropoff_micro_token,
        TokenBridgeRelayerError::DropoffExceedingMaximum
    );

    let transferred_amount = normalize_token_amount(transferred_amount, &ctx.accounts.mint);
    let total_fees_lamports = calculate_total_fee(
        &ctx.accounts.tbr_config,
        &ctx.accounts.chain_config,
        &ctx.accounts.oracle_prices,
        &ctx.accounts.oracle_config,
        dropoff_amount_micro,
    )?;
    require!(
        total_fees_lamports <= max_fee_lamports,
        TokenBridgeRelayerError::FeeExceedingMaximum
    );

    // Initialize the temporary account:
    CreateAndInitTokenAccount {
        system_program: ctx.accounts.system_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        rent: ctx.accounts.rent.clone(),
        payer: ctx.accounts.payer.to_account_info(),
        account: ctx.accounts.temporary_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.tbr_config.to_account_info(),
    }
    .run_with_seeds(&[
        SEED_PREFIX_TEMPORARY,
        ctx.accounts.mint.to_account_info().key.as_ref(),
        &[temporary_account_bump],
    ])?;

    // Transfer the fee to the fee collector:
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.fee_recipient.to_account_info(),
            },
        ),
        total_fees_lamports,
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
            &[tbr_config_seeds],
        ),
        transferred_amount,
    )?;

    let relayer_message =
        RelayerMessage::new(recipient_address, dropoff_amount_micro, unwrap_intent);

    if is_native(&ctx)? {
        token_bridge_transfer_native(
            &mut ctx,
            transferred_amount,
            recipient_chain,
            &relayer_message,
            message_seeds,
            sender_seeds,
        )?;
    } else {
        token_bridge_transfer_wrapped(
            &mut ctx,
            transferred_amount,
            recipient_chain,
            &relayer_message,
            tbr_config_seeds,
            message_seeds,
            sender_seeds,
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
        &[tbr_config_seeds],
    ))
}

fn is_native(ctx: &Context<OutboundTransfer>) -> TokenBridgeRelayerResult<bool> {
    let check_native = ctx
        .accounts
        .tbr_config
        .create_native_check(ctx.accounts.mint.mint_authority);

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

fn token_bridge_transfer_native(
    ctx: &mut Context<OutboundTransfer>,
    transferred_amount: u64,
    recipient_chain: u16,
    relayer_message: &RelayerMessage,
    message_seeds: &[&[u8]],
    sender_seeds: &[&[u8]],
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
                wormhole_fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
                clock: ctx.accounts.clock.to_account_info(),
                sender: ctx.accounts.wormhole_sender.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
            },
            &[message_seeds, sender_seeds],
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
    tbr_config_seeds: &[&[u8]],
    message_seeds: &[&[u8]],
    sender_seeds: &[&[u8]],
) -> Result<()> {
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
                wormhole_fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
                clock: ctx.accounts.clock.to_account_info(),
                sender: ctx.accounts.wormhole_sender.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
            },
            &[tbr_config_seeds, message_seeds, sender_seeds],
        ),
        0,
        transferred_amount,
        ctx.accounts.chain_config.canonical_peer,
        recipient_chain,
        relayer_message.try_to_vec()?,
        &crate::ID,
    )
}
