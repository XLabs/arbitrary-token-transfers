
.PHONY: all
all: tbrv3/idl/token_bridge_relayer.ts tbrv3/idl/token_bridge_relayer.json tbrv3/network/network.json tbrv3/network/test-program-keypair.json

tbrv3/idl/token_bridge_relayer.ts: ../../target/types/token_bridge_relayer.ts
	cp $< $@

tbrv3/idl/token_bridge_relayer.json: ../../target/idl/token_bridge_relayer.json
	cp $< $@

tbrv3/network/network.json: ../../solana/programs/token-bridge-relayer/network.json
	cp $< $@

tbrv3/network/test-program-keypair.json: ../../solana/programs/token-bridge-relayer/test-program-keypair.json
	cp $< $@
