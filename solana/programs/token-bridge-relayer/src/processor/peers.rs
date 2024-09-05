use crate::{
    error::TokenBridgeRelayerError,
    state::{ChainConfigAccount, PeerAccount, TbrConfigAccount},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(
    chain_id: u16,
    peer_address: [u8; 32],
)]
pub struct RegisterPeer<'info> {
    /// Owner or  of the program as set in the [`TbrConfig`] account.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Owner Config account. This program requires that the `signer` specified
    /// in the context equals an authorized pubkey specified in this account.
    #[account(
        seeds = [TbrConfigAccount::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigAccount>,

    #[account(
        init,
        payer = signer,
        space = 8 + PeerAccount::INIT_SPACE,
        seeds = [
            PeerAccount::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
            peer_address.as_ref(),
        ],
        bump
    )]
    pub peer_account: Account<'info, PeerAccount>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + ChainConfigAccount::INIT_SPACE,
        seeds = [
            ChainConfigAccount::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
        ],
        bump
    )]
    pub chain_config: Account<'info, ChainConfigAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    chain_id: u16,
    peer_address: [u8; 32],
)]
pub struct UpdateCanonical<'info> {
    /// Owner or  of the program as set in the [`TbrConfig`] account.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Owner Config account. This program requires that the `owner` specified
    /// in the context equals the `owner` pubkey specified in this account.
    #[account(
        has_one = owner @ TokenBridgeRelayerError::OwnerOnly,
        seeds = [TbrConfigAccount::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigAccount>,

    #[account(
        seeds = [
            PeerAccount::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
            peer_address.as_ref(),
        ],
        bump
    )]
    pub peer_account: Account<'info, PeerAccount>,

    #[account(
        seeds = [
            ChainConfigAccount::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
        ],
        bump
    )]
    pub chain_config: Account<'info, ChainConfigAccount>,

    pub system_program: Program<'info, System>,
}

pub fn register_peer(ctx: Context<RegisterPeer>, peer_address: [u8; 32]) -> Result<()> {
    // Verify the authority (owner or admin):
    require!(
        ctx.accounts
            .tbr_config
            .is_authorized(ctx.accounts.signer.key),
        TokenBridgeRelayerError::AuthorizedOnly
    );

    // If it is the first peer for this chain, make it canonical:
    if ctx.accounts.chain_config.is_uninitialized() {
        let canonical_peer = &mut ctx.accounts.chain_config;
        canonical_peer.canonical_peer_address = peer_address;
    }

    Ok(())
}

pub fn update_canonical(ctx: Context<UpdateCanonical>, peer_address: [u8; 32]) -> Result<()> {
    // Owner authorization verified in the context.

    // Verify it is a different peer being set as canonical:
    if ctx.accounts.chain_config.canonical_peer_address == peer_address {
        Err(TokenBridgeRelayerError::AlreadyTheCanonicalPeer)?
    }

    // Update the field:
    let canonical_peer = &mut ctx.accounts.chain_config;
    canonical_peer.canonical_peer_address = peer_address;

    Ok(())
}
