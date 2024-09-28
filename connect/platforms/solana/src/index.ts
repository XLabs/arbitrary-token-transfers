import { registerProtocol } from '@wormhole-foundation/sdk-definitions';
import { _platform } from '@wormhole-foundation/sdk-solana';
import { AutomaticTokenBridgeV3Solana } from './automatic.js';

registerProtocol(_platform, 'AutomaticTokenBridgeV3', AutomaticTokenBridgeV3Solana);
