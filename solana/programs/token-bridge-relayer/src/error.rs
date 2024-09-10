use anchor_lang::prelude::error_code;

#[error_code]
pub(crate) enum TokenBridgeRelayerError {
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

    /// Specified key is already the program's admin.
    #[msg("AlreadyTheAdmin")]
    AlreadyTheAdmin,

    /// Specified peer is already canonical.
    #[msg("AlreadyTheCanonicalPeer")]
    AlreadyTheCanonicalPeer,

    /// Nothing to transfer if amount is zero.
    #[msg("ZeroBridgeAmount")]
    ZeroBridgeAmount,

    /// Fee exceed what the user has set as a maximum.
    #[msg("FeeExceedingMaximum")]
    FeeExceedingMaximum,

    /// Must be strictly zero or nonzero when normalized.
    #[msg("InvalidToNativeAmount")]
    InvalidToNativeAmount,

    /// Deserialized recipient must be this program or the redeemer PDA.
    #[msg("InvalidTransferToAddress")]
    InvalidTransferToAddress,

    /// Deserialized token chain is invalid.
    #[msg("InvalidTransferToChain")]
    InvalidTransferToChain,

    /// Deserialized recipient chain is invalid.
    #[msg("InvalidTransferTokenChain")]
    InvalidTransferTokenChain,

    /// The fee recipient account is not the one that was configured.
    #[msg("WrongFeeRecipient")]
    WrongFeeRecipient,

    /// A number cannot fit in the bytes it should fit in.
    #[msg("Overflow")]
    Overflow,

    /// The wrapped meta account must be provided.
    #[msg("MissingWrappedMeta")]
    MissingWrappedMeta,

    /// The mint authority account must be provided.
    #[msg("MissingMintAuthority")]
    MissingMintAuthority,

    /// The custody info must be provided for a native transfer.
    #[msg("MissingCustody")]
    MissingCustody,

    /// Specified recipient has a bad chain ID or zero address.
    #[msg("InvalidRecipient")]
    InvalidRecipient,

    /// Token Bridge program's transfer is already redeemed.
    #[msg("AlreadyRedeemed")]
    AlreadyRedeemed,

    /// The SOL price is zero.
    #[msg("SolPriceNotSet")]
    SolPriceNotSet,

    /// The EVM token price is zero.
    #[msg("EvmChainPriceNotSet")]
    EvmChainPriceNotSet,

    /// Transfers are paused for this chain.
    #[msg("PausedTransfers")]
    PausedTransfers,
}
