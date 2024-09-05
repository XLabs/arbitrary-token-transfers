import { registerProtocol } from "@wormhole-foundation/sdk-definitions";
import { AutomaticTokenBridgeV3EVM } from "./automatic.js";

registerProtocol('Evm', 'AutomaticTokenBridgeV3', AutomaticTokenBridgeV3EVM);
