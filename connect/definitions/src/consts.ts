import { constMap } from '@wormhole-foundation/sdk-base';
import { tbrV3Contracts, addresses } from "@xlabs-xyz/common-arbitrary-token-transfer";

export const tokenBridgeRelayerV3Contracts = tbrV3Contracts;
export const tokenBridgeRelayerV3Chains = constMap(addresses, [0, 1]);
