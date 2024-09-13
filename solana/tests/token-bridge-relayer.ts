import { BN, AnchorError, web3 } from '@coral-xyz/anchor';
import { PublicKey, SendTransactionError } from '@solana/web3.js';
import { Chain } from '@wormhole-foundation/sdk-base';
import {
  assertResolveFailure,
  assertEqKeys,
  assertEqBns,
  newProvider,
  requestAirdrop,
} from "./utils/helpers.js";
import { ClientWrapper } from "./utils/client-wrapper.js";
import { describe } from "mocha";

const ETHEREUM = 'Ethereum';
const OASIS = 'Oasis';

describe('Token Bridge Relayer Program', () => {
  const clients = Array.from(
    { length: 4 },
    () =>
      new ClientWrapper(newProvider(), {
        tokenBridgeProgramId: PublicKey.default,
        wormholeProgramId: PublicKey.default,
      }),
  );
  const [ownerClient, newOwnerClient, adminClient, unauthorizedClient] = clients;
  const feeRecipient = PublicKey.unique();
  const evmTransactionGas = new BN(321000);
  const evmTransactionSize = new BN(654000);

  const ethereumPeer1 = Buffer.from(
    'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1',
    'hex',
  );
  const ethereumPeer2 = Buffer.from(
    'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2',
    'hex',
  );
  const oasisPeer = Buffer.from(
    '0A51533333333333333333333333333333333333333333333333333333333333',
    'hex',
  );

  before(async () => Promise.all(clients.map((client) => requestAirdrop(client.provider))));

  it('Is initialized!', async () => {
    await ownerClient.initialize();

    const config = await unauthorizedClient.read.config();
    assertEqKeys(config.owner, ownerClient.publicKey);
  });

  describe('Roles', () => {
    it('Submits an owner transfer request', async () => {
      await ownerClient.submitOwnerTransferRequest(newOwnerClient.publicKey);
    });

    it('Rejects a transfer validation by an unauthorized account', async () => {
      await assertResolveFailure(
        unauthorizedClient.confirmOwnerTransferRequest(),
        SendTransactionError,
      );
    });

    it('Accepts a transfer validation by rightful new owner', async () => {
      await newOwnerClient.confirmOwnerTransferRequest();
    });

    it('Correctly cancels an ownership transfer', async () => {
      // Submit a transfer to the original owner:
      await newOwnerClient.submitOwnerTransferRequest(ownerClient.publicKey);

      // But cancel it:
      await newOwnerClient.cancelOwnerTransferRequest();

      // Now the original owner cannot accept the ownership:
      await assertResolveFailure(ownerClient.confirmOwnerTransferRequest(), SendTransactionError);
    });

    it('Transfers the admin role', async () => {
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

    it('Unauthorized cannot transfer the admin role', async () => {
      await assertResolveFailure(
        unauthorizedClient.updateAdmin(unauthorizedClient.publicKey),
        SendTransactionError,
      );
    });
  });

  describe('Peers', () => {
    it('Registers peers', async () => {
      await newOwnerClient.registerPeer(ETHEREUM, ethereumPeer1);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });

      await adminClient.registerPeer(ETHEREUM, ethereumPeer2);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });

      await adminClient.registerPeer(OASIS, oasisPeer);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(OASIS), {
        canonicalPeer: Array.from(oasisPeer),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });
    });

    it('Updates the canonical peer to another one', async () => {
      await newOwnerClient.updateCanonicalPeer(ETHEREUM, ethereumPeer2);

      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer2),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });
    });

    it('Does not let update a peer from another chain as canonical', async () => {
      await assertResolveFailure(
        newOwnerClient.updateCanonicalPeer(ETHEREUM, oasisPeer),
        SendTransactionError,
      );
    });

    it('Cannot register an existing peer', async () => {
      await assertResolveFailure(
        newOwnerClient.updateCanonicalPeer(OASIS, oasisPeer),
        SendTransactionError,
      );
    });

    it('Does not let unauthorized signers register or update a peer', async () => {
      // Unauthorized cannot register a peer:
      await assertResolveFailure(
        unauthorizedClient.registerPeer(ETHEREUM, PublicKey.unique().toBuffer()),
        SendTransactionError,
      );

      // Admin cannot make another peer canonical:
      await assertResolveFailure(
        adminClient.updateCanonicalPeer(ETHEREUM, ethereumPeer1),
        SendTransactionError,
      );
    });
  });

  describe('Chain Config', () => {
    it('Values are updated', async () => {
      const maxGasDropoff = new BN(123);
      const relayerFee = new BN(456);
      await Promise.all([
        adminClient.setPauseForOutboundTransfers(ETHEREUM, false),
        adminClient.updateMaxGasDropoff(ETHEREUM, maxGasDropoff),
        adminClient.updateRelayerFee(ETHEREUM, relayerFee),
      ]);

      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer2),
        maxGasDropoff,
        pausedOutboundTransfers: false,
        relayerFee,
      });
    });

    it('Unauthorized cannot update the values', async () => {
      await assertResolveFailure(
        unauthorizedClient.setPauseForOutboundTransfers(ETHEREUM, true),
        SendTransactionError,
      );
      await assertResolveFailure(
        unauthorizedClient.updateMaxGasDropoff(ETHEREUM, new BN(0)),
        SendTransactionError,
      );
      await assertResolveFailure(
        unauthorizedClient.updateRelayerFee(ETHEREUM, new BN(0)),
        SendTransactionError,
      );
    });
  });

  describe('Main Config', () => {
    it('Values are updated', async () => {
      await Promise.all([
        adminClient.updateFeeRecipient(feeRecipient),
        adminClient.updateEvmTransactionConfig(evmTransactionGas, evmTransactionSize),
      ]);

      const config = await unauthorizedClient.read.config();

      assertEqKeys(config.feeRecipient, feeRecipient);
      assertEqBns(config.evmTransactionGas, evmTransactionGas);
      assertEqBns(config.evmTransactionSize, evmTransactionSize);
    });

    it('Unauthorized cannot update the values', async () => {
      await assertResolveFailure(
        unauthorizedClient.updateFeeRecipient(PublicKey.unique()),
        SendTransactionError,
      );
      await assertResolveFailure(
        unauthorizedClient.updateEvmTransactionConfig(new BN(0), new BN(0)),
        SendTransactionError,
      );
    });
  });
});
