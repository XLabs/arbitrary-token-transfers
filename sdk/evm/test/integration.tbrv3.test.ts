import { expect } from "chai";
import { before } from "mocha";
import { SupportedChains, TbrPartialTx, Tbrv3 } from "../tbrv3/index.js";
import { ethers } from "ethers";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { encoding } from "@wormhole-foundation/sdk-base";
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

const peers = [
  { chain: "Sepolia", peer: new UniversalAddress(ethers.Wallet.createRandom().address) },
  { chain: "ArbitrumSepolia", peer: new UniversalAddress(ethers.Wallet.createRandom().address) },
  { chain: "Solana", peer: new UniversalAddress(ethers.Wallet.createRandom().address) },
];

describe('TbrV3 SDK Integration test', () => {

  before(async () => {
    expect(rpc).to.not.be.undefined;
    expect(ownerPk).to.not.be.undefined;

    const address = config.TbrV3Proxies[0].address;
    tbrv3 = Tbrv3.fromRpcUrl(rpc!, "Testnet", address);
    signer = new ethers.Wallet(ownerPk!, tbrv3.provider);
  });

  // governance commands
  it.skip("should set peers", async () => { // skipped as it requires TB to be present
    const expectedPeers = peers.map(p => ({ chain: p.chain as SupportedChains, peer: p.peer }));
    const addPeersPartialTx = tbrv3.addPeers(expectedPeers);

    const result = await awaitTx(addPeersPartialTx);
    expect(result!.status).to.equal(1);

    const isPeer = await tbrv3.isPeer(expectedPeers[0].chain, expectedPeers[0].peer);
    expect(isPeer).to.be.true;
  }).timeout(timeout);

  it.skip("should update canonical peer", async () => {  // skipped as it requires TB to be present
    const map: Map<SupportedChains, UniversalAddress> = new Map(peers.map(p => [p.chain as SupportedChains, p.peer]));
    const updateCanonicalPeerPartialTx = tbrv3.updateCanonicalPeers(map);

    const result = await awaitTx(updateCanonicalPeerPartialTx);

    expect(result).to.not.be.undefined;
    expect(result!.status).to.equal(1);

    const canonicalPeer = await tbrv3.canonicalPeer(peers[0].chain as SupportedChains);
    expect(canonicalPeer).to.be.equal(peers[0].peer);
  }).timeout(timeout);

  it("should update max gas dropoffs", async () => {
    const expectedMaxGasDropoff = Math.round(Math.random() * 1000);
    const map = new Map(peers.map(p => [p.chain as SupportedChains, expectedMaxGasDropoff]));
    const updateCanonicalPeerPartialTx = tbrv3.updateMaxGasDroppoffs(map);

    const result = await awaitTx(updateCanonicalPeerPartialTx);

    expect(result!.status).to.equal(1);

    const maxGasDropoff = await tbrv3.maxGasDropoff(peers[0].chain as SupportedChains);
    expect(maxGasDropoff).to.be.equal(expectedMaxGasDropoff);
  }).timeout(timeout);

  it("should update relay fee", async () => {
    const expectedFee = Math.round(Math.random() * 1000);
    const udpatedRelayerFeePartialTx = tbrv3.updateRelayFee("Ethereum", expectedFee);

    const result = await awaitTx(udpatedRelayerFeePartialTx);

    expect(result!.status).to.equal(1);

    const fee = await tbrv3.relayFee("Ethereum");
    expect(fee).to.equal(expectedFee);
  }).timeout(timeout);

  it("should update admin", async () => {
    const evmAddress = new EvmAddress(ethers.Wallet.createRandom().address);
    const expectedIsAdmin = Math.random() < 0.5;
    const modifyAdminPartialTx = tbrv3.updateAdmin(expectedIsAdmin, evmAddress);

    const result = await awaitTx(modifyAdminPartialTx);

    expect(result!.status).to.equal(1);

    const isAdmin = await tbrv3.isAdmin(evmAddress);
    expect(isAdmin).to.equal(expectedIsAdmin);
  }).timeout(timeout);

  // governance queries

  it("should obtain owner", async () => {
    const owner = await tbrv3.owner();
    expect(owner).to.equal(await signer.getAddress());
  }).timeout(timeout);

  // relaying queries

  it("should obtain relaying fee", async () => {
    const relayingFee = await tbrv3.relayingFee({ targetChain: "Sepolia", gasDropoff: 1 });
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