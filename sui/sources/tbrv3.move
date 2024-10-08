module 0x0::TBRv3 {
	use std::address;
	use std::vector;
	use std::option::Option;
	use sui::vec_map::{Self, VecMap};
	use sui::coin::Coin;

	const VERSION: u64 = 1;

	const SEED_PREFIX_BRIDGED: vector<u8> = b"bridged";
	const SEED_PREFIX_TEMPORARY: vector<u8> = b"tmp";

	public struct ChainState has store {
		chain_id: u16,
		canonical_peer_address: address,
		max_gas_dropoff_micro_token: u32,
		relayer_fee_micro_usd: u32,
		outbound_transfers_paused: bool,
	}

	public struct State has key, store {
		id: UID,
		version: u64,

		owner: address,
		pending_owner: Option<address>,
		fee_recipient: address,

		// TODO: Maybe Table instead? Or an AdminCap and OwnerCap?
		admins: vector<address>,

		// TODO: Maybe a Table instead? Or a vector?
		chains: VecMap<u16, ChainState>,

		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	}

	public struct Initialize has copy, drop {
		deployer: address,
		owner: address,
		wormhole_sender: address,
		wormhole_redeemer: address,
	}

	public fun new(
		init: Initialize,
	): bool {
		false
	}

	/* Roles */

	/// Updates the owner account. This needs to be either cancelled or approved.
	public fun submit_owner_transfer_request(
		new_owner: address,
	): bool {
		// Check signer is the current owner.
		false
	}

	/// Approves the owner role transfer.
	public fun confirm_owner_transfer_request(): bool {
		// Check signer is the new owner.
		false
	}

	/// The owner role transfer is cancelled by the current one.
	public fun cancel_owner_transfer_request(): bool {
		// Check signer is the current owner.
		false
	}

	/// Adds a new admin account.
	public fun add_admin(
		new_admin: address,
	): bool {
		false
	}

	/// Removes a previously added admin account.
	public fun remove_admin(
		admin_to_be_removed: address,
	): bool {
		// NOTE: Signer can be either the owner or an admin
		false
	}

	/* Peer management */

	/// Register a new peer for the given chain.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun register_peer(
		chain_id: u16,
		peer_address: address,
	): bool {
		false
	}

	/// Set a different peer as canonical.
	///
	/// # Authorization
	///
	/// Owner.
	public fun update_canonical_peer(
		chain_id: u16,
		peer_address: address,
	): bool {
		false
	}

	/* Chain config */

	/// Forbids or allows any outbound transfer, *i.e.* from this chain.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun set_pause_for_outbound_transfers(
		chain_id: u16,
		paused: bool,
	): bool {
		false
	}

	/// What is the maximum allowed gas dropoff for this chain.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun update_max_gas_dropoff(
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
	): bool {
		false
	}

	/// Updates the value of the relayer fee, *i.e.* the flat USD amount
	/// to pay for a transfer to be done.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun update_relayer_fee(
		chain_id: u16,
		relayer_fee: u32,
	): bool {
		false
	}

	/* Config update */

	/// Updates the account to which the fees will be sent.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun update_fee_recipient(
		new_fee_recipient: address,
	): bool {
		false
	}

	/// Updates the transaction size of the EVM receiving side.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun update_evm_transaction_config(
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	): bool {
		false
	}

	/* Transfers */

	public struct TransferTokensRequest<T> {
		payer: address,
		token: Coin<T>,

		recipient_chain: u16,
		recipient_address: address,
		transferred_amount: u64,
		unwrap_intent: bool,
		dropoff_amount_micro: u32,
		max_fee_klam: u64,
	}

	/// # Parameters
	///
	/// - `dropoff_amount_micro`: the dropoff in µ-target-token.
	/// - `max_fee_klam`: the maximum fee the user is willing to pay, in Klamports, aka µSOL.
	public fun transfer_tokens<T>(
		req: TransferTokensRequest<T>,
	): bool {
		false
	}

	public struct CompleteTransfer<T> {
		payer: address,
		coin: Coin<T>,
		receiver: address,
		vaa: vector<u8>,
	}

	/// Complete a transfer initiated from another chain.
	public fun complete_transfer<T>(
		ctx: CompleteTransfer<T>,
		vaa_hash: address,
	): bool {
		false
	}

	/* Helpers */

	/// Returns a quote for a transfer, in µUSD.
	public fun relaying_fee(
		// ctx: QuoteQuery,
		chain_id: u16,
		dropoff_amount_micro: u32,
	): u64 {
		0
	}
}
