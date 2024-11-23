module tbrv3::inbound {
	// ----- Imports -----

	use tbrv3::state::State;
	use tbrv3::message::Self;
	use tbrv3::peer::PeerCap;

	use sui::address::Self;
	use sui::coin::Self;

	use token_bridge::complete_transfer_with_payload::{RedeemerReceipt, redeem_coin};

	// ----- Methods -----

	public fun token_transfer_in<C>(
		self: &mut State,
		receipt: RedeemerReceipt<C>,
		peer: &PeerCap,
		ctx: &mut TxContext,
	) {
		// Redeem the coin
		let (coin, payload_wrapper, source_chain) = redeem_coin(self.emitter_cap(), receipt);
		
		// Validate the sender
		assert!(source_chain == peer.chain());
		assert!(payload_wrapper.sender().to_bytes() == peer.chain_address().to_bytes());

		// Parse the payload
		let payload = payload_wrapper.take_payload();
		let message = message::from_bytes(payload);

		// Transfer the bridged token to the recipient
		let recipient = address::from_bytes(message.recipient().to_bytes());
		transfer::public_transfer(coin, recipient);

		// Transfer the gas
		let requested_gas = (message.gas_dropoff_micro_token() as u64) * 1000;
		if (requested_gas > 0) {
			let gas_balance = self.gas_supply_mut().split(requested_gas);
			let gas_coin = coin::from_balance(gas_balance, ctx);
			transfer::public_transfer(gas_coin, recipient);
		};

		// NOTE: No need to do any unwrap, in Sui there's no wrapping of the gas token
	}
}
