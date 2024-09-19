import anchor from '@coral-xyz/anchor';
import { PublicKey, SendTransactionError, Transaction } from '@solana/web3.js';
import {
  assertResolveFailure,
  assertEqKeys,
  assertEqBns,
  newProvider,
  requestAirdrop,
  assertEqChainConfigs,
} from './utils/helpers.js';
import { TbrWrapper, TokenBridgeWrapper, WormholeCoreWrapper } from './utils/client-wrapper.js';
import { SolanaPriceOracleClient } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { wormholeProgramId, tokenBridgeProgramId } from './utils/helpers.js';
import { expect } from 'chai';

const ETHEREUM = 'Ethereum';
const OASIS = 'Oasis';

describe('Token Bridge Relayer Program', () => {
  const clients = (['owner', 'owner', 'admin', 'admin', 'regular'] as const).map(
    (typeAccount) =>
      new TbrWrapper(
        newProvider(),
        {
          tokenBridgeProgramId,
          wormholeProgramId,
        },
        typeAccount,
      ),
  );
  const [ownerClient, newOwnerClient, adminClient1, adminClient2, unauthorizedClient] = clients;

  const oracleOwner = newProvider();
  const oracleOwnerClient = new SolanaPriceOracleClient(oracleOwner.connection);

  const wormholeCoreOwner = newProvider();
  const wormholeCoreClient = new WormholeCoreWrapper(wormholeCoreOwner);

  const tokenBridgeOwner = newProvider();
  const tokenBridgeClient = new TokenBridgeWrapper(tokenBridgeOwner);

  const feeRecipient = PublicKey.unique();
  const evmTransactionGas = new anchor.BN(321000);
  const evmTransactionSize = new anchor.BN(654000);

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

  before(async () => {
    await Promise.all(clients.map((client) => requestAirdrop(client.provider)));
    await requestAirdrop(oracleOwner);

    // Oracle Setup
    // ============

    await oracleOwner.sendAndConfirm(
      new Transaction().add(
        await oracleOwnerClient.initialize(oracleOwner.publicKey),
        await oracleOwnerClient.registerEvmPrices(oracleOwner.publicKey, {
          chain: ETHEREUM,
          gasPrice: 2117, // 1 gas costs 2117 Mwei
          pricePerByte: 0, // ETH does not care about transaction size
          gasTokenPrice: new anchor.BN(789_000_000), // ETH is at $789
        }),
        await oracleOwnerClient.updateSolPrice(oracleOwner.publicKey, new anchor.BN(113_000_000)), // SOL is at $113
      ),
    );

    // Wormhole Core Setup
    // ===================
    await wormholeCoreClient.initialize();
  });

  after(async () => {
    // Prevents the tests to be stuck, by closing the open channels.
    await Promise.all(clients.map((client) => client.close()));
  });

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

    it('Only the owner can add an admin', async () => {
      // At first, the admin doesn't exist:
      await assertResolveFailure(unauthorizedClient.read.adminBadge(adminClient1.publicKey));

      // After being added, it exists:
      await newOwnerClient.addAdmin(adminClient1.publicKey);
      await unauthorizedClient.read.adminBadge(adminClient1.publicKey);

      // An admin cannot add another one:
      await assertResolveFailure(
        adminClient1.addAdmin(adminClient2.publicKey),
        SendTransactionError,
      );

      // ... but the owner can:
      await newOwnerClient.addAdmin(adminClient2.publicKey);
      await unauthorizedClient.read.adminBadge(adminClient2.publicKey);

      // On the contrary, an admin can remove another one:
      await adminClient1.removeAdmin(adminClient2.publicKey);
      await assertResolveFailure(unauthorizedClient.read.adminBadge(adminClient2.publicKey));
    });

    it('Unauthorized cannot add or remove an admin', async () => {
      await assertResolveFailure(
        unauthorizedClient.addAdmin(adminClient2.publicKey),
        SendTransactionError,
      );
      await assertResolveFailure(
        unauthorizedClient.removeAdmin(adminClient1.publicKey),
        SendTransactionError,
      );
    });
  });

  describe('Peers', () => {
    it('Registers peers', async () => {
      await newOwnerClient.registerPeer(ETHEREUM, ethereumPeer1);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(await unauthorizedClient.read.peer(ETHEREUM, ethereumPeer1)).deep.equal({
        chain: ETHEREUM,
        address: Array.from(ethereumPeer1),
      });

      await adminClient1.registerPeer(ETHEREUM, ethereumPeer2);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(await unauthorizedClient.read.peer(ETHEREUM, ethereumPeer2)).deep.equal({
        chain: ETHEREUM,
        address: Array.from(ethereumPeer2),
      });

      await adminClient1.registerPeer(OASIS, oasisPeer);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(OASIS), {
        canonicalPeer: Array.from(oasisPeer),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(await unauthorizedClient.read.peer(OASIS, oasisPeer)).deep.equal({
        chain: OASIS,
        address: Array.from(oasisPeer),
      });
    });

    it('Updates the canonical peer to another one', async () => {
      await newOwnerClient.updateCanonicalPeer(ETHEREUM, ethereumPeer2);

      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer2),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
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
        adminClient1.updateCanonicalPeer(ETHEREUM, ethereumPeer1),
        SendTransactionError,
      );
    });
  });

  describe('Chain Config', () => {
    it('Values are updated', async () => {
      const maxGasDropoffMicroToken = 10_000_000; // ETH10 maximum
      const relayerFeeMicroUsd = 900_000; // $0.9
      await Promise.all([
        adminClient1.setPauseForOutboundTransfers(ETHEREUM, false),
        adminClient1.updateMaxGasDropoff(ETHEREUM, maxGasDropoffMicroToken),
        adminClient1.updateRelayerFee(ETHEREUM, relayerFeeMicroUsd),
      ]);

      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer2),
        maxGasDropoffMicroToken,
        pausedOutboundTransfers: false,
        relayerFeeMicroUsd,
      });
    });

    it('Unauthorized cannot update the values', async () => {
      await assertResolveFailure(
        unauthorizedClient.setPauseForOutboundTransfers(ETHEREUM, true),
        SendTransactionError,
      );
      await assertResolveFailure(
        unauthorizedClient.updateMaxGasDropoff(ETHEREUM, 0),
        SendTransactionError,
      );
      await assertResolveFailure(
        unauthorizedClient.updateRelayerFee(ETHEREUM, 0),
        SendTransactionError,
      );
    });
  });

  describe('Main Config', () => {
    it('Values are updated', async () => {
      await Promise.all([
        adminClient1.updateFeeRecipient(feeRecipient),
        adminClient1.updateEvmTransactionConfig(evmTransactionGas, evmTransactionSize),
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
        unauthorizedClient.updateEvmTransactionConfig(new anchor.BN(0), new anchor.BN(0)),
        SendTransactionError,
      );
    });
  });

  describe('Querying the quote', () => {
    it('Fetches the quote', async () => {
      const dropoff = 50000; // ETH0.05

      const result = await unauthorizedClient.relayingFee(ETHEREUM, dropoff);

      expect(result).closeTo(0.361824, 0.000001); // SOL0.36, which is roughly $40
    });
  });
});
