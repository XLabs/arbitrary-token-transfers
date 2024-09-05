mod config;
pub use config::*;

mod inbound;
pub use inbound::*;

mod initialize;
pub use initialize::*;

mod outbound;
pub use outbound::*;

mod peers;
pub use peers::*;

mod roles;
pub use roles::*;

use crate::state::TbrConfigAccount;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ConfigUpdate<'info> {
    /// The signer may be the owner, pending owner or admin, depending on the operation.
    pub signer: Signer<'info>,

    /// Program Config account. This program requires that the [`signer`] specified
    /// in the context equals a pubkey specified in this account. Mutable,
    /// because we will update roles depending on the operation.
    #[account(
        mut,
        seeds = [TbrConfigAccount::SEED_PREFIX],
        bump
    )]
    pub tbr_config: Account<'info, TbrConfigAccount>,
}
