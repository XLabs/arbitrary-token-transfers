import * as anchor from '@coral-xyz/anchor';
import { PublicKey, SendTransactionError, Transaction } from '@solana/web3.js';
import {
  assertResolveFailure,
  assertEqKeys,
  assertEqBns,
  newProvider,
  requestAirdrop,
  assertEqChainConfigs,
} from './utils/helpers.js';
import { ClientWrapper } from './utils/client-wrapper.js';

import { SolanaPriceOracleClient } from '@xlabs-xyz/solana-arbitrary-token-transfers';

const ETHEREUM = 'Ethereum';
const OASIS = 'Oasis';

describe('Token Bridge Relayer Program', () => {
  const clients = Array.from(
    { length: 4 },
    (_, index) =>
      new ClientWrapper(
        newProvider(),
        {
          tokenBridgeProgramId: PublicKey.default,
          wormholeProgramId: PublicKey.default,
        },
        index == 3,
      ),
  );
  const [ownerClient, newOwnerClient, adminClient, unauthorizedClient] = clients;

  const oracleOwner = newProvider();
  const oracleOwnerClient = new SolanaPriceOracleClient(oracleOwner.connection);

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

    it('Transfers the admin role', async () => {
      let config = await unauthorizedClient.read.config();
      assertEqKeys(config.admin, ownerClient.publicKey);

      // The owner can transfer the admin role:

      //await newOwnerClient.updateAdmin(unauthorizedClient.publicKey);

      config = await unauthorizedClient.read.config();
      assertEqKeys(config.admin, unauthorizedClient.publicKey);

      // The admin can transfer its own role:

      //await unauthorizedClient.updateAdmin(adminClient.publicKey);

      config = await unauthorizedClient.read.config();
      assertEqKeys(config.admin, adminClient.publicKey);
    });

    it('Unauthorized cannot transfer the admin role', async () => {
      await assertResolveFailure(
        unauthorizedClient.addAdmin(unauthorizedClient.publicKey),
        SendTransactionError,
      );
    });
  });

  describe('Peers', () => {
    it('Registers peers', async () => {
      await newOwnerClient.registerPeer(ETHEREUM, ethereumPeer1);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoff: new anchor.BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new anchor.BN(0),
      });

      await adminClient.registerPeer(ETHEREUM, ethereumPeer2);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoff: new anchor.BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new anchor.BN(0),
      });

      await adminClient.registerPeer(OASIS, oasisPeer);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(OASIS), {
        canonicalPeer: Array.from(oasisPeer),
        maxGasDropoff: new anchor.BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new anchor.BN(0),
      });
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer1),
        maxGasDropoff: new anchor.BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new anchor.BN(0),
      });
    });

    it('Updates the canonical peer to another one', async () => {
      await newOwnerClient.updateCanonicalPeer(ETHEREUM, ethereumPeer2);

      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(ETHEREUM), {
        canonicalPeer: Array.from(ethereumPeer2),
        maxGasDropoff: new anchor.BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new anchor.BN(0),
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
      const maxGasDropoff = new anchor.BN('10000000000000'); // ETH10 maximum
      const relayerFee = new anchor.BN(900_000); // $0.9
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
        unauthorizedClient.updateMaxGasDropoff(ETHEREUM, new anchor.BN(0)),
        SendTransactionError,
      );
      await assertResolveFailure(
        unauthorizedClient.updateRelayerFee(ETHEREUM, new anchor.BN(0)),
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
        unauthorizedClient.updateEvmTransactionConfig(new anchor.BN(0), new anchor.BN(0)),
        SendTransactionError,
      );
    });
  });

  describe('Querying the quote', () => {
    it('Fetches the quote', async () => {
      const dropoff = new anchor.BN('50000000000'); // ETH0.05

      const result = await unauthorizedClient.relayingFee(ETHEREUM, dropoff);

      assertEqBns(result, new anchor.BN(123));
    });
  });
});
