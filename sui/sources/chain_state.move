module tbrv3::chain_state {
	// ----- Imports -----

	use tbrv3::peer::PeerCap;
	use tbrv3::tbrv3::TBRV3;

	use sui::event::emit;

	use xlabs::owner::OwnerCap;
	use xlabs::admin::AdminCap;

	use wormhole::external_address::ExternalAddress;

	// ----- Structs -----

	public struct ChainState has store {
		// TODO: Does this need a version?
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
		relayer_fee_micro_usd: u32,
		outbound_transfers_paused: bool,
		canonical_peer_id: ID,
	}

	public struct NewChainStateEvent has copy, drop {
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
		relayer_fee_micro_usd: u32,
		outbound_transfers_paused: bool,
		canonical_peer_chain_id: u16,
		canonical_peer_address: ExternalAddress,
	}

	public struct SetMaxGasDropoffMicroTokenEvent has copy, drop {
		chain_id: u16,
		max_gas_dropoff_micro_token: u32,
	}

	public struct SetRelayerFeeMicroUsdEvent has copy, drop {
		chain_id: u16,
		relayer_fee_micro_usd: u32,
	}

	public struct SetOutboundTransfersPausedEvent has copy, drop {
		chain_id: u16,
		outbound_transfers_paused: bool,
	}

	public struct SetCanonicalPeerEvent has copy, drop {
		chain_id: u16,
		canonical_peer_chain_id: u16,
		canonical_peer_address: ExternalAddress,
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
		emit(
			NewChainStateEvent {
				chain_id,
				max_gas_dropoff_micro_token,
				relayer_fee_micro_usd,
				outbound_transfers_paused,
				canonical_peer_chain_id: canonical_peer.chain(),
				canonical_peer_address: canonical_peer.chain_address(),
			}
		);

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
		self: &ChainState,
	): u16 {
		self.chain_id
	}

	public fun max_gas_dropoff_micro_token(
		self: &ChainState,
	): u32 {
		self.max_gas_dropoff_micro_token
	}

	public fun relayer_fee_micro_usd(
		self: &ChainState,
	): u32 {
		self.relayer_fee_micro_usd
	}

	public fun outbound_transfers_paused(
		self: &ChainState,
	): bool {
		self.outbound_transfers_paused
	}

	public fun canonical_peer_id(
		self: &ChainState,
	): ID {
		self.canonical_peer_id
	}

	// ----- Setters -----

	public fun set_max_gas_dropoff_micro_token(
		self: &mut ChainState,
		_perm: &AdminCap<TBRV3>,
		max_gas_dropoff_micro_token: u32,
	) {
		emit(
			SetMaxGasDropoffMicroTokenEvent {
				chain_id: self.chain_id,
				max_gas_dropoff_micro_token,
			}
		);

		self.max_gas_dropoff_micro_token = max_gas_dropoff_micro_token;
	}

	public fun set_relayer_fee_micro_usd(
		self: &mut ChainState,
		_perm: &AdminCap<TBRV3>,
		relayer_fee_micro_usd: u32,
	) {
		emit(
			SetRelayerFeeMicroUsdEvent {
				chain_id: self.chain_id,
				relayer_fee_micro_usd,
			}
		);

		self.relayer_fee_micro_usd = relayer_fee_micro_usd;
	}

	public fun set_outbound_transfers_paused(
		self: &mut ChainState,
		_perm: &AdminCap<TBRV3>,
		outbound_transfers_paused: bool,
	) {
		emit(
			SetOutboundTransfersPausedEvent {
				chain_id: self.chain_id,
				outbound_transfers_paused,
			}
		);

		self.outbound_transfers_paused = outbound_transfers_paused;
	}

	public fun set_canonical_peer(
		self: &mut ChainState,
		_perm: &OwnerCap<TBRV3>,
		canonical_peer: &PeerCap,
	) {
		emit(
			SetCanonicalPeerEvent {
				chain_id: self.chain_id,
				canonical_peer_chain_id: canonical_peer.chain(),
				canonical_peer_address: canonical_peer.chain_address(),
			}
		);

		self.canonical_peer_id = object::id(canonical_peer);
	}
}
