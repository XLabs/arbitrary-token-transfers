module tbrv3::inbound {
	// ----- Imports -----

	use tbrv3::state::State;
	use tbrv3::message::Self;
	use tbrv3::peer::PeerCap;

	use sui::address::Self;
	use sui::coin::Self;
	use sui::event::emit;

	use token_bridge::complete_transfer_with_payload::{RedeemerReceipt, redeem_coin};
	
	use wormhole::external_address::ExternalAddress;

	// ----- Structs -----

	public struct TokenTransferInEvent has copy, drop {
		source_chain: u16,
		source_address: ExternalAddress,
		recipient: address,
		token_chain: u16,
		token_address: ExternalAddress,
		amount: u64,
	}

	// ----- Methods -----

	public fun token_transfer_in<C>(
		self: &mut State,
		receipt: RedeemerReceipt<C>,
		peer: &PeerCap,
		ctx: &mut TxContext,
	) {
		// Verify the state version
		self.is_current_version();

		// Redeem the coin
		let (coin, payload_wrapper, source_chain) = redeem_coin(self.emitter_cap(), receipt);
		
		// Validate the sender
		assert!(source_chain == peer.chain());
		assert!(payload_wrapper.sender().to_bytes() == peer.chain_address().to_bytes());

		// Parse the payload
		let amount = payload_wrapper.amount().value();
		let token_chain = payload_wrapper.token_chain();
		let token_address = payload_wrapper.token_address();
		let source_address = payload_wrapper.sender();
		let payload = payload_wrapper.payload();
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

		// Emit event
		emit(
			TokenTransferInEvent {
				source_chain,
				source_address,
				recipient,
				token_chain,
				token_address,
				amount,
			}
		);

		// NOTE: No need to do any unwrap, in Sui there's no wrapping of the gas token
	}
}
