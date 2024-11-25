module tbrv3::tbrv3 {
	// ----- Imports -----

	use xlabs::deploy::Self;

	// ----- Structs -----

	public struct TBRV3 has drop {}

	// ----- Methods -----

	// Usage:
	// Call init to get back the DeployCap<TBRV3> object.
	// Then call xlabs::owner::new with the corresponding package's upgrade cap to get back the OwnerCap<TBRV3> object.
	// Posession of the OwnerCap<TBRV3> object signifies ownership of the TBRV3 contract.
	fun init(
		otw: TBRV3,
		ctx: &mut TxContext,
	) {
		transfer::public_transfer(
			deploy::new(otw, ctx),
			ctx.sender(),
		);
	}
}
