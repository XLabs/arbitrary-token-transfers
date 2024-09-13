import { Tbr__factory } from "../ethers-contracts/index.js";

async function run() {
  const contractInterface = Tbr__factory.createInterface();
  console.log(contractInterface.parseError("0xea8e4eb5"))
}

run().then(() => console.log("Done!"));
