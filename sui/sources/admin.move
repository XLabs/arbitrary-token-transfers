module tbrv3::admin {
	// ----- Imports -----

	use tbrv3::owner::OwnerPermission;

	// ----- Structs -----

	public struct AdminCap has key, store {
		id: UID,
		admin: Option<address>,
	}

	public struct AdminPermission {}

	// ----- Constructors -----

	// Create a new admin cap from the owner cap.
	public fun new(
		_perm: &OwnerPermission,
		admin: address,
		ctx: &mut TxContext,
	) {
		transfer::share_object(
			AdminCap {
				id: object::new(ctx),
				admin: option::some(admin),
			},
		);
	}

	// ----- Methods -----

	// Validate that the sender is the admin in the cap.
	public fun get_permission(
		self: &AdminCap,
		ctx: &TxContext,
	): AdminPermission {
		assert!(self.admin.borrow() == ctx.sender());
		AdminPermission {}
	}

	// Revokes the admin cap using another admin's permission.
	public fun revoke(
		self: &mut AdminCap,
		_perm: &AdminPermission,
	) {
		self.admin = option::none();
	}
}
