use anchor_lang::prelude::error_code;

pub type TokenBridgeRelayerResult<T> = std::result::Result<T, TokenBridgeRelayerError>;

#[error_code]
pub(crate) enum TokenBridgeRelayerError {
    /// The number of admin accounts passed as arguments in `initialize` must match
    /// the number of badges in `remaining_accounts`.
    #[msg("AdminCountMismatch")]
    AdminCountMismatch,

    /// Only the program's owner is permitted.
    #[msg("OwnerOnly")]
    OwnerOnly,

    /// Only the program's pending owner is permitted.
    #[msg("PendingOwnerOnly")]
    PendingOwnerOnly,

    /// Only the program's owner or admin are permitted.
    #[msg("OwnerOrAdminOnly")]
    OwnerOrAdminOnly,

    /// Specified key is already the program's owner.
    #[msg("AlreadyTheOwner")]
    AlreadyTheOwner,

    /// All chain IDs must be the same.
    #[msg("ChainIdMismatch")]
    ChainIdMismatch,

    /// Specified peer is already canonical.
    #[msg("AlreadyTheCanonicalPeer")]
    AlreadyTheCanonicalPeer,

    /// The dropoff amount it higher than the one authorized for the target chain.
    #[msg("DropoffExceedingMaximum")]
    DropoffExceedingMaximum,

    /// Fee exceed what the user has set as a maximum.
    #[msg("FeeExceedingMaximum")]
    FeeExceedingMaximum,

    /// The fee recipient account is not the one that was configured.
    #[msg("WrongFeeRecipient")]
    WrongFeeRecipient,

    /// The optional accounts are wrongly set. Accounts used only in native
    /// transfers cannot be mixed with accounts used only in wrapped transfers.
    #[msg("WronglySetOptionalAccounts")]
    WronglySetOptionalAccounts,

    /// The mint authority does not correspond to the detected type of transfer
    /// native/wrapped.
    ///
    /// For a wrapped transfer, the mint authority is the one defined in the
    /// root module.
    #[msg("WrongMintAuthority")]
    WrongMintAuthority,

    /// Specified recipient has a bad chain ID or zero address.
    #[msg("InvalidRecipient")]
    InvalidRecipient,

    /// The EVM token price is zero.
    #[msg("EvmChainPriceNotSet")]
    EvmChainPriceNotSet,

    /// The prices account chain must match the chain config.
    #[msg("ChainPriceMismatch")]
    ChainPriceMismatch,

    /// Transfers are paused for this chain.
    #[msg("PausedTransfers")]
    PausedTransfers,

    /// The peer sending the transfer is not the right one.
    #[msg("InvalidSendingPeer")]
    InvalidSendingPeer,

    /// Solana cannot be registered as a chain in Solana.
    #[msg("CannotRegisterSolana")]
    CannotRegisterSolana,

    /// The peer address is empty, please set a peer address.
    #[msg("InvalidPeerAddress")]
    InvalidPeerAddress,

    /// The associated token account can be skipped only when we get native tokens _and_ the
    /// unwrap intent is set to `true`.
    #[msg("MissingAssociatedTokenAccount")]
    MissingAssociatedTokenAccount,

    /// Numerical overflow.
    #[msg("Overflow")]
    Overflow,
}
