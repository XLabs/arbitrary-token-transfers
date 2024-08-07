import { Chain, CustomConversion, Layout, LayoutToType, ManualSizePureBytes, NamedLayoutItem, UintLayoutItem } from "@wormhole-foundation/sdk-base";
import { layoutItems } from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";


const supportedChains = ["Ethereum", "Solana" ] as const satisfies readonly Chain[];
const supportedChainItem = layoutItems.chainItem({allowedChains: supportedChains});

const recipientLayout = [
  { name: "address", ...layoutItems.universalAddressItem },
  { name: "chain", ...supportedChainItem },
] as const satisfies Layout;

const evmAddressItem = {
  binary: "bytes",
  size: 20,
  custom: {
    to: (encoded: Uint8Array): string => new EvmAddress(encoded).toString(),
    from: (addr: string): Uint8Array => new EvmAddress(addr).toUint8Array(),
  } satisfies CustomConversion<Uint8Array, string>,
} as const satisfies ManualSizePureBytes;

const acquireModeItem = {
  name: "acquireMode",
  binary: "switch",
  idSize: 1,
  idTag: "mode",
  layouts: [
    [[0, "Preapproved"], []],
    [[1, "Permit"], [
      { name: "value",       binary: "uint",  size: 32 },
      { name: "deadline",    binary: "uint",  size: 32 },
      { name: "signature",   binary: "bytes", size: 65 },
    ]],
    [[2, "Permit2Transfer"], [
      { name: "amount",      binary: "uint",  size: 32 },
      { name: "nonce",       binary: "uint",  size: 32 },
      { name: "sigDeadline", binary: "uint",  size: 32 },
      { name: "signature",   binary: "bytes", size: 65 },
    ]],
    [[3, "Permit2Permit"], [
      { name: "amount",      binary: "uint",  size: 20 },
      { name: "expiration",  binary: "uint",  size:  6 },
      { name: "nonce",       binary: "uint",  size:  6 },
      { name: "sigDeadline", binary: "uint",  size: 32 },
      { name: "signature",   binary: "bytes", size: 65 },
    ]],
  ]
} as const satisfies NamedLayoutItem;

/**
 * @dev Must match the constant defined in GasDropoff.sol!
 */
const gasDropoffUnit = BigInt(1e12);
const gasDropoffItem = {
  binary: "uint",
  size: 4,
  custom: {
    to: (encoded: number): bigint => BigInt(encoded) * gasDropoffUnit,
    from: (dropoff: bigint): number => Number(dropoff / gasDropoffUnit),
  } as const satisfies CustomConversion<number, bigint>,
} as const satisfies UintLayoutItem;

const transferTokensWithRelayLayout = [
  { name: "recipient", binary: "bytes", layout: recipientLayout },
  { name: "inputToken", ...evmAddressItem },
  { name: "inputAmount", ...layoutItems.amountItem },
  acquireModeItem,
  { name: "gasDropoff", ...gasDropoffItem },
  { name: "maxFee", ...layoutItems.amountItem },
] as const satisfies Layout;

const wrapAndTransferEthWithRelayLayout = [
  { name: "recipient", binary: "bytes", layout: recipientLayout },
  // msg.value - inputAmount = maxFee(*)
  { name: "inputAmount", ...layoutItems.amountItem },
  { name: "gasDropoff", ...gasDropoffItem },
] as const satisfies Layout;

const dispatcherLayout = {
  name: "dispatcher",
  binary: "switch",
  idSize: 1,
  idTag: "method",
  layouts: [
    //active user methods
    [[0, "TransferTokensWithRelay"], transferTokensWithRelayLayout],
    [[1, "WrapAndTransferEthWithRelay" ], wrapAndTransferEthWithRelayLayout],
    [[2, "Complete"], [{ name: "vaa", binary: "bytes" }]],
    //TODO governance methods
  ]
} as const satisfies NamedLayoutItem;

const relayingFeesLayout = [
  { name: "targetChain", ...supportedChainItem },
  { name: "gasDropoff", ...gasDropoffItem },
] as const satisfies Layout;

interface RelayingFeesReturn {
  isPaused: boolean;
  gasFee: bigint;
}

const maxGasDropoffLayout = { name: "targetChain", ...supportedChainItem } as const satisfies NamedLayoutItem;
interface BaseRelayingParamsReturn {
  maxGasDropoff: bigint;
  baseFee: bigint;
}

const TBRv3Message = [
  { name: "recipient", ...layoutItems.universalAddressItem },
  { name: "gasDropoff", ...gasDropoffItem },
] as const satisfies Layout;

function transferTokensWithRelay(...args: LayoutToType<typeof transferTokensWithRelayLayout>[]): void {}
function wrapAndTransferEthWithRelay(...args: LayoutToType<typeof wrapAndTransferEthWithRelayLayout>[]): void {}
function complete(vaa: Uint8Array): void {}
function relayingFee(...args: LayoutToType<typeof relayingFeesLayout>[]): RelayingFeesReturn { return undefined as unknown as RelayingFeesReturn }
function baseRelayingParams(chain: typeof supportedChains[number]): BaseRelayingParamsReturn { return undefined as unknown as BaseRelayingParamsReturn }
