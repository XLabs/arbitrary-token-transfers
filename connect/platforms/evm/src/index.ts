import { registerProtocol } from '@wormhole-foundation/sdk-definitions';
import { _platform } from '@wormhole-foundation/sdk-evm';
import { AutomaticTokenBridgeV3EVM } from './automatic.js';

registerProtocol(_platform, 'AutomaticTokenBridgeV3', AutomaticTokenBridgeV3EVM);
