#!/bin/bash

# Bailout if $ENV is not defined
if [ -z "$ENV" ]; then
  echo "Please set the ENV variable to specify the environment (e.g., dev, prod)."
  exit 1
fi
# Bailout if $1 is not defined
if [ -z "$1" ]; then
  echo "Please provide the address to query."
  exit 1
fi
# Bailout if $2 is not defined
if [ -z "$2" ]; then
  echo "Please provide the path to the config directory"
  exit 1
fi

# Path to the JSON file
JSON_FILE="$2/$ENV/ecosystem.json"

# Iterate over each chain in the JSON file
jq -c '.evm.networks[]' "$JSON_FILE" | while read -r chain; do
  # Extract the rpc URL and chain name
  URL=$(echo "$chain" | jq -r '.rpc')
  NAME=$(echo "$chain" | jq -r '.name')

  # Execute the cast balance command
  echo "Checking balance for chain: $NAME"
  cast balance "$1" --ether --rpc-url "$URL"
done