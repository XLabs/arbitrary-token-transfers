import { Chain, CustomConversion, layout, Layout, LayoutToType, ManualSizePureBytes, NamedLayoutItem, Network, UintLayoutItem } from "@wormhole-foundation/sdk-base";
import { layoutItems, toUniversal } from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import { ethers } from "ethers";

/**
 * Gives you a type that keeps the properties of `T1` while making both properties common to `T1` and `T2` and properties exclusive to `T2` optional.
 * This is the intersection of these three:
 * T1 ∖ T2
 * Partial(T1 ∖ (T1 ∖ T2))
 * Partial(T2 ∖ T1)
 */
type MakeOptional<T1, T2> = Omit<T1, keyof T2> & Partial<Omit<T1, keyof Omit<T1, keyof T2>>> & Partial<Omit<T2, keyof T1>>;

type Method = LayoutToType<typeof dispatcherLayout>["method"];
type MethodArgs<M extends Method> = Extract<LayoutToType<typeof dispatcherLayout>, { method: M }>;

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
    from: (addr: string | EvmAddress): Uint8Array => EvmAddress.instanceof(addr) ? addr.toUint8Array() : new EvmAddress(addr).toUint8Array(),
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

const relayingFeesLayout = [
  { name: "targetChain", ...supportedChainItem },
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

    // Queries
    [[0x80, "RelayFee"], relayingFeesLayout],
  ]
} as const satisfies NamedLayoutItem;

const versionEnvelopeLayout = {
  name: "versionEnvelope",
  binary: "switch",
  idSize: 1,
  idTag: "version",
  layouts: [
    [[0, "Version0"], [{
      name: "methods",
      binary: "array",
      layout: dispatcherLayout,
    }]],
  ]
} as const satisfies NamedLayoutItem;

interface RelayingFeesReturn {
  isPaused: boolean;
  fee: bigint;
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


// /**
//  * @custom:selector 00000eb6
//  */
// function exec768() external payable returns (bytes memory) {
//   return _exec(msg.data[4:]);
// }

// /**
//  * @custom:selector 0008a112
//  */
// function get1959() external view returns (bytes memory) {
//   return _get(msg.data[4:]);
// }
interface Tbrv3Abi {
  exec768: ethers.BaseContractMethod<[], [ ethers.BytesLike ], ethers.ContractTransactionResponse>;
  get1959: ethers.BaseContractMethod<[], [ ethers.BytesLike ], [ ethers.BytesLike ]>;
}
const tbrv3Abi = [
  "function exec768() returns (bytes memory result)",
  "function get1959() view returns (bytes memory responses)",
  // "event Minted(address target)"
];

type EthersContractClass<T> = ReturnType<typeof ethers.BaseContract.buildClass<T>>;
let Tbrv3Contract: EthersContractClass<Tbrv3Abi>;
function getTbrv3Class() {
  if (Tbrv3Contract === undefined) {
    Tbrv3Contract = ethers.BaseContract.buildClass<Tbrv3Abi>(tbrv3Abi);
  }
  return Tbrv3Contract;
}

interface TbrPartialTx {
  /**
   * Amount of native token that should be attached to the transaction.
   * Denominated in wei.
   * It is recommended that an extra margin is attached to the transaction
   * so that it doesn't fail due to a fee change during tx confirmation.
   * Any excedent will be returned to the calling address.
   */
  value: bigint;
  /**
   * Calldata of the transaction.
   */
  calldata: Uint8Array;
  /**
   * Address of the Token Brigde Relayer contract that must be called.
   */
  to: string;
}

type RelayingFeesInput = LayoutToType<typeof relayingFeesLayout>[];
type NetworkMain = Exclude<Network, "Devnet">;

interface ConnectionPrimitives<T> {
   readonly ethCall: (partialTx: TbrPartialTx) => Promise<Uint8Array>;
   readonly sendTx: (partialTx: TbrPartialTx) => Promise<T>;
}

const executeFunction = "exec768";

class Tbrv3 {

  readonly address: string;

  constructor(public readonly provider: ethers.Provider, public readonly network: NetworkMain){
    this.address = Tbrv3.addresses[network];
  }

  static createEnvelopeWithSingleMethodKind<const M extends "RelayFee" | "Complete">(method: M, args: MakeOptional<MethodArgs<M>, { method: M }>[]): Uint8Array {
    return layout.serializeLayout(versionEnvelopeLayout, {
      version: "Version0",
      methods: args.map((arg) => ({ ...arg, method })),
    });
  }

  static readonly addresses: Record<NetworkMain, string> = {
    Mainnet: "TBD",
    Testnet: "TBD",
  }

  async transferTokensWithRelay(...args: LayoutToType<typeof transferTokensWithRelayLayout>[]): Promise<TbrPartialTx> {
    if (args.length === 0) {
      throw new Error("At least one transfer should be specified.");
    }

    let value = 0n;
    const feeQuery = args.map((transfer) => ({
      targetChain: transfer.recipient.chain,
      gasDropoff: transfer.gasDropoff,
    })) satisfies RelayingFeesInput;

    const fees = await this.relayingFee(...feeQuery);
    for (const [i, fee] of fees.entries()) {
      if (fee.isPaused) {
        throw new Error(`Relays to chain ${feeQuery[i].targetChain} are paused. Found in transfer ${i + 1}.`);
      }
      value += fee.fee;
    }
    const methods = layout.serializeLayout(versionEnvelopeLayout, {
      version: "Version0",
      methods: args.map((arg) => ({ method: "TransferTokensWithRelay" as const, ...arg})),
    });
    const calldata = Tbrv3.encodeExecute(methods);

    return {
      to: this.address,
      calldata,
      value,
    }
  }
  wrapAndTransferEthWithRelay(...args: LayoutToType<typeof wrapAndTransferEthWithRelayLayout>[]): void { throw new Error("not implemented"); }
  completeTransfer(vaa: Uint8Array): void { throw new Error("not implemented"); }
  async relayingFee(...args: RelayingFeesInput): Promise<RelayingFeesReturn[]> {
    const queries = layout.serializeLayout(versionEnvelopeLayout, {
      version: "Version0",
      methods: args.map((arg) => ({ method: "RelayFee" as const, ...arg})),
    });
    const calldata = Tbrv3.encodeQuery(queries);
  }
  async baseRelayingParams(chain: typeof supportedChains[number]): Promise<BaseRelayingParamsReturn> { throw new Error("not implemented"); }

  static encodeExecute(methods: Uint8Array): Uint8Array {
    return this.encodeForDispatcher("exec768", methods);
  }
  static encodeQuery(methods: Uint8Array): Uint8Array {
    return this.encodeForDispatcher("get1959", methods);
  }

  static encodeForDispatcher(fn: "get1959" | "exec768", methods: Uint8Array): Uint8Array {
    const Tbrv3Contract = getTbrv3Class();
    const contract = new Tbrv3Contract("0x0000000000000000000000000000000000000000");
    const execFragment = contract.interface.getFunction(fn);
    if (execFragment === null) throw new Error("Query function not found in TBRv3 ABI.");
    const selector = ethers.getBytes(execFragment.selector);

    const result = new Uint8Array(selector.length + methods.length);
    result.set(selector, 0);
    result.set(methods, selector.length);
    return result;
  }

}

let x: MakeOptional<MethodArgs<"RelayFee">, { method: "RelayFee"}>;
let y: MethodArgs<"Complete">;

(new Tbrv3(undefined as any, "Mainnet")).transferTokensWithRelay({
  acquireMode: {mode: "Preapproved"},
  inputAmount: 1000n,
  gasDropoff: 10n,
  maxFee: 2000n,
  recipient: { chain: "Ethereum", address: toUniversal("Ethereum" ,"0xabababababa")},
  inputToken: "0xabababababa",
});
