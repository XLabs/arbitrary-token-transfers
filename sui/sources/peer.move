module tbrv3::peer {
	// ----- Imports -----

	use tbrv3::admin::AdminPermission;

	// ----- Structs -----

	public struct PeerCap has key, store {
		id: UID,
		chain: u16,
		chain_address: vector<u8>,
	}

	// ----- Constructors -----

	// Create a new peer from an admin cap
	// Authorization: Admin
	public fun new_peer(
		_perm: &AdminPermission,
		chain: u16,
		chain_address: vector<u8>,
		ctx: &mut TxContext,
	) {
		transfer::share_object(
			PeerCap {
				id: object::new(ctx),
				chain,
				chain_address,
			}
		);
	}

	// ----- Getters -----

	public fun chain(
		self: &PeerCap,
	): u16 {
		self.chain
	}

	public fun chain_address(
		self: &PeerCap,
	): vector<u8> {
		self.chain_address
	}
}
