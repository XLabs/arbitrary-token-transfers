import { expect } from "chai";
import { before } from "mocha";
import { TbrPartialTx, Tbrv3 } from "../tbrv3/index.js";
import { ethers } from "ethers";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";
import { encoding } from "@wormhole-foundation/sdk-base";
// @ts-expect-error
import  config from "../../../../deployment/config/localnet/contracts.json" with { type: "json" };

const env = process.env.ENV || "localnet";
const ownerPk = process.env.WALLET_KEY;
const rpc = {
  localnet: "http://localhost:8545",
}[env];
let tbrv3: Tbrv3;
let signer: ethers.Signer;

describe('TbrV3 SDK Integration test', () => {

  before(async () => {
    expect(rpc).to.not.be.undefined;
    expect(ownerPk).to.not.be.undefined;

    const address = config.TbrV3[0].address;
    tbrv3 = Tbrv3.fromRpcUrl(rpc!, "Testnet", address);    
    signer = new ethers.Wallet(ownerPk!, tbrv3.provider);
  });

  it.skip("should obtain relaying fee", async () => {
    const relayingFee = await tbrv3.relayingFee({ targetChain: "Ethereum", gasDropoff: 1000n });
    expect(relayingFee).to.not.be.undefined;
  });

  it("should obtain base relaying params", async () => {
    const baseRelayingParams = await tbrv3.baseRelayingParams("Ethereum");
    expect(baseRelayingParams).to.not.be.undefined;
  });

  // governance
  it("should obtain owner", async () => {
    const owner = await tbrv3.owner();
    expect(owner).to.not.be.undefined;
  });

  it("should set peer", async () => {
    const addPeersPartialTx = tbrv3.addPeers([ { chain: "Ethereum", peer: new UniversalAddress(ethers.Wallet.createRandom().address) } ]);

    const result = await awaitTx(addPeersPartialTx);
    expect(result).to.not.be.undefined;
    expect(result!.status).to.equal(1);
  }).timeout(20_000);

});

const awaitTx = async (partialTx: TbrPartialTx) => {
  try {
    const tx = await signer.sendTransaction({...partialTx, data: encoding.hex.encode(partialTx.data, true) });
    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error(error);
    throw error;
  }
}