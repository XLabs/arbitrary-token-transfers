use crate::{
    constants::{SEED_PREFIX_BRIDGED, SEED_PREFIX_CUSTODY},
    error::TokenBridgeRelayerError,
    message::RelayerMessage,
    state::{
        calculate_total_fee, ChainConfigAccount, ForeignContractAccount, SignerSequenceAccount,
        TbrConfigAccount,
    },
    KiloLamports, TargetChainGas,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use solana_price_oracle::state::{EvmPricesAccount, PriceOracleConfigAccount};
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
        seeds = [TbrConfigAccount::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigAccount>,

    /// The peer config. We need to verify that the transfer is sent to the
    /// canonical peer.
    #[account(
        constraint = chain_config.canonical_peer_address == recipient_address
            @ TokenBridgeRelayerError::MustSendToCanonicalPeer,
        seeds = [
            ChainConfigAccount::SEED_PREFIX,
            recipient_chain.to_be_bytes().as_ref(),
        ],
        bump
    )]
    pub chain_config: Account<'info, ChainConfigAccount>,

    /// Foreign Contract account. Send tokens to the contract specified in this
    /// account. Funnily enough, the Token Bridge program does not have any
    /// requirements for outbound transfers for the recipient chain to be
    /// registered. This account provides extra protection against sending
    /// tokens to an unregistered Wormhole chain ID. Read-only.
    #[account(
        seeds = [
            ForeignContractAccount::SEED_PREFIX,
            &recipient_chain.to_be_bytes()
        ],
        bump,
    )]
    pub foreign_contract: Account<'info, ForeignContractAccount>,

    /// Mint info. This is the SPL token that will be bridged over to the
    /// foreign contract. Mutable.
    ///
    /// In the case of a native transfer, it's the native mint; in the case of a
    /// wrapped transfer, it's the token wrapped by Wormhole.
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// Payer's token account. It holds the SPL token that will be transferred.
    #[account(
        mut,
        constraint = user_token_account.mint == mint.key(),
        constraint = user_token_account.owner == payer.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Program's temporary token account. This account is created before the
    /// instruction is invoked to temporarily take custody of the payer's
    /// tokens. When the tokens are finally bridged out, the token account
    /// will have zero balance and can be closed.
    #[account(
        init,
        payer = payer,
        seeds = [
            SEED_PREFIX_CUSTODY,
            mint.key().as_ref(),
        ],
        bump,
        token::mint = mint,
        token::authority = tbr_config,
    )]
    pub temporary_account: Account<'info, TokenAccount>,

    /// Fee recipient's account. The fee will be transferred to this account.
    pub fee_recipient: UncheckedAccount<'info>,

    #[account(
        seeds = [PriceOracleConfigAccount::SEED_PREFIX],
        seeds::program = tbr_config.quoter_program_address,
        bump,
    )]
    pub oracle_config: Account<'info, PriceOracleConfigAccount>,

    #[account(
        seeds = [EvmPricesAccount::SEED_PREFIX, recipient_chain.to_be_bytes().as_ref()],
        seeds::program = tbr_config.quoter_program_address,
        bump,
    )]
    pub oracle_evm_prices: Account<'info, EvmPricesAccount>,

    /// CHECK: Token Bridge config. Read-only.
    pub token_bridge_config: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody. This is the Token Bridge program's token
    /// account that holds this mint's balance. This account needs to be
    /// unchecked because a token account may not have been created for this
    /// mint yet. Mutable.
    ///
    /// This account is only used in case of a native transfer.
    #[account(mut)]
    pub token_bridge_custody: Option<UncheckedAccount<'info>>,

    /// CHECK: Token Bridge authority signer. Read-only.
    pub token_bridge_authority_signer: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody signer. Read-only.
    ///
    /// This account is only used in case of a native transfer.
    pub token_bridge_custody_signer: Option<UncheckedAccount<'info>>,

    /// CHECK: Token Bridge program's wrapped metadata, which stores info
    /// about the token from its native chain:
    ///   * Wormhole Chain ID
    ///   * Token's native contract address
    ///   * Token's native decimals
    ///
    /// Use this account only in a case of wrapped transfer. It will not be
    /// used for a native transfer.
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
        space = 8 + SignerSequenceAccount::INIT_SPACE,
        seeds = [SignerSequenceAccount::SEED_PREFIX, payer.key().as_ref()],
        bump,
    )]
    payer_sequence: Account<'info, SignerSequenceAccount>,

    /* Programs */
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub token_bridge_program: Program<'info, TokenBridge>,
    pub wormhole_program: Program<'info, Wormhole>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

fn transfer_tokens(
    mut ctx: Context<OutboundTransfer>,
    native: bool,
    recipient_chain: u16,
    transferred_amount: u64,
    gas_dropoff_amount: TargetChainGas,
    max_fee_sol: KiloLamports,
    recipient_address: [u8; 32],
) -> Result<()> {
    check_prices_are_set(&ctx.accounts.oracle_config, &ctx.accounts.oracle_evm_prices)?;

    // Seeds:
    let config_seed = &[
        TbrConfigAccount::SEED_PREFIX.as_ref(),
        &[ctx.bumps.tbr_config],
    ];

    let (transferred_amount, gas_dropoff_amount) =
        normalize_amounts(&ctx.accounts.mint, transferred_amount, gas_dropoff_amount)?;

    let total_fees_sol = calculate_total_fee(
        &ctx.accounts.tbr_config,
        &ctx.accounts.oracle_evm_prices,
        &ctx.accounts.oracle_config,
        recipient_chain,
        gas_dropoff_amount,
    );
    require!(
        total_fees_sol <= max_fee_sol,
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
        total_fees_sol,
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

    let relayer_message = RelayerMessage::new(recipient_address, gas_dropoff_amount);

    if native {
        token_bridge_transfer_native(
            &mut ctx,
            transferred_amount,
            recipient_chain,
            relayer_message,
        )?;
    } else {
        token_bridge_transfer_wrapped(
            &mut ctx,
            transferred_amount,
            recipient_chain,
            relayer_message,
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

pub fn transfer_native_tokens(
    ctx: Context<OutboundTransfer>,
    recipient_chain: u16,
    transferred_amount: u64,
    gas_dropoff_amount: TargetChainGas,
    max_fee_sol: KiloLamports,
    recipient_address: [u8; 32],
) -> Result<()> {
    transfer_tokens(
        ctx,
        true,
        recipient_chain,
        transferred_amount,
        gas_dropoff_amount,
        max_fee_sol,
        recipient_address,
    )
}

pub fn transfer_wrapped_tokens(
    ctx: Context<OutboundTransfer>,
    recipient_chain: u16,
    transferred_amount: u64,
    gas_dropoff_amount: TargetChainGas,
    max_fee_sol: KiloLamports,
    recipient_address: [u8; 32],
) -> Result<()> {
    transfer_tokens(
        ctx,
        false,
        recipient_chain,
        transferred_amount,
        gas_dropoff_amount,
        max_fee_sol,
        recipient_address,
    )
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
    relayer_message: RelayerMessage,
) -> Result<()> {
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
        ctx.accounts.foreign_contract.address,
        recipient_chain,
        relayer_message.try_to_vec()?,
        &crate::ID,
    )
}

fn token_bridge_transfer_wrapped(
    ctx: &mut Context<OutboundTransfer>,
    transferred_amount: u64,
    recipient_chain: u16,
    relayer_message: RelayerMessage,
) -> Result<()> {
    let config_seed = &[
        TbrConfigAccount::SEED_PREFIX.as_ref(),
        &[ctx.bumps.tbr_config],
    ];

    let token_bridge_wrapped_meta = ctx
        .accounts
        .token_bridge_wrapped_meta
        .as_ref()
        .ok_or(TokenBridgeRelayerError::MissingWrappedMeta)?;

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
        ctx.accounts.foreign_contract.address,
        recipient_chain,
        relayer_message.try_to_vec()?,
        &crate::ID,
    )
}

/// This is a basic security against a wrong manip, to be sure that the prices
/// have been set correctly.
fn check_prices_are_set(
    oracle_config: &PriceOracleConfigAccount,
    evm_prices: &EvmPricesAccount,
) -> Result<()> {
    require_neq!(
        oracle_config.sol_price,
        0,
        TokenBridgeRelayerError::SolPriceNotSet
    );
    require_neq!(
        evm_prices.gas_price,
        0,
        TokenBridgeRelayerError::EvmChainPriceNotSet
    );
    require_neq!(
        evm_prices.gas_token_price,
        0,
        TokenBridgeRelayerError::EvmChainPriceNotSet
    );

    Ok(())
}