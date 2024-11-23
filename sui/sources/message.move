module tbrv3::message {
	// ----- Imports -----

	use wormhole::external_address::{Self, ExternalAddress};
	use wormhole::bytes::{Self};
	use wormhole::cursor::{Self};

	// ----- Constants -----

	const RELAYER_MESSAGE_ID: u8 = 0;

	// ----- Structs -----

	public struct RelayerMessage has copy, drop {
		recipient: ExternalAddress,
		gas_dropoff_micro_token: u32,
		unwrap_intent: bool,
	}

	// ----- Constructors -----

	public(package) fun new(
		recipient: ExternalAddress,
		gas_dropoff_micro_token: u32,
		unwrap_intent: bool,
	): RelayerMessage {
		RelayerMessage {
			recipient,
			gas_dropoff_micro_token,
			unwrap_intent,
		}
	}

	// ----- Getters -----

	public fun recipient(
		self: &RelayerMessage,
	): ExternalAddress {
		self.recipient
	}

	public fun gas_dropoff_micro_token(
		self: &RelayerMessage,
	): u32 {
		self.gas_dropoff_micro_token
	}

	public fun unwrap_intent(
		self: &RelayerMessage,
	): bool {
		self.unwrap_intent
	}

	// ----- Methods -----

	public fun to_bytes(
		self: &RelayerMessage,
	): vector<u8> {
		let mut result = vector::empty();
		bytes::push_u8(&mut result, RELAYER_MESSAGE_ID);
		result.append(self.recipient.to_bytes());
		bytes::push_u32_be(&mut result, self.gas_dropoff_micro_token);
		let unwrap_intent = if (self.unwrap_intent) { 1 } else { 0 };
		bytes::push_u8(&mut result, unwrap_intent);
		result
	}

	public fun from_bytes(
		data: vector<u8>,
	): RelayerMessage {
		let mut cursor = cursor::new(data);
		
		let id = bytes::take_u8(&mut cursor);
		let recipient = external_address::take_bytes(&mut cursor);
		let gas_dropoff_micro_token = bytes::take_u32_be(&mut cursor);
		let unwrap_intent = bytes::take_u8(&mut cursor) != 0;

		cursor.destroy_empty();

		assert!(id == RELAYER_MESSAGE_ID);

		RelayerMessage {
			recipient,
			gas_dropoff_micro_token,
			unwrap_intent,
		}
	}
}