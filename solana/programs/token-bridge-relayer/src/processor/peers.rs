use crate::{
    error::TokenBridgeRelayerError,
    state::{AuthBadgeState, ChainConfigState, PeerState, TbrConfigState},
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

    /// Proof that the signer is authorized.
    #[account(constraint = &auth_badge.address == signer.key @ TokenBridgeRelayerError::RequiresAuthBadge)]
    pub auth_badge: Account<'info, AuthBadgeState>,

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

pub fn register_peer(
    ctx: Context<RegisterPeer>,
    chain_id: u16,
    peer_address: [u8; 32],
) -> Result<()> {
    require_neq!(chain_id, 0, TokenBridgeRelayerError::CannotRegisterSolana);
    if peer_address == [0; 32] {
        Err(TokenBridgeRelayerError::InvalidPeerAddress)?;
    }

    // If it is the first peer for this chain, make it canonical:
    if ctx.accounts.chain_config.is_uninitialized() {
        ctx.accounts.chain_config.set_inner(ChainConfigState {
            chain_id,
            canonical_peer: peer_address,
            paused_outbound_transfers: true,
            max_gas_dropoff_micro_token: 0,
            relayer_fee_micro_usd: 0,
        });
    }

    ctx.accounts.peer.set_inner(PeerState {
        chain_id,
        address: peer_address,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateCanonicalPeer<'info> {
    /// Owner of the program as set in the [`TbrConfig`] account.
    pub owner: Signer<'info>,

    /// Owner Config account. This program requires that the `owner` specified
    /// in the context equals the `owner` pubkey specified in this account.
    #[account(has_one = owner @ TokenBridgeRelayerError::OwnerOnly)]
    pub tbr_config: Account<'info, TbrConfigState>,

    #[account(
        constraint = {
            peer.chain_id == chain_config.chain_id
        } @ TokenBridgeRelayerError::ChainIdMismatch
    )]
    pub peer: Account<'info, PeerState>,

    #[account(
        mut,
        constraint = {
            chain_config.canonical_peer != peer.address
        } @ TokenBridgeRelayerError::AlreadyTheCanonicalPeer
    )]
    pub chain_config: Account<'info, ChainConfigState>,
}

pub fn update_canonical_peer(ctx: Context<UpdateCanonicalPeer>) -> Result<()> {
    ctx.accounts.chain_config.canonical_peer = ctx.accounts.peer.address;

    Ok(())
}
