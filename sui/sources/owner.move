module tbrv3::owner {
	// ----- Imports -----

	use tbrv3::setup::DeployCap;

	// ----- Structs -----

	public struct OwnerCap has key, store {
		id: UID,
	}

	public struct OwnerPermission {}

	public struct OwnerTransfer has key, store {
		id: UID,
		old_owner: address,
		new_owner: address,
		cap: OwnerCap,
	}

	// ----- Constructors -----

	// TODO: Upgrade cap to store
	public fun new(
		_deploy: &DeployCap,
		ctx: &mut TxContext,
	): OwnerCap {
		OwnerCap {
			id: object::new(ctx)
		}
	}

	// ----- Methods -----

	public fun get_permission(
		_self: &OwnerCap,
	): OwnerPermission {
		OwnerPermission {}
	}

	public fun start_transfer(
		self: OwnerCap,
		new_owner: address,
		ctx: &mut TxContext,
	) {
		transfer::share_object(
			OwnerTransfer {
				id: object::new(ctx),
				old_owner: ctx.sender(),
				new_owner,
				cap: self,
			}
		);
	}

	public fun cancel_transfer(
		self: OwnerTransfer,
		ctx: &TxContext,
	) {
		let OwnerTransfer { id, cap, old_owner, .. } = self;
		assert!(old_owner == ctx.sender());
		transfer::transfer(cap, old_owner);
		id.delete();
	}

	public fun complete_transfer(
		self: OwnerTransfer,
		ctx: &TxContext,
	) {
		let OwnerTransfer { id, cap, new_owner, .. } = self;
		assert!(new_owner == ctx.sender());
		transfer::transfer(cap, new_owner);
		id.delete();
	}
}
