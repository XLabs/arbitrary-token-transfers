module tbrv3::state {
	// ----- Imports -----

	use tbrv3::admin::AdminPermission;

	use sui::balance::{Balance, zero};
	use sui::sui::SUI;
	
	use wormhole::emitter::EmitterCap;
	use wormhole::state::State as WormholeState;

	// ----- Structs -----
	
	public struct State has key {
		id: UID,

		fee_recipient: address,

		evm_transaction_gas: u64,
		evm_transaction_size: u64,

		emitter_cap: EmitterCap,

		gas_token_supply: Balance<SUI>,
	}

	// ----- Constructors -----

	public(package) fun new(
		fee_recipient: address,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
		wormhole: &WormholeState,
		ctx: &mut TxContext,
	) {
		transfer::share_object(
			State {
				id: object::new(ctx),

				fee_recipient,

				evm_transaction_gas,
				evm_transaction_size,

				emitter_cap: wormhole::emitter::new(wormhole, ctx),

				gas_token_supply: zero(),
			}
		);
	}

	// ----- Setters -----

	// Update the fee recipient
	// Authorization: Admin
	public fun set_fee_recipient(
		state: &mut State,
		_perm: &AdminPermission,
		new_fee_recipient: address,
	) {
		// Update the fee recipient
		state.fee_recipient = new_fee_recipient;
	}

	// Update the EVM transaction config
	// Authorization: Admin
	public fun set_evm_transaction_config(
		state: &mut State,
		_perm: &AdminPermission,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	) {
		state.evm_transaction_gas = evm_transaction_gas;
		state.evm_transaction_size = evm_transaction_size;
	}

	// ----- Methods -----

	public fun add_gas_token_supply(
		state: &mut State,
		_perm: &AdminPermission,
		amount: Balance<SUI>,
	) {
		state.gas_token_supply.join(amount);
	}
}
