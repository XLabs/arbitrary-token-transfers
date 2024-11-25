module tbrv3::admin {
	// ----- Imports -----

	use tbrv3::tbrv3::TBRV3;

	use xlabs::owner::OwnerCap;

	// ----- Structs -----

	public struct AdminCap has key, store {
		id: UID,
		admin: address,
	}

	public struct AdminPermission has drop {}

	// ----- Constructors -----

	// Create a new admin cap from the owner cap.
	public fun new(
		_perm: &OwnerCap<TBRV3>,
		admin: address,
		ctx: &mut TxContext,
	) {
		transfer::share_object(
			AdminCap {
				id: object::new(ctx),
				admin,
			},
		);
	}

	// ----- Methods -----

	// Validate that the sender is the admin in the cap.
	public fun get_permission(
		self: &AdminCap,
		ctx: &TxContext,
	): AdminPermission {
		assert!(self.admin == ctx.sender());
		AdminPermission {}
	}

	// Revokes the admin cap using another admin's permission.
	public fun revoke(
		self: AdminCap,
		_perm: &AdminPermission,
	) {
		let AdminCap { id, .. } = self;
		id.delete();
	}
}
