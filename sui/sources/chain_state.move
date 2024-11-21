module tbrv3::chain_state {
	// ----- Imports -----

	use tbrv3::owner::OwnerCap;

	// ----- Structs -----

	public struct ChainState has store {
		max_gas_dropoff_micro_token: u32,
		relayer_fee_micro_usd: u32,
		outbound_transfers_paused: bool,
	}

	// ----- Getters -----

	public fun max_gas_dropoff_micro_token(
		chain_state: &ChainState,
	): u32 {
		chain_state.max_gas_dropoff_micro_token
	}

	public fun relayer_fee_micro_usd(
		chain_state: &ChainState,
	): u32 {
		chain_state.relayer_fee_micro_usd
	}

	public fun outbound_transfers_paused(
		chain_state: &ChainState,
	): bool {
		chain_state.outbound_transfers_paused
	}

	// ----- Setters -----

	public fun set_max_gas_dropoff_micro_token(
		chain_state: &mut ChainState,
		_perm: &OwnerCap,
		max_gas_dropoff_micro_token: u32,
	) {
		chain_state.max_gas_dropoff_micro_token = max_gas_dropoff_micro_token;
	}

	public fun set_relayer_fee_micro_usd(
		chain_state: &mut ChainState,
		_perm: &OwnerCap,
		relayer_fee_micro_usd: u32,
	) {
		chain_state.relayer_fee_micro_usd = relayer_fee_micro_usd;
	}

	public fun set_outbound_transfers_paused(
		chain_state: &mut ChainState,
		_perm: &OwnerCap,
		outbound_transfers_paused: bool,
	) {
		chain_state.outbound_transfers_paused = outbound_transfers_paused;
	}
}
