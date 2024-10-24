module 0x0::TBRv3 {
	use sui::vec_map::{Self, VecMap};

	const VERSION: u64 = 1;

	public struct OwnerCap has key, store {
		id: UID,
	}

	public struct AdminCap has key, store {
		id: UID,
	}

	public struct PeerCap has key, store {
		id: UID,
		chain_id: u16,
		peer_address: address, // Remote address on the given chain ID
	}

	public struct ChainState has store {
		canonical_peer: address,
		max_gas_dropoff_micro_token: u32,
		relayer_fee_micro_usd: u32,
		outbound_transfers_paused: bool,
	}

	public struct State has key, store {
		id: UID,
		version: u64,

		fee_recipient: address,

		// TODO: Maybe a Table instead?
		chains: VecMap<u16, ChainState>,

		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	}

	public struct Initialize has drop {
		owner: address,
		fee_recipient: address,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	}

	// FIXME: Probably need to take in the owner cap from the common ownership module.
	public fun new(
		init: Initialize,
		ctx: &mut TxContext,
	): State {
		// Create owner cap for the owner.
		transfer::transfer(
			OwnerCap { id: object::new(ctx) },
			init.owner,
		);

		// Create admin cap for the owner.
		transfer::transfer(
			AdminCap { id: object::new(ctx) },
			init.owner,
		);

		// Create the state.
		State {
			id: object::new(ctx),
			version: VERSION,

			fee_recipient: init.fee_recipient,

			chains: vec_map::empty(),

			evm_transaction_gas: init.evm_transaction_gas,
			evm_transaction_size: init.evm_transaction_size,
		}
	}

	/// Adds a new admin account.
	///
	/// # Authorization
	///
	/// Owner.
	public fun add_admin(
		_owner: &OwnerCap,
		new_admin: address,
		ctx: &mut TxContext,
	): bool {
		transfer::transfer(
			AdminCap { id: object::new(ctx) },
			new_admin,
		);

		true
	}

	/// Removes a previously added admin account.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun remove_admin(
		_current_admin: &AdminCap,
		admin_to_be_removed: AdminCap,
	): bool {
		let AdminCap { id } = admin_to_be_removed;
		id.delete();
		true
	}

	/* Peer management */

	/// Register a new peer for the given chain.
	///
	/// # Authorization
	///
	/// Owner or Admin.
	public fun register_peer(
		_admin: &AdminCap,
		chain_id: u16,
		peer_address: address, // Remote address on the given chain ID
		ctx: &mut TxContext,
	): bool {
		transfer::transfer(
			PeerCap { id: object::new(ctx), chain_id, peer_address },
			peer_address,
		);

		true
	}

	/// Set a different peer as canonical.
	///
	/// # Authorization
	///
	/// Owner.
	public fun update_canonical_peer(
		state: &mut State,
		_owner: &OwnerCap,
		peer: &PeerCap,
	): bool {
		state.chains.get_mut(&peer.chain_id).canonical_peer = peer.peer_address;
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
		_admin: &AdminCap,
		chain_id: u16,
		paused: bool,
	): bool {
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
		_admin: &AdminCap,
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
		ctx: &TxContext,
	): bool {
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
		_admin: &AdminCap,
		chain_id: u16,
		relayer_fee: u32,
		ctx: &TxContext,
	): bool {
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
		_admin: &AdminCap,
		new_fee_recipient: address,
		ctx: &TxContext,
	): bool {
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
		_admin: &AdminCap,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
		ctx: &TxContext,
	): bool {
		state.evm_transaction_gas = evm_transaction_gas;
		state.evm_transaction_size = evm_transaction_size;
		true
	}

	/* Transfers */

	/* We comment the transfer functions out for now
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

	*/

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
