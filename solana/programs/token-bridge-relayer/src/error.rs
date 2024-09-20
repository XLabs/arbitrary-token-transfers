use anchor_lang::prelude::error_code;

pub type TokenBridgeRelayerResult<T> = std::result::Result<T, TokenBridgeRelayerError>;

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

    /// Specified peer is already canonical.
    #[msg("AlreadyTheCanonicalPeer")]
    AlreadyTheCanonicalPeer,

    /// Fee exceed what the user has set as a maximum.
    #[msg("FeeExceedingMaximum")]
    FeeExceedingMaximum,

    /// Deserialized recipient must be this program or the redeemer PDA.
    #[msg("InvalidTransferToAddress")]
    InvalidTransferToAddress,

    /// Deserialized token chain is invalid.
    #[msg("InvalidTransferToChain")]
    InvalidTransferToChain,

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

    /// Token Bridge program's transfer is already redeemed.
    #[msg("AlreadyRedeemed")]
    AlreadyRedeemed,

    /// The EVM token price is zero.
    #[msg("EvmChainPriceNotSet")]
    EvmChainPriceNotSet,

    /// Transfers are paused for this chain.
    #[msg("PausedTransfers")]
    PausedTransfers,

    /// The peer sending the transfer is not the right one.
    #[msg("InvalidSendingPeer")]
    InvalidSendingPeer,
}
