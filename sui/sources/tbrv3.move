// TODO: Look for TODO/RFI/FIXME comments in the code and address them.

module 0x0::TBRv3 {
	use sui::bcs::Self;
	use sui::coin::{Coin, zero};
	use sui::sui::SUI;
	use sui::table::{Self, Table};
	
	use wormhole::emitter::EmitterCap;

	use token_bridge::coin_utils;
	use token_bridge::token_registry::VerifiedAsset;
	use token_bridge::transfer_tokens_with_payload::{TransferTicket, prepare_transfer};
	use token_bridge::transfer_with_payload::payload;
	use token_bridge::complete_transfer_with_payload::{RedeemerReceipt, redeem_coin};

	const VERSION: u64 = 1;

	public struct OwnerCap has key, store {
		id: UID,
	}

	public struct PeerAddress has copy, drop, store {
		chain_id: u16,
		peer_address: address, // Remote address on the given chain ID
	}

	public struct ChainState has store {
		canonical_peer: address, // TODO: This should be a vector<u8> since each chain has its own address format.
		max_gas_dropoff_micro_token: u32,
		relayer_fee_micro_usd: u32,
		outbound_transfers_paused: bool,
	}

	public struct State has key, store {
		id: UID,
		version: u64,

		fee_recipient: address,

		chains: Table<u16, ChainState>,

		// NOTE: Both of these are logically sets, but VecSet is O(n) for lookups, so we use a table instead.
		peers: Table<PeerAddress, bool>,
		admins: Table<address, bool>,

		evm_transaction_gas: u64,
		evm_transaction_size: u64,

		emitter_cap: EmitterCap,

		gas_coin: Coin<SUI>,
	}

	public struct Initialize has drop {
		owner: address,
		fee_recipient: address,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	}

	fun is_admin(state: &State, account: address): bool {
		state.admins.contains(account)
	}

	// FIXME: Probably need to take in the owner cap from the common ownership module.
	public fun new(
		init: Initialize,
		emitter_cap: EmitterCap, // TODO: Construct this ourselves
		ctx: &mut TxContext,
	): State {
		// Create owner cap for the owner.
		// TODO: import this from the common ownership module.
		transfer::transfer(
			OwnerCap { id: object::new(ctx) },
			init.owner,
		);

		// Create the state.
		State {
			id: object::new(ctx),
			version: VERSION,

			fee_recipient: init.fee_recipient,

			chains: table::new(ctx),
			peers: table::new(ctx),
			admins: table::new(ctx),

			evm_transaction_gas: init.evm_transaction_gas,
			evm_transaction_size: init.evm_transaction_size,

			emitter_cap,

			gas_coin: zero<SUI>(ctx),
		}
	}

	// Adds a new admin account.
	//
	// # Authorization
	//
	// Owner.
	public fun add_admin(
		state: &mut State,
		_owner: &OwnerCap,
		new_admin: address,
	) {
		state.admins.add(new_admin, true);
	}

	// Removes a previously added admin account.
	//
	// # Authorization
	//
	// Owner or Admin.
	public fun remove_admin(
		state: &mut State,
		admin_to_be_removed: address,
		ctx: &TxContext,
	) {
		assert!(is_admin(state, ctx.sender()));
		state.admins.remove(admin_to_be_removed);
	}

	/* Peer management */

	// Register a new peer for the given chain.
	//
	// # Authorization
	//
	// Owner or Admin.
	public fun register_peer(
		state: &mut State,
		peer: PeerAddress,
		ctx: &TxContext,
	) {
		assert!(is_admin(state, ctx.sender()));
		state.peers.add(peer, true);
	}

	// Set a different peer as canonical.
	//
	// # Authorization
	//
	// Owner.
	public fun update_canonical_peer(
		state: &mut State,
		_owner: &OwnerCap,
		peer: PeerAddress,
	) {
		state.chains.borrow_mut(peer.chain_id).canonical_peer = peer.peer_address;
	}

	/* Chain config */

	// Forbids or allows any outbound transfer, *i.e.* from this chain.
	//
	// # Authorization
	//
	// Owner or Admin.
	public fun set_pause_for_outbound_transfers(
		state: &mut State,
		chain_id: u16,
		paused: bool,
		ctx: &TxContext,
	) {
		assert!(is_admin(state, ctx.sender()));
		state.chains.borrow_mut(chain_id).outbound_transfers_paused = paused;
	}

	// What is the maximum allowed gas dropoff for this chain.
	//
	// # Authorization
	//
	// Owner or Admin.
	public fun update_max_gas_dropoff(
		state: &mut State,
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
		ctx: &TxContext,
	) {
		assert!(is_admin(state, ctx.sender()));
		state.chains.borrow_mut(chain_id).max_gas_dropoff_micro_token = max_gas_dropoff_micro_token;
	}

	// Updates the value of the relayer fee, *i.e.* the flat USD amount
	// to pay for a transfer to be done.
	//
	// # Authorization
	//
	// Owner or Admin.
	public fun update_relayer_fee(
		state: &mut State,
		chain_id: u16,
		relayer_fee: u32,
		ctx: &TxContext,
	) {
		assert!(is_admin(state, ctx.sender()));
		state.chains.borrow_mut(chain_id).relayer_fee_micro_usd = relayer_fee;
	}

	/* Config update */

	// Updates the account to which the fees will be sent.
	//
	// # Authorization
	//
	// Owner or Admin.
	// RFI: Why is this not just the owner?
	public fun update_fee_recipient(
		state: &mut State,
		new_fee_recipient: address,
		ctx: &TxContext,
	) {
		assert!(is_admin(state, ctx.sender()));
		state.fee_recipient = new_fee_recipient;
	}

	// Updates the transaction size of the EVM receiving side.
	//
	// # Authorization
	//
	// Owner or Admin.
	// RFI: Why is this not just the owner?
	public fun update_evm_transaction_config(
		state: &mut State,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
		ctx: &TxContext,
	) {
		assert!(is_admin(state, ctx.sender()));
		state.evm_transaction_gas = evm_transaction_gas;
		state.evm_transaction_size = evm_transaction_size;
	}

	// TODO: A way to add to the gas coin

	/* Transfers */

	public struct TransferTokensRequest has drop {
		version: u64,
		transferred_amount: u64,

		recipient_chain: u16,
		recipient_address: address,

		dropoff_amount_micro: u32, // Dropoff in µ-target-token

		max_fee_mist: u64, // Maximum fee in mist(nano-sui)
	}

	// TODO: We need to make sure this is byte-by-byte encoded the same as the other chains I think
	public struct RelayerMessage has drop {
		version: u64,
		recipient_address: address,
		dropoff_amount_micro: u32,
	}

	public fun transfer_tokens<C>(
		state: &mut State,
		req: TransferTokensRequest,
		asset_info: VerifiedAsset<C>,
		mut coin: Coin<C>,
		mut base_fee_coin: Coin<SUI>,
		ctx: &mut TxContext,
	): (Option<TransferTicket<C>>, Coin<C>, Coin<SUI>) {
		// Check the version.
		if (req.version != VERSION) {
			return (option::none(), coin, base_fee_coin)
		};

		// Check if the outbound transfers are paused.
		if (state.chains.borrow(req.recipient_chain).outbound_transfers_paused) {
			return (option::none(), coin, base_fee_coin)
		};

		// Calculate the fee
		// TODO: Call into quote module to get the fee.
		let fee = 0;

		// Check if the max fee is respected.
		if (fee > req.max_fee_mist) {
			return (option::none(), coin, base_fee_coin)
		};

		// Split and transfer the fee to the fee collector
		let fee_coin = base_fee_coin.split(fee, ctx);
		// TODO: We probably want to move this to a coin kept in the state and then let the fee collector withdraw it.
		transfer::public_transfer(fee_coin, state.fee_recipient);

		// Split the requested amount from the coin.
		let send_coin = coin.split(req.transferred_amount, ctx);

		// Prepare the payload
		let payload = RelayerMessage {
			version: VERSION,
			recipient_address: req.recipient_address,
			dropoff_amount_micro: req.dropoff_amount_micro,
		};

		// Call token bridge
		let canonical_peer_address = state.chains.borrow(req.recipient_chain).canonical_peer;
		let (ticket, dust) = prepare_transfer(
			&state.emitter_cap,
			asset_info,
			send_coin,
			req.recipient_chain,
			canonical_peer_address.to_bytes(),
			bcs::to_bytes(&payload),
			state.emitter_cap.sequence() as u32,
		);

		// Return dust to sender
		coin_utils::return_nonzero(dust, ctx);

		// Return the ticket
		(option::some(ticket), coin, base_fee_coin)
	}

	// Complete a transfer initiated from another chain.
	public fun complete_transfer<C>(
		state: &mut State,
		receipt: RedeemerReceipt<C>,
		ctx: &mut TxContext,
	) {
		// Complete transfer
		let (bridged, transfer, source_chain) = redeem_coin(&state.emitter_cap, receipt);

		// Parse the payload
		let mut bcs = bcs::new(transfer.payload());
		
		let relayer_message_version = bcs.peel_u64();
		assert!(relayer_message_version == VERSION);

		let relayer_message = RelayerMessage {
			version: relayer_message_version,
			recipient_address: bcs.peel_address(),
			dropoff_amount_micro: bcs.peel_u32(),
		};

		// Transfer the bridged token to the recipient
		transfer::public_transfer(bridged, relayer_message.recipient_address);

		// Redeem gas
		if (relayer_message.dropoff_amount_micro > 0) {
			let dropoff_amount = (relayer_message.dropoff_amount_micro as u64) * 1000;
			let gas = state.gas_coin.split(dropoff_amount, ctx);
			transfer::public_transfer(gas, relayer_message.recipient_address);
		};
	}
}
