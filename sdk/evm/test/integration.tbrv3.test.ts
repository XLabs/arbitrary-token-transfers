import { expect } from "chai";
import { before } from "mocha";
import { TbrPartialTx, Tbrv3 } from "../tbrv3/index.js";
import { ethers } from "ethers";
import { UniversalAddress } from "@wormhole-foundation/sdk-definitions";

const env = process.env.ENV || "localnet";
const rpc = {
  localnet: "http://localhost:8899",
}[env];
let tbrv3: Tbrv3;
let signer: ethers.Signer;

describe('TbrV3 SDK Integration test', () => {

  before(async () => {
    expect(rpc).to.not.be.undefined;
    tbrv3 = Tbrv3.fromRpcUrl(rpc!, "Testnet");    
    signer = ethers.Wallet.createRandom().connect(tbrv3.provider);
  });

  it("should set peer", async () => {
    const addPeersPartialTx = tbrv3.addPeers([ { chain: "Ethereum", peer: new UniversalAddress(ethers.Wallet.createRandom().address) } ]);

    const result = await awaitTx(addPeersPartialTx);
    expect(result).to.not.be.undefined;
    expect(result!.status).to.equal(1);
  });

});

const awaitTx = async (partialTx: TbrPartialTx) => {
  const tx = await signer.sendTransaction({...partialTx, data: partialTx.data.toString()});
  return tx.wait();
}