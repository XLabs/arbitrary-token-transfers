import { assert, expect } from "chai";
import { before } from "mocha";
import { PartialTx, Tbrv3 } from "../tbrv3/index.js";
import { ethers } from "ethers";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { encoding } from "@wormhole-foundation/sdk-base";
import config from "./localnet/contracts.json" with { type: "json" };
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
  { chain: "BaseSepolia", peer: new UniversalAddress(ethers.Wallet.createRandom().address) },
  { chain: "Solana", peer: new UniversalAddress(ethers.Wallet.createRandom().address) },
] as const;

describe('TbrV3 SDK Integration test', () => {

  before(async () => {
    expect(rpc).to.not.be.undefined;
    expect(ownerPk).to.not.be.undefined;

    const address = new EvmAddress(config.TbrV3Proxies[0].address);
    const provider = new ethers.JsonRpcProvider(rpc, undefined, {staticNetwork: true});

    tbrv3 = Tbrv3.connect(wrapEthersProvider(provider), "Testnet", "Sepolia", address);
    signer = new ethers.Wallet(ownerPk!, provider);
  });

  // governance commands
  it.skip("should set peers", async () => { // skipped as it requires TB to be present
    const addPeersPartialTx = tbrv3.execTx(0n, [
      {
        command: "ConfigCommands",
        commands: peers.map(({peer, chain}) => ({ command: "AddPeer", address: peer, chain })),
      }
    ]);

    const result = await awaitTx(addPeersPartialTx);
    expect(result!.status).to.equal(1);

    const isPeer = await tbrv3.query([
      {
        query: "ConfigQueries",
        queries: peers.map(({peer, chain}) => ({ query: "IsPeer", chain, address: peer })),
      }
    ]);
    expect(isPeer).to.have.ordered.members(peers.map(() => true));
  }).timeout(timeout);

  it.skip("should update canonical peer", async () => {  // skipped as it requires TB to be present
    const updateCanonicalPeerPartialTx = tbrv3.execTx(0n, [
      {
        command: "ConfigCommands",
        commands: peers.map(({peer, chain}) => ({command: "UpdateCanonicalPeer", chain, address: peer}))
      }
    ]);

    const result = await awaitTx(updateCanonicalPeerPartialTx);

    expect(result).to.not.be.undefined;
    expect(result!.status).to.equal(1);

    const response = await tbrv3.query([
      {
        query: "ConfigQueries",
        queries: [{ query: "CanonicalPeer", chain: peers[0].chain}]
      }
    ]);
    for (const [i, query] of response.entries()) {
      assert.isTrue(query.result.equals(peers[i].peer));
    }
  }).timeout(timeout);

  it("should update max gas dropoffs", async () => {
    const expectedMaxGasDropoff = Math.round(Math.random() * 1000);
    const updateMaxGasDropoffPartialTx = tbrv3.execTx(0n, [
      {
        command: "ConfigCommands",
        commands: peers.map(({chain}) => ({
          command: "UpdateMaxGasDropoff",
          chain,
          value: expectedMaxGasDropoff,
        }))
      }
    ]);

    const result = await awaitTx(updateMaxGasDropoffPartialTx);

    expect(result!.status).to.equal(1);

    const maxGasDropoffs = await tbrv3.query([
      {
        query: "ConfigQueries",
        queries: peers.map(({chain}) => ({
          query: "MaxGasDropoff",
          chain,
          value: expectedMaxGasDropoff,
        }))
      }
    ]);
    for (const [i, maxGasDropoff] of maxGasDropoffs.entries()) {
      expect(maxGasDropoff.result).to.be.equal(expectedMaxGasDropoff);
    }
  }).timeout(timeout);

  it("should update relay fee", async () => {
    const expectedFee = Math.round(Math.random() * 1000);
    const udpatedRelayerFeePartialTx = tbrv3.execTx(0n, [
      {
        command: "ConfigCommands",
        commands: peers.map(({chain}) => ({command: "UpdateBaseFee", chain, value: expectedFee}))
      }
    ]);

    const result = await awaitTx(udpatedRelayerFeePartialTx);

    expect(result!.status).to.equal(1);

    const fees = await tbrv3.query([
      {
        query: "ConfigQueries",
        queries: peers.map(({chain}) => ({query: "BaseFee", chain, value: expectedFee}))
      }
    ]);
    for (const fee of fees) {
      expect(fee.result).to.equal(expectedFee);
    }
  }).timeout(timeout);

  it("should add admin", async () => {
    const evmAddress = new EvmAddress("0x00002000004000000f000000e00a000b000c000d");
    const addAdminPartialTx = tbrv3.execTx(0n, [
      {
        command: "AccessControlCommands",
        commands: [{command: "AddAdmin", address: evmAddress}]
      }
    ]);

    const result = await awaitTx(addAdminPartialTx);

    expect(result!.status).to.equal(1);

    const isAdmin = await tbrv3.query([
      {
        query: "AccessControlQueries",
        queries: [{query: "IsAdmin", address: evmAddress}]
      }
    ]);
    expect(isAdmin[0].result).to.be.true;
  }).timeout(timeout);

  // This test relies on the fact that we're not snapshotting state of the contracts.
  it("should remove admin", async () => {
    const evmAddress = new EvmAddress("0x00002000004000000f000000e00a000b000c000d");
    const revokeAdminPartialTx = tbrv3.execTx(0n, [
      {
        command: "AccessControlCommands",
        commands: [{command: "RevokeAdmin", address: evmAddress}]
      }
    ]);

    const result = await awaitTx(revokeAdminPartialTx);

    expect(result!.status).to.equal(1);

    const isAdmin = await tbrv3.query([
      {
        query: "AccessControlQueries",
        queries: [{query: "IsAdmin", address: evmAddress}]
      }
    ]);
    expect(isAdmin[0].result).to.be.false;
  }).timeout(timeout)

  // governance queries

  it("should obtain owner", async () => {
    const owner = await tbrv3.query([
      {
        query: "AccessControlQueries",
        queries: [{query: "Owner"}]
      }
    ]);
    assert.isTrue(owner[0].result.equals(new EvmAddress(await signer.getAddress())))
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
    const baseRelayingParams = await tbrv3.query([
      {
        query: "BaseRelayingConfig",
        targetChain: "Sepolia",
      }
    ]);
    expect(baseRelayingParams).to.not.be.undefined;
  }).timeout(timeout);

  it("should tell if chain is supported", async () => {
    const isSupported = await tbrv3.query([
      {
        query: "ConfigQueries",
        queries: [{query: "IsChainSupported", chain: "Sepolia"}]
      }
    ]);
    expect(isSupported).to.be.false; // adding canonical peers is skipped
  });

});

const awaitTx = async (partialTx: PartialTx) => {
  try {
    const tx = await signer.sendTransaction({ ...partialTx, data: encoding.hex.encode(partialTx.data, true) });
    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

function wrapEthersProvider(ethersProvider: ethers.Provider) {
  return { ethCall: async ({to, data}: Omit<PartialTx, "value">): Promise<Uint8Array> => {
    const result = await ethersProvider.call({
      to,
      data: ethers.hexlify(data),
    });
    return ethers.getBytes(result);
  }};
}
