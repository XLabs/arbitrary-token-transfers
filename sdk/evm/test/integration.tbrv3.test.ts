import { expect } from "chai";
import { before } from "mocha";
import { SupportedChains, TbrPartialTx, Tbrv3, BaseRelayingParams, RelayingFee, relayingFeesReturnLayout, baseRelayingConfigReturnLayout } from "../tbrv3/index.js";
import { ethers } from "ethers";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { encoding, LayoutToType } from "@wormhole-foundation/sdk-base";
import config from "../../../deployment/config/localnet/contracts.json" with { type: "json" };
import { EvmAddress } from "@wormhole-foundation/sdk-evm";

const timeout = 20_000;
const env = process.env.ENV || "localnet";
const ownerPk = process.env.WALLET_KEY;
const rpc = {
  localnet: "http://localhost:8545",
}[env];
let tbrv3: Tbrv3;
let signer: ethers.Signer;

// Type tests
// Variables with names starting with `expected` should typecheck. Their type is the desired type.
// They're put into standalone statements so that they're not reported by linters.

let testRelayingFeeType: RelayingFee = {} as any;
const expectedRelayingFeeType: LayoutToType<typeof relayingFeesReturnLayout> = testRelayingFeeType;
expectedRelayingFeeType;

let testBaseRelayingParamsType: BaseRelayingParams = {} as any;
const expectedBaseRelayingParamsType: LayoutToType<typeof baseRelayingConfigReturnLayout> = testBaseRelayingParamsType;
expectedBaseRelayingParamsType;


const peers = [
  { chain: "Sepolia", peer: new UniversalAddress(ethers.Wallet.createRandom().address) },
  { chain: "BaseSepolia", peer: new UniversalAddress(ethers.Wallet.createRandom().address) },
  { chain: "Solana", peer: new UniversalAddress(ethers.Wallet.createRandom().address) },
] as const;

describe('TbrV3 SDK Integration test', () => {

  before(async () => {
    expect(rpc).to.not.be.undefined;
    expect(ownerPk).to.not.be.undefined;

    const address = new EvmAddress(config.TbrV3Proxies[0].address);
    const provider = new ethers.JsonRpcProvider(rpc);
    tbrv3 = Tbrv3.connect(provider, "Testnet", "Sepolia", address);
    signer = new ethers.Wallet(ownerPk!, tbrv3.provider);
  });

  // governance commands
  it.skip("should set peers", async () => { // skipped as it requires TB to be present
    const expectedPeers = peers.map(p => ({ chain: p.chain, peer: p.peer }));
    const addPeersPartialTx = tbrv3.addPeers(expectedPeers);

    const result = await awaitTx(addPeersPartialTx);
    expect(result!.status).to.equal(1);

    const isPeer = await tbrv3.isPeer(expectedPeers[0].chain, expectedPeers[0].peer);
    expect(isPeer).to.be.true;
  }).timeout(timeout);

  it.skip("should update canonical peer", async () => {  // skipped as it requires TB to be present
    const map: Map<SupportedChains, UniversalAddress> = new Map(peers.map(p => [p.chain, p.peer]));
    const updateCanonicalPeerPartialTx = tbrv3.updateCanonicalPeers(map);

    const result = await awaitTx(updateCanonicalPeerPartialTx);

    expect(result).to.not.be.undefined;
    expect(result!.status).to.equal(1);

    const canonicalPeer = await tbrv3.canonicalPeer(peers[0].chain);
    expect(canonicalPeer).to.be.equal(peers[0].peer);
  }).timeout(timeout);

  it("should update max gas dropoffs", async () => {
    const expectedMaxGasDropoff = Math.round(Math.random() * 1000);
    const map = new Map(peers.map(p => [p.chain, expectedMaxGasDropoff]));
    const updateCanonicalPeerPartialTx = tbrv3.updateMaxGasDroppoffs(map);

    const result = await awaitTx(updateCanonicalPeerPartialTx);

    expect(result!.status).to.equal(1);

    const maxGasDropoff = await tbrv3.maxGasDropoff(peers[0].chain);
    expect(maxGasDropoff).to.be.equal(expectedMaxGasDropoff);
  }).timeout(timeout);

  it("should update relay fee", async () => {
    const expectedFee = Math.round(Math.random() * 1000);
    const udpatedRelayerFeePartialTx = tbrv3.updateRelayFees(new Map(peers.map(p => [p.chain, expectedFee])));

    const result = await awaitTx(udpatedRelayerFeePartialTx);

    expect(result!.status).to.equal(1);

    const fee = await tbrv3.relayFee(peers[0].chain);
    expect(fee).to.equal(expectedFee);
  }).timeout(timeout);

  it("should add admin", async () => {
    const evmAddress = new EvmAddress("0x00002000004000000f000000e00a000b000c000d");
    const modifyAdminPartialTx = tbrv3.addAdmin(evmAddress);

    const result = await awaitTx(modifyAdminPartialTx);

    expect(result!.status).to.equal(1);

    const isAdmin = await tbrv3.isAdmin(evmAddress);
    expect(isAdmin).to.equal(true);
  }).timeout(timeout);

  // This test relies on the fact that we're not snapshotting state of the contracts.
  it("should remove admin", async () => {
    const evmAddress = new EvmAddress("0x00002000004000000f000000e00a000b000c000d");
    const modifyAdminPartialTx = tbrv3.revokeAdmin(evmAddress);

    const result = await awaitTx(modifyAdminPartialTx);

    expect(result!.status).to.equal(1);

    const isAdmin = await tbrv3.isAdmin(evmAddress);
    expect(isAdmin).to.equal(false);
  }).timeout(timeout)

  // governance queries

  it("should obtain owner", async () => {
    const owner = await tbrv3.owner();
    expect(owner).to.equal(await signer.getAddress());
  }).timeout(timeout);

  // relaying queries

  it("should obtain relaying fee", async () => {
    const estimate = {
      tokens: [new EvmAddress("0x000000000000000000000000000000000000000a")],
      transferRequests: [{ targetChain: "Sepolia", gasDropoff: 1 }],
    } as const;
    const relayingFee = await tbrv3.relayingFee(estimate);
    expect(relayingFee).to.not.be.undefined;
  }).timeout(timeout);

  it("should obtain base relaying params", async () => {
    const baseRelayingParams = await tbrv3.baseRelayingParams("Sepolia");
    expect(baseRelayingParams).to.not.be.undefined;
  }).timeout(timeout);

  it("should tell if chain is supported", async () => {
    const isSupported = await tbrv3.isChainSupported("Sepolia");
    expect(isSupported).to.be.false; // adding canonical peers is skipped
  });

});

const awaitTx = async (partialTx: TbrPartialTx) => {
  try {
    const tx = await signer.sendTransaction({ ...partialTx, data: encoding.hex.encode(partialTx.data, true) });
    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error(error);
    throw error;
  }
}