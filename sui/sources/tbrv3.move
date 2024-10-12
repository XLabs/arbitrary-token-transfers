module 0x0::TBRv3 {
	use sui::vec_map::{Self, VecMap};
	use sui::vec_set::{Self, VecSet};
	use sui::coin::Coin;

	const VERSION: u64 = 1;

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
		// RFI: Why does this exist? What is a non-canonical admin?
		admins: VecSet<address>,

		// TODO: Maybe a Table instead? Or a vector?
		chains: VecMap<u16, ChainState>,

		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	}

	public struct Initialize has drop {
		deployer: address,
		owner: address,
		fee_recipient: address,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	}

	public fun new(
		init: Initialize,
		ctx: &mut TxContext,
	): State {
		State {
			id: object::new(ctx),
			version: VERSION,

			owner: init.owner,
			pending_owner: option::none(),
			fee_recipient: init.fee_recipient,

			admins: vec_set::empty(),

			chains: vec_map::empty(),

			evm_transaction_gas: init.evm_transaction_gas,
			evm_transaction_size: init.evm_transaction_size,
		}
	}

	/* Roles */

	/// Checks if the caller is the owner.
	fun check_owner(state: &State, ctx: &TxContext): bool {
		state.owner == ctx.sender()
	}

	/// Checks if the caller is an admin.
	fun check_admin(state: &State, ctx: &TxContext): bool {
		state.admins.contains(&ctx.sender())
	}

	/// Checks if the caller is the owner or an admin.
	fun check_owner_or_admin(state: &State, ctx: &TxContext): bool {
		check_owner(state, ctx) || check_admin(state, ctx)
	}

	/*
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
	*/

	/// Adds a new admin account.
	public fun add_admin(
		state: &mut State,
		new_admin: address,
		ctx: &TxContext,
	): bool {
		if (!check_owner(state, ctx)) {
			return false
		};

		// Insert the new admin.
		state.admins.insert(new_admin);
		true
	}

	/// Removes a previously added admin account.
	public fun remove_admin(
		state: &mut State,
		admin_to_be_removed: address,
		ctx: &TxContext,
	): bool {
		if (!check_owner_or_admin(state, ctx)) {
			return false
		};

		state.admins.remove(&admin_to_be_removed);
		false
	}

	/* Peer management */

	/// Register a new peer for the given chain.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun register_peer(
		state: &mut State,
		chain_id: u16,
		peer_address: address,
		ctx: &TxContext,
	): bool {
		if (!check_owner_or_admin(state, ctx)) {
			return false
		};
		
		// TODO: What does this do? It seems like there is no use for anything besides the canonical peer.

		false
	}

	/// Set a different peer as canonical.
	///
	/// # Authorization
	///
	/// Owner.
	public fun update_canonical_peer(
		state: &mut State,
		chain_id: u16,
		peer_address: address,
		ctx: &TxContext,
	): bool {
		if (!check_owner(state, ctx)) {
			return false
		};

		state.chains.get_mut(&chain_id).canonical_peer_address = peer_address;
		true
	}

	/* Chain config */

	/// Forbids or allows any outbound transfer, *i.e.* from this chain.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun set_pause_for_outbound_transfers(
		state: &mut State,
		chain_id: u16,
		paused: bool,
		ctx: &TxContext,
	): bool {
		if (!check_owner_or_admin(state, ctx)) {
			return false
		};

		state.chains.get_mut(&chain_id).outbound_transfers_paused = paused;
		true
	}

	/// What is the maximum allowed gas dropoff for this chain.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun update_max_gas_dropoff(
		state: &mut State,
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
		ctx: &TxContext,
	): bool {
		if (!check_owner_or_admin(state, ctx)) {
			return false
		};

		state.chains.get_mut(&chain_id).max_gas_dropoff_micro_token = max_gas_dropoff_micro_token;
		true
	}

	/// Updates the value of the relayer fee, *i.e.* the flat USD amount
	/// to pay for a transfer to be done.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun update_relayer_fee(
		state: &mut State,
		chain_id: u16,
		relayer_fee: u32,
		ctx: &TxContext,
	): bool {
		if (!check_owner_or_admin(state, ctx)) {
			return false
		};

		state.chains.get_mut(&chain_id).relayer_fee_micro_usd = relayer_fee;
		true
	}

	/* Config update */

	/// Updates the account to which the fees will be sent.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	// RFI: Why is this not just the owner?
	public fun update_fee_recipient(
		state: &mut State,
		new_fee_recipient: address,
		ctx: &TxContext,
	): bool {
		if (!check_owner_or_admin(state, ctx)) {
			return false
		};

		state.fee_recipient = new_fee_recipient;
		true
	}

	/// Updates the transaction size of the EVM receiving side.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	// RFI: Why is this not just the owner?
	public fun update_evm_transaction_config(
		state: &mut State,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
		ctx: &TxContext,
	): bool {
		if (!check_owner_or_admin(state, ctx)) {
			return false
		};

		state.evm_transaction_gas = evm_transaction_gas;
		state.evm_transaction_size = evm_transaction_size;
		true
	}

	/* Transfers */

	public struct TransferTokensRequest<phantom T> {
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
		state: &mut State,
		req: TransferTokensRequest<T>,
		ctx: &TxContext,
	): bool {
		false
	}

	public struct CompleteTransfer<phantom T> {
		payer: address,
		coin: Coin<T>,
		receiver: address,
		vaa: vector<u8>,
	}

	/// Complete a transfer initiated from another chain.
	public fun complete_transfer<T>(
		state: &mut State,
		req: CompleteTransfer<T>,
		vaa_hash: address,
		ctx: &TxContext,
	): bool {
		false
	}

	/* Helpers */

	public struct QuoteQuery has drop {
		chain_id: u16,
		dropoff_in_micro_usd: u32,
	}

	/// Returns a quote for a transfer, in µUSD.
	public fun relaying_fee(
		req: QuoteQuery,
		chain_id: u16,
		dropoff_amount_micro: u32,
	): u64 {
		0
	}
}
