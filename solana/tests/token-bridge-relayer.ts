import { BN, AnchorError, web3 } from "@coral-xyz/anchor";
import { SendTransactionError } from "@solana/web3.js";
import {
  assertResolveFailure,
  assertEqKeys,
  assertEqBns,
  newProvider,
  requestAirdrop,
} from "./utils/helpers";
import { ClientWrapper } from "./utils/client-wrapper";
import { describe } from "mocha";

describe("Token Bridge Relayer Program", () => {
  const clients = Array.from(
    { length: 4 },
    () => new ClientWrapper(newProvider(), { tokenBridgeProgramId: null, wormholeProgramId: null }),
  );
  const [ownerClient, newOwnerClient, adminClient, unauthorizedClient] = clients;

  before(async () => Promise.all(clients.map((client) => requestAirdrop(client.provider))));

  it("Is initialized!", async () => {
    await ownerClient.initialize();

    const config = await unauthorizedClient.read.config();
    assertEqKeys(config.owner, ownerClient.publicKey);
  });

  describe("Roles", () => {
    it("Submits an owner transfer request", async () => {
      await ownerClient.submitOwnerTransferRequest(newOwnerClient.publicKey);
    });

    it("Rejects a transfer validation by an unauthorized account", async () => {
      await assertResolveFailure(
        unauthorizedClient.confirmOwnerTransferRequest(),
        SendTransactionError,
      );
    });

    it("Accepts a transfer validation by rightful new owner", async () => {
      await newOwnerClient.confirmOwnerTransferRequest();
    });

    it("Correctly cancels an ownership transfer", async () => {
      // Submit a transfer to the original owner:
      await newOwnerClient.submitOwnerTransferRequest(ownerClient.publicKey);

      // But cancel it:
      await newOwnerClient.cancelOwnerTransferRequest();

      // Now the original owner cannot accept the ownership:
      await assertResolveFailure(ownerClient.confirmOwnerTransferRequest(), SendTransactionError);
    });

    it("Transfers the admin role", async () => {
      let config = await unauthorizedClient.read.config();
      assertEqKeys(config.admin, ownerClient.publicKey);

      // The owner can transfer the admin role:

      await newOwnerClient.updateAdmin(unauthorizedClient.publicKey);

      config = await unauthorizedClient.read.config();
      assertEqKeys(config.admin, unauthorizedClient.publicKey);

      // The admin can transfer its own role:

      await unauthorizedClient.updateAdmin(adminClient.publicKey);

      config = await unauthorizedClient.read.config();
      assertEqKeys(config.admin, adminClient.publicKey);
    });

    it("Unauthorized cannot transfer the admin role", async () => {
      await assertResolveFailure(
        unauthorizedClient.updateAdmin(unauthorizedClient.publicKey),
        SendTransactionError,
      );
    });
  });
});
