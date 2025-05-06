
.PHONY: all
all: localnet/contracts.json

localnet/contracts.json: ../../../deployment/config/localnet/contracts.json
	mkdir -p localnet
	cp $< $@
