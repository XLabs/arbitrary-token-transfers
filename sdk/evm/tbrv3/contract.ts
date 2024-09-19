import { chainToPlatform, FixedLengthArray, Layout, layout, LayoutItem, LayoutToType, Network, ProperLayout } from "@wormhole-foundation/sdk-base";
import { layoutItems, serialize, toNative, UniversalAddress, VAA } from "@wormhole-foundation/sdk-definitions";
import { EvmAddress } from "@wormhole-foundation/sdk-evm";
import { ethers } from "ethers";
import {
  baseRelayingConfigReturnLayout,
  commandCategoryLayout,
  evmAddressItem,
  execParamsLayout,
  gasDropoffItem,
  GovernanceCommand,
  GovernanceQuery,
  proxyConstructorLayout,
  queryCategoryLayout,
  queryParamsLayout,
  relayingFeesInputLayout,
  relayingFeesReturnLayout,
  SupportedChains,
  TBRv3Message,
  transferGasTokenWithRelayLayout,
  transferTokenWithRelayLayout,
  RelayingFee,
  RelayingFeesReturn,
  BaseRelayingParamsReturn,
} from "./layouts.js";

const WHOLE_EVM_GAS_TOKEN_UNITS = 10 ** 18;


type FixedArray<T extends Layout> = {
    binary: "array",
    length: number,
    layout: T,
};

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

export interface TbrPartialTx {
  /**
   * Amount of native token that should be attached to the transaction.
   * Denominated in wei.
   */
  value: bigint;
  /**
   * Calldata of the transaction.
   */
  data: Uint8Array;
  /**
   * Address of the Token Brigde Relayer contract that must be called.
   */
  to: string;
}


export type RelayingFeesInput = LayoutToType<typeof relayingFeesInputLayout>;
export type TransferTokenWithRelayInput = LayoutToType<typeof transferTokenWithRelayLayout> & {readonly method: "TransferTokenWithRelay";};
export type TransferGasTokenWithRelayInput = LayoutToType<typeof transferGasTokenWithRelayLayout> & {readonly method: "TransferGasTokenWithRelay";};
export type NetworkMain = Exclude<Network, "Devnet">;

interface ConnectionPrimitives/*<T>*/ {
  /**
   * Performs an `eth_call` JSON-RPC request with the given tx parameters.
   * @return Raw undecoded array of bytes of the EVM return value.
   */
  readonly ethCall: (partialTx: TbrPartialTx) => Promise<Uint8Array>;
  /**
   * Signs and sends a tx to the network based on the given tx parameters.
   * @todo do we really need this?
   */
  // readonly sendTx: (partialTx: TbrPartialTx) => Promise<T>;
}

const executeFunction = "exec768";
const queryFunction = "get1959";
type DispatcherFunction = typeof executeFunction | typeof queryFunction;

export interface Transfer {
  /**
   * Fee estimation obtained by calling `relayingFee`.
   * The transaction will encode a max fee based on `feeEstimation.fee`.
   * If you want to overestimate the fee, you should increase it with a multiplier of some kind.
   * Increasing this estimation won't affect the actual cost.
   * Excedent gas tokens will be returned to the caller of the contract.
   */
  feeEstimation: RelayingFee;
  args: TransferTokenWithRelayInput | TransferGasTokenWithRelayInput;
};

export class Tbrv3 {

  readonly address: string;

  constructor(public readonly provider: ethers.Provider, public readonly network: NetworkMain, address: string = Tbrv3.addresses[network]) {
    this.address = address;
  }

  static readonly addresses: Record<NetworkMain, string> = {
    Mainnet: "TBD",
    Testnet: "TBD",
  }

  transferWithRelay(...transfers: Transfer[]): TbrPartialTx {
    if (transfers.length === 0) {
      throw new Error("At least one transfer should be specified.");
    }

    // TODO: decide if we want to check that requested gas dropoff doesn't exceed max gas dropoff per transfer
    // Here we need to batch `this.baseRelayingParams` per target chain together with the relaying fee per transfer

    let value: bigint = 0n;
    const methodCalls = [];
    for (const [i, transfer] of transfers.entries()) {
      if (transfer.feeEstimation.isPaused) {
        throw new Error(`Relays to chain ${transfer.args.recipient.chain} are paused. Found in transfer ${i + 1}.`);
      }
      // We are asking for a transfer on an EVM chain, so the gas token used to pay has 18 decimals.
      // Here we need to calculate the amount in wei.
      value += BigInt(transfer.feeEstimation.fee * WHOLE_EVM_GAS_TOKEN_UNITS);

      if (transfer.args.method === "TransferGasTokenWithRelay") {
        value += transfer.args.inputAmountInAtomic;
      }

      methodCalls.push(transfer.args);
    }

    const methods = layout.serializeLayout(execParamsLayout, {
      version: 0,
      commandCategories: methodCalls.map((call): LayoutToType<typeof commandCategoryLayout> => {
        return call.method === 'TransferTokenWithRelay'
          ? { commandCategory: 'TransferTokenWithRelay', ...call }
          : { commandCategory: 'TransferGasTokenWithRelay', ...call };
      })
    });
    const data = Tbrv3.encodeExecute(methods);

    return {
      to: this.address,
      data,
      value,
    };
  }

  completeTransfer(vaas: VAA<"TokenBridge:TransferWithPayload">[]): TbrPartialTx {
    if (vaas.length === 0) {
      throw new Error("At least one TB VAA should be specified.");
    }

    if (vaas.some(({payload}) => {
      const destinationAddress = payload.to.address.toNative(payload.to.chain);
      // TODO: actually check that this is part of the supported EVM chains
      return chainToPlatform(payload.to.chain) !== "Evm" || !destinationAddress.equals(toNative("Ethereum", this.address));
    })) {
      // TODO: point out which one; do a search instead.
      throw new Error("At least one of the VAAs points to an unexpected contract.");
    }

    let value: bigint = 0n;
    for (const vaa of vaas) {
      const tbrv3Message = layout.deserializeLayout(TBRv3Message, vaa.payload.payload);
      // We are redeeming on an EVM chain so the gas token has 18 decimals.
      // Here we need to calculate the amount in wei.
      value += BigInt(tbrv3Message.gasDropoff * WHOLE_EVM_GAS_TOKEN_UNITS);
    }

    const methods = layout.serializeLayout(execParamsLayout, {
      version: 0,
      commandCategories: vaas.map((vaa) => ({
        commandCategory: "CompleteTransfer",
        vaa: serialize(vaa)
      }) satisfies LayoutToType<typeof commandCategoryLayout>)
    });

    const data = Tbrv3.encodeExecute(methods);

    return {
      to: this.address,
      data,
      value,
    }
  }

  /**
   * Queries TBR contract on the relaying fees needed.
   * Many relays can be quoted at once.
   * Each relay needs to be passed in as a separate argument.
   * The result is a list of quotes for the relays in the same order as they were passed in.
   */
  async relayingFee(...args: RelayingFeesInput[]): Promise<RelayingFeesReturn> {
    if (args.length === 0) {
      throw new Error("At least one relay fee query should be specified.");
    }

    const queries = layout.serializeLayout(queryParamsLayout, {
      version: 0,
      queryCategories:
        args.map(arg => ({
          queryCategory: "RelayFee",
          targetChain: arg.targetChain,
          gasDropoff: arg.gasDropoff,
        }) satisfies LayoutToType<typeof queryCategoryLayout>)
    });

    const calldata = Tbrv3.encodeQuery(queries);
    const result = await this.provider.call({
      data: ethers.hexlify(calldata),
      to: this.address,
    });

    const relayingFeesReturnListLayout = fixedLengthArrayLayout(args.length, relayingFeesReturnLayout);
    return decodeQueryResponseLayout(relayingFeesReturnListLayout, ethers.getBytes(result));
  }

  async baseRelayingParams(...chains: SupportedChains[]): Promise<BaseRelayingParamsReturn> {
    const queries = layout.serializeLayout(queryParamsLayout, {
      version: 0,
      queryCategories: chains.map((targetChain) => ({
        queryCategory: "BaseRelayingConfig",
        targetChain,
      }) satisfies LayoutToType<typeof queryCategoryLayout>)
    });

    const calldata = Tbrv3.encodeQuery(queries);
    const result = await this.provider.call({
      data: ethers.hexlify(calldata),
      to: this.address,
    });

    const baseRelayingReturnListLayout = fixedLengthArrayLayout(chains.length, baseRelayingConfigReturnLayout);
    return decodeQueryResponseLayout(baseRelayingReturnListLayout, ethers.getBytes(result));
  }

  governanceTx<const C extends GovernanceCommand[]>(commands: C): TbrPartialTx {
    const methods = layout.serializeLayout(execParamsLayout, {
      version: 0,
      commandCategories: commands.map(arg => ({
        commandCategory: 'GovernanceCommands',
        commands
      }) satisfies LayoutToType<typeof commandCategoryLayout>),
    })
    const data = Tbrv3.encodeExecute(methods);

    return {
      to: this.address,
      data,
      value: 0n,
    };
  }

  updateMaxGasDroppoffs(dropoffs: Map<SupportedChains, number>): TbrPartialTx {
    return this.governanceTx(Array.from(dropoffs).map(
      ([chain, maxDropoff]) => ({ command: "UpdateMaxGasDropoff", value: maxDropoff, chain: chain as SupportedChains })
    ));
  }

  updateRelayFee(chain: SupportedChains, fee: number): TbrPartialTx {
    return this.governanceTx([{ command: "UpdateBaseFee", chain, value: fee }]);
  }

  updateAdmin(authorized: boolean, admin: EvmAddress): TbrPartialTx {
    return this.governanceTx([{ command: "UpdateAdmin", address: admin.toString(), isAdmin: authorized }]);
  }

  updateCanonicalPeers(canonicalPeers: Map<SupportedChains, UniversalAddress>): TbrPartialTx {
    return this.governanceTx(Array.from(canonicalPeers).map(
      ([chain, peer]) => ({ command: "UpdateCanonicalPeer", address: peer, chain: chain as SupportedChains })
    ));
  }

  upgradeContract(newImplementationAddress: EvmAddress): TbrPartialTx {
    return this.governanceTx([{command: "UpgradeContract", address: newImplementationAddress.toString() }]);
  }

  addPeers(peers: { chain: SupportedChains, peer: UniversalAddress }[]): TbrPartialTx {
    return this.governanceTx(peers.map(
      (peer) => ({command: "AddPeer", address: peer.peer, chain: peer.chain })
    ));
  }

  async governanceQuery<const C extends GovernanceQuery[]>(queries: C): Promise<string> {
    // const methods = Tbrv3.createEnvelope([{ method: "GovernanceQuery", queries }]);
    const methods = layout.serializeLayout(queryParamsLayout, {
      version: 0,
      queryCategories:
        queries.map(arg => ({
          queryCategory: "GovernanceQueries",
          queries
        }) satisfies LayoutToType<typeof queryCategoryLayout>)
    });
    const data = Tbrv3.encodeQuery(methods);

    const result = await this.provider.call({
      data: ethers.hexlify(data),
      to: this.address,
    });

    return result;
  }


  async relayFee(chain: SupportedChains) {
    const result = await this.governanceQuery([{ query: "BaseFee", chain }]);
    
    return decodeQueryResponseLayout(relayingFeesReturnLayout, ethers.getBytes(result)); 
  }

  /**
   * @returns Maximum gas dropoff in gas token units, e.g. ETH for Ethereum.
   */
  async maxGasDropoff(chain: SupportedChains) {
    const result = await this.governanceQuery([{ query: "MaxGasDropoff", chain }]);

    return decodeQueryResponseLayout(gasDropoffItem, ethers.getBytes(result));
  }

  async isChainPaused(chain: SupportedChains) {
    const result = await this.governanceQuery([{ query: "IsChainPaused", chain }]);

    return decodeQueryResponseLayout(layoutItems.boolItem, ethers.getBytes(result));
  }

  async isPeer(chain: SupportedChains, address: UniversalAddress): Promise<boolean> {
    const result = await this.governanceQuery([{ query: "IsPeer", address, chain }]);

    return decodeQueryResponseLayout(layoutItems.boolItem, ethers.getBytes(result));
  }

  async isTxSizeSensitive(chain: SupportedChains) {
    const result = await this.governanceQuery([{ query: "IsTxSizeSensitive", chain }]);

    return decodeQueryResponseLayout(layoutItems.boolItem, ethers.getBytes(result));
  }

  async canonicalPeer(chain: SupportedChains): Promise<UniversalAddress> {
    const result = await this.governanceQuery([{ query: "CanonicalPeer", chain }]);

    return decodeQueryResponseLayout(layoutItems.universalAddressItem, ethers.getBytes(result));
  }

  async owner() {
    const result = await this.governanceQuery([{ query: "Owner" }]);
    
    return decodeQueryResponseLayout(evmAddressItem, ethers.getBytes(result)); 
  }

  async isChainSupported(chain: SupportedChains): Promise<boolean> {
    const result = await this.governanceQuery([{ query: "IsChainSupported", chain }]);

    return decodeQueryResponseLayout(layoutItems.boolItem, ethers.getBytes(result));
  }

  async isAdmin(address: EvmAddress): Promise<boolean> {
    const result = await this.governanceQuery([{ query: "IsAdmin", address: address.toString() }]);
    
    return decodeQueryResponseLayout(layoutItems.boolItem, ethers.getBytes(result)); 
  }

  async feeRecipient() {
    const result = await this.governanceQuery([{ query: "FeeRecipient" }]);
    
    return decodeQueryResponseLayout(evmAddressItem, ethers.getBytes(result)); 
  }

  static encodeExecute(methods: Uint8Array): Uint8Array {
    return this.encodeForDispatcher(executeFunction, methods);
  }

  static encodeQuery(methods: Uint8Array): Uint8Array {
    return this.encodeForDispatcher(queryFunction, methods);
  }

  static encodeForDispatcher(fn: DispatcherFunction, methods: Uint8Array): Uint8Array {
    const Tbrv3Contract = getTbrv3Class();
    const contract = new Tbrv3Contract("0x0000000000000000000000000000000000000000");
    const fnFragment = contract.interface.getFunction(fn);
    if (fnFragment === null) throw new Error(`${fn} function not found in TBRv3 ABI.`);
    const selector = ethers.getBytes(fnFragment.selector);

    const result = new Uint8Array(selector.length + methods.length);
    result.set(selector, 0);
    result.set(methods, selector.length);

    return result;
  }

  /**
   * Creates the initialization configuration for the TBRv3 proxy contract.
   * 
   * @param owner contract owner address, it must be a valid hex evm address
   * @param admin admin address, it must be a valid hex evm address.
   * @param feeRecipient fee recipient address, it must be a valid hex evm address.
   * @returns The serialized layout of the initialization configuration.
   */
  static proxyConstructor(
    owner: string,
    admin: string,
    feeRecipient: string,
  ) {
    const initConfig = {
      owner,
      admin,
      feeRecipient,
    };

    return layout.serializeLayout(proxyConstructorLayout, initConfig);
  }

  static fromRpcUrl(rpc: string, network: NetworkMain, address?: string): Tbrv3 {
    return new Tbrv3(new ethers.JsonRpcProvider(rpc), network, address);
  }

}

function fixedLengthArrayLayout<const T extends ProperLayout>(length: number, layout: T): FixedArray<T> {
  return {
    binary: "array",
    length,
    layout,
  } as const satisfies FixedLengthArray;
}

function decodeQueryResponseLayout<const T extends Layout>(tbrLayout: T, value: Uint8Array) {
  const responseHeaderLayout = {
    binary: "bytes",
    layout: [
      // ptr must always point to the next "slot", i.e. 0x20
      { name: "ptr", binary: "uint", size: 32, custom: 32n, omit: true },
      // if the response claims to be longer than 2^32 bytes, something is wrong
      { name: "mustBeZero", binary: "uint", size: 28, custom: 0n, omit: true },
      // the actual length of the response
      { name: "length", binary: "uint", size: 4 },
    ] as const,
  } as const satisfies LayoutItem;

  const [header, offset] = layout.deserializeLayout(responseHeaderLayout, value, {consumeAll: false});
  // TODO: do we want to perform any check on the length?
  const [response, offsetPadding] = layout.deserializeLayout(tbrLayout, value, {offset, consumeAll: false});
  for (let i = offsetPadding; i < value.length; ++i) {
    if (value[i] !== 0) throw new Error(`Found nonzero byte at padding. Buffer: ${value.toString()}`);
  }
  return response;
}

