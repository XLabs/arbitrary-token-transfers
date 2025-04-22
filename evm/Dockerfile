FROM ghcr.io/foundry-rs/foundry:v1.0.0@sha256:d12a373ec950de170d5461014ef9320ba0fb6e0db6f87835999d0fcf3820370e AS builder

# Foundry image runs as foundry user by default
# We need root to both run apt and to write files to the filesystem
USER root
RUN apt update && apt install -y jq wget

# Preflight 

WORKDIR /app
COPY evm/foundry.toml evm/foundry.toml
COPY --link lib lib
COPY --link evm/lib evm/lib
COPY --link evm/src evm/src

# Prepare compiler input.

RUN export FOUNDRY_PROFILE=prod; cd evm; \
    forge verify-contract --show-standard-json-input 0x0000000000000000000000000000000000000000 src/Tbr.sol:Tbr > Tbr.input.json

# Get compiler according to forge configuration (foundry.toml specified)

RUN SOLC_VERSION=$(cd evm; forge config | grep "^solc =" | sed 's/solc = //' | sed 's/"//g'); \
    if [ -z $SOLC_VERSION ]; then echo "SOLC_VERSION not set"; exit 1; fi; \
    wget --output-document=evm/solc https://github.com/ethereum/solidity/releases/download/v$SOLC_VERSION/solc-static-linux && chmod +x evm/solc

# Compile contract(s). NOTE: jq must be pre-applied to "clean" the output from forge
# otherwise solc aborts with duplicated key/newline problems.

RUN cd evm; \
    cat Tbr.input.json | jq > Tbr.input.tmp.json; \
    mv Tbr.input.tmp.json Tbr.input.json; \
    ./solc --standard-json Tbr.input.json > Tbr.output.json && \
    SOLC_ERR=$(jq '.errors[]? | select(.severity == "error")' Tbr.output.json) && \
    if [ ! -z "$SOLC_ERR" ]; then \
        echo "Error detected during solc execution."; \
        echo $SOLC_ERR; \
        exit 2; \
    fi

# Generate Typechain bindings
  
# Consolidate all generated output
FROM scratch AS foundry-export     
COPY --from=builder /app/evm/*.input.json /app/evm/*.output.json ./
