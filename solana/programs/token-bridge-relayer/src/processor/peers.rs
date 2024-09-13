use crate::{
    error::TokenBridgeRelayerError,
    state::{ChainConfigState, PeerState, TbrConfigState},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(
    chain_id: u16,
    peer_address: [u8; 32],
)]
pub struct RegisterPeer<'info> {
    /// Owner or admin of the program as set in the [`TbrConfig`] account.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Owner Config account. This program requires that the `signer` specified
    /// in the context equals an authorized pubkey specified in this account.
    #[account(
        seeds = [TbrConfigState::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        init,
        payer = signer,
        space = 8 + PeerState::INIT_SPACE,
        seeds = [
            PeerState::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
            peer_address.as_ref(),
        ],
        bump
    )]
    pub peer: Account<'info, PeerState>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + ChainConfigState::INIT_SPACE,
        seeds = [
            ChainConfigState::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
        ],
        bump
    )]
    pub chain_config: Account<'info, ChainConfigState>,

    pub system_program: Program<'info, System>,
}

pub fn register_peer(ctx: Context<RegisterPeer>, peer_address: [u8; 32]) -> Result<()> {
    require!(
        ctx.accounts
            .tbr_config
            .is_owner_or_admin(ctx.accounts.signer.key),
        TokenBridgeRelayerError::OwnerOrAdminOnly
    );

    // If it is the first peer for this chain, make it canonical:
    if ctx.accounts.chain_config.is_uninitialized() {
        let canonical_peer = &mut ctx.accounts.chain_config;
        canonical_peer.canonical_peer = peer_address;
        canonical_peer.paused_outbound_transfers = true;
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(
    chain_id: u16,
    peer_address: [u8; 32],
)]
pub struct UpdateCanonicalPeer<'info> {
    /// Owner of the program as set in the [`TbrConfig`] account.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Owner Config account. This program requires that the `owner` specified
    /// in the context equals the `owner` pubkey specified in this account.
    #[account(
        has_one = owner @ TokenBridgeRelayerError::OwnerOnly,
        seeds = [TbrConfigState::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        seeds = [
            PeerState::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
            peer_address.as_ref(),
        ],
        bump
    )]
    pub peer: Account<'info, PeerState>,

    #[account(
        mut,
        seeds = [
            ChainConfigState::SEED_PREFIX,
            chain_id.to_be_bytes().as_ref(),
        ],
        bump
    )]
    pub chain_config: Account<'info, ChainConfigState>,

    pub system_program: Program<'info, System>,
}

pub fn update_canonical_peer(
    ctx: Context<UpdateCanonicalPeer>,
    peer_address: [u8; 32],
) -> Result<()> {
    // Owner authorization verified in the context.

    // Verify it is a different peer being set as canonical:
    if ctx.accounts.chain_config.canonical_peer == peer_address {
        Err(TokenBridgeRelayerError::AlreadyTheCanonicalPeer)?
    }

    // Update the field:
    let chain_config = &mut ctx.accounts.chain_config;
    chain_config.canonical_peer = peer_address;

    Ok(())
}
