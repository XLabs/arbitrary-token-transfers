module tbrv3::outbound {
	// ----- Imports -----

	use tbrv3::chain_state::ChainState;
	use tbrv3::message::Self;
	use tbrv3::peer::PeerCap;
	use tbrv3::state::State;

	use sui::coin::Coin;
	use sui::sui::SUI;

	use token_bridge::token_registry::{VerifiedAsset};
	use token_bridge::transfer_tokens_with_payload::{TransferTicket, prepare_transfer};

	use wormhole::external_address::ExternalAddress;

	// ----- Methods -----

	public fun token_transfer_out<C>(
		state: &mut State,

		asset_info: VerifiedAsset<C>,
		chain_info: &ChainState,
		canonical_peer: &PeerCap,
		funds: Coin<C>,
		mut fees: Coin<SUI>,

		recipient_chain: u16,
		recipient_address: ExternalAddress,

		gas_dropoff_amount_micro_tokens: u32,
		unwrap_intent: bool,
		
		ctx: &mut TxContext,
	): (TransferTicket<C>, Coin<C>, Coin<SUI>) {
		// Verify the state version
		state.is_current_version();

		// Verify the chain is the correct chain
		assert!(chain_info.chain_id() == recipient_chain);

		// Verify the peer is the correct peer
		assert!(chain_info.canonical_peer_id() == object::id(canonical_peer));

		// Verify the chain is not paused
		assert!(!chain_info.outbound_transfers_paused());

		// Verify the requested gas dropoff is within the limit
		assert!(gas_dropoff_amount_micro_tokens <= chain_info.max_gas_dropoff_micro_token());

		// Calculate the total fee
		// FIXME: Add a call to the quote module to get the fee.
		let total_fee = 0;

		// Prepare the message
		let message = message::new(
			recipient_address,
			gas_dropoff_amount_micro_tokens,
			unwrap_intent,
		);

		// Prepare the transfer
		let emitter_cap = state.emitter_cap();
		let (ticket, dust) = prepare_transfer(
			emitter_cap,
			asset_info,
			funds,
			recipient_chain,
			canonical_peer.chain_address().to_bytes(),
			message.to_bytes(),
			emitter_cap.sequence() as u32,
		);

		// Transfer the fee to the fee collector
		// NOTE: This will cause an abort if the total fee is more than the limit set by the fee coin.
		let fee_coin = fees.split(total_fee, ctx);
		// FIXME: This will result in a lot of tiny coins on the fee collector, we probably want to accumulate them in a single coin.
		transfer::public_transfer(fee_coin, state.fee_recipient());

		(ticket, dust, fees)
	}
}
