module tbrv3::state {
	// ----- Imports -----

	use tbrv3::tbrv3::TBRV3;

	use xlabs::admin::AdminCap;

	use sui::balance::{Balance, zero};
	use sui::coin::Coin;
	use sui::sui::SUI;
	
	use wormhole::emitter::EmitterCap;
	use wormhole::state::State as WormholeState;

	// ----- Constants -----

	const VERSION: u64 = 1;

	// ----- Structs -----
	
	public struct State has key {
		id: UID,
		version: u64,
	
		fee_recipient: address, // TODO: Make this into a cap, hold the fee balance in the state

		evm_transaction_gas: u64,
		evm_transaction_size: u64,

		emitter_cap: EmitterCap,

		gas_supply: Balance<SUI>,
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
				version: VERSION,

				fee_recipient,

				evm_transaction_gas,
				evm_transaction_size,

				emitter_cap: wormhole::emitter::new(wormhole, ctx),

				gas_supply: zero(),
			}
		);
	}

	// ----- Getters -----

	public fun fee_recipient(state: &State): address {
		state.fee_recipient
	}

	public fun evm_transaction_gas(state: &State): u64 {
		state.evm_transaction_gas
	}

	public fun evm_transaction_size(state: &State): u64 {
		state.evm_transaction_size
	}

	public(package) fun gas_supply_mut(state: &mut State): &mut Balance<SUI> {
		&mut state.gas_supply
	}

	public(package) fun emitter_cap(state: &State): &EmitterCap {
		&state.emitter_cap
	}

	// ----- Setters -----

	// Update the fee recipient
	// Authorization: Admin
	public fun set_fee_recipient(
		state: &mut State,
		_perm: &AdminCap<TBRV3>,
		new_fee_recipient: address,
	) {
		// Verify the state version
		state.is_current_version();

		// Update the fee recipient
		state.fee_recipient = new_fee_recipient;
	}

	// Update the EVM transaction config
	// Authorization: Admin
	public fun set_evm_transaction_config(
		state: &mut State,
		_perm: &AdminCap<TBRV3>,
		evm_transaction_gas: u64,
		evm_transaction_size: u64,
	) {
		// Verify the state version
		state.is_current_version();

		// Update the evm transaction config
		state.evm_transaction_gas = evm_transaction_gas;
		state.evm_transaction_size = evm_transaction_size;
	}

	// ----- Methods -----

	public fun is_current_version(state: &State) {
		assert!(state.version == VERSION);
	}

	public fun add_gas_token_supply(
		state: &mut State,
		_perm: &AdminCap<TBRV3>,
		amount: Coin<SUI>,
	) {
		// Verify the state version
		state.is_current_version();

		// Add balance to the gas token supply
		state.gas_supply.join(amount.into_balance());
	}
}
