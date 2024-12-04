module tbrv3::chain_state {
	// ----- Imports -----

	use tbrv3::peer::PeerCap;
	use tbrv3::tbrv3::TBRV3;

	use xlabs::owner::OwnerCap;
	use xlabs::admin::AdminCap;

	// ----- Structs -----

	public struct ChainState has store {
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
		relayer_fee_micro_usd: u32,
		outbound_transfers_paused: bool,
		canonical_peer_id: ID,
	}

	// ----- Constructors -----

	public fun new(
		_perm: &AdminCap<TBRV3>,
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
		relayer_fee_micro_usd: u32,
		outbound_transfers_paused: bool,
		canonical_peer: &PeerCap,
	): ChainState {
		ChainState {
			chain_id,
			max_gas_dropoff_micro_token,
			relayer_fee_micro_usd,
			outbound_transfers_paused,
			canonical_peer_id: object::id(canonical_peer),
		}
	}

	// ----- Getters -----

	public fun chain_id(
		chain_state: &ChainState,
	): u16 {
		chain_state.chain_id
	}

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

	public fun canonical_peer_id(
		chain_state: &ChainState,
	): ID {
		chain_state.canonical_peer_id
	}

	// ----- Setters -----

	public fun set_max_gas_dropoff_micro_token(
		chain_state: &mut ChainState,
		_perm: &AdminCap<TBRV3>,
		max_gas_dropoff_micro_token: u32,
	) {
		chain_state.max_gas_dropoff_micro_token = max_gas_dropoff_micro_token;
	}

	public fun set_relayer_fee_micro_usd(
		chain_state: &mut ChainState,
		_perm: &AdminCap<TBRV3>,
		relayer_fee_micro_usd: u32,
	) {
		chain_state.relayer_fee_micro_usd = relayer_fee_micro_usd;
	}

	public fun set_outbound_transfers_paused(
		chain_state: &mut ChainState,
		_perm: &AdminCap<TBRV3>,
		outbound_transfers_paused: bool,
	) {
		chain_state.outbound_transfers_paused = outbound_transfers_paused;
	}

	public fun set_canonical_peer_id(
		chain_state: &mut ChainState,
		_perm: &OwnerCap<TBRV3>,
		canonical_peer_id: ID,
	) {
		chain_state.canonical_peer_id = canonical_peer_id;
	}
}
