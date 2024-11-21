module tbrv3::outbound {
	public struct TokenTransfer has key, store {
		id: UID,
	}

	public fun start_token_transfer(
		ctx: &mut TxContext,
	): TokenTransfer {
		TokenTransfer {
			id: object::new(ctx),
		}
	}

	public fun finish_token_transfer(
		self: TokenTransfer,
	) {
		let TokenTransfer { id, .. } = self;
		id.delete();
	}
}
