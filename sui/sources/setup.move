module tbrv3::setup {
	public struct DeployCap has key {
		id: UID,
	}

	// Initialize the module
	fun init(
		ctx: &mut TxContext,
	) {
		// NOTE: For Sui implementation reasons, this function is not allowed to return anything, so we instead transfer the cap to the sender manually.
		transfer::transfer(
			DeployCap { id: object::new(ctx) },
			ctx.sender(),
		);
	}
}
