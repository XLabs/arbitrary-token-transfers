import anchor from '@coral-xyz/anchor';
import { chainToChainId } from '@wormhole-foundation/sdk-base';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { PublicKey, SendTransactionError, Transaction } from '@solana/web3.js';
import {
  assert,
  newProvider,
  requestAirdrop,
  deployProgram,
  putProgramKeyBackInIdl,
  keypairFromFile,
} from './utils/helpers.js';
import { TbrWrapper } from './utils/client-wrapper.js';
import { SolanaPriceOracleClient, uaToArray } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { wormholeProgramId, tokenBridgeProgramId } from './utils/helpers.js';
import { expect } from 'chai';

const ETHEREUM = 'Ethereum';
const ETHEREUM_ID = chainToChainId(ETHEREUM);
const OASIS = 'Oasis';
const OASIS_ID = chainToChainId(OASIS);

describe('Token Bridge Relayer Program', () => {
  const clients = (['owner', 'owner', 'admin', 'admin', 'admin', 'regular'] as const).map(
    (typeAccount) => new TbrWrapper(newProvider(), typeAccount),
  );
  const [
    ownerClient,
    newOwnerClient,
    adminClient1,
    adminClient2,
    adminClient3,
    unauthorizedClient,
  ] = clients;

  const oracleOwner = newProvider();
  const oracleOwnerClient = new SolanaPriceOracleClient(oracleOwner.connection);

  const wormholeCoreOwner = newProvider();
  //const wormholeCoreClient = new WormholeCoreWrapper(wormholeCoreOwner);

  const tokenBridgeOwner = newProvider();
  //const tokenBridgeClient = new TokenBridgeWrapper(tokenBridgeOwner);

  const feeRecipient = PublicKey.unique();
  const evmTransactionGas = new anchor.BN(321000);
  const evmTransactionSize = new anchor.BN(654000);

  const ethereumPeer1 = new UniversalAddress(
    Buffer.from('e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1', 'hex'),
  );
  const ethereumPeer2 = new UniversalAddress(
    Buffer.from('e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2', 'hex'),
  );
  const oasisPeer = new UniversalAddress(
    Buffer.from('0A51533333333333333333333333333333333333333333333333333333333333', 'hex'),
  );

  before(async () => {
    await Promise.all(clients.map((client) => requestAirdrop(client.provider)));

    // Program Deployment
    // ============

    const authorityKeypairPath = './target/deploy/token_bridge_relayer-keypair.json';
    const authorityProvider = newProvider(await keypairFromFile(authorityKeypairPath));
    await requestAirdrop(authorityProvider);
    deployProgram(
      './solana/tests/program.json',
      authorityKeypairPath,
      './target/sbf-solana-solana/release/token_bridge_relayer.so',
    );
    await putProgramKeyBackInIdl('7TLiBkpDGshV4o3jmacTCx93CLkmo3VjZ111AsijN9f8');

    // Oracle Setup
    // ============

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

    // Wormhole Core Setup
    // ===================
    //await wormholeCoreClient.initialize();
  });

  after(async () => {
    // Prevents the tests to be stuck, by closing the open channels.
    await Promise.all(clients.map((client) => client.close()));
  });

  it('Is initialized!', async () => {
    await TbrWrapper.initialize({
      feeRecipient,
      owner: ownerClient.publicKey,
      admins: [adminClient1.publicKey, adminClient2.publicKey],
    });

    const config = await unauthorizedClient.read.config();
    assert.key(config.owner).equal(ownerClient.publicKey);

    // The owner has an auth badge:
    expect(await unauthorizedClient.read.authBadge(ownerClient.publicKey)).deep.equal({
      address: ownerClient.publicKey,
    });

    // The admins have an auth badge:
    expect(await unauthorizedClient.read.authBadge(adminClient1.publicKey)).deep.equal({
      address: adminClient1.publicKey,
    });
    expect(await unauthorizedClient.read.authBadge(adminClient2.publicKey)).deep.equal({
      address: adminClient2.publicKey,
    });

    // Verify that the accounts reader works:
    const adminAccounts = await unauthorizedClient.client.readAdminAccounts();
    assert.array(adminAccounts).equal([adminClient1.publicKey, adminClient2.publicKey]);
  });

  describe('Roles', () => {
    it('Submits an owner transfer request', async () => {
      await ownerClient.submitOwnerTransferRequest(newOwnerClient.publicKey);
    });

    it('Rejects a transfer validation by an unauthorized account', async () => {
      await assert
        .promise(unauthorizedClient.confirmOwnerTransferRequest())
        .failsWith('Signature verification failed');
    });

    it('Accepts a transfer validation by the rightful new owner', async () => {
      await newOwnerClient.confirmOwnerTransferRequest();

      // The owner has an admin badge:
      expect(await unauthorizedClient.read.authBadge(newOwnerClient.publicKey)).deep.equal({
        address: newOwnerClient.publicKey,
      });

      // The previous owner doesn't have a badge anymore:
      await assert.promise(newOwnerClient.read.authBadge(ownerClient.publicKey)).fails();
    });

    it('Correctly cancels an ownership transfer', async () => {
      // Submit a transfer to the original owner:
      await newOwnerClient.submitOwnerTransferRequest(ownerClient.publicKey);

      // But cancel it:
      await newOwnerClient.cancelOwnerTransferRequest();

      // Now the original owner cannot accept the ownership:
      await assert
        .promise(ownerClient.confirmOwnerTransferRequest())
        .failsWith('No pending owner in the program');
    });

    it('Owner can add and remove admin roles', async () => {
      // The owner can add a new admin:
      await newOwnerClient.addAdmin(adminClient3.publicKey);

      // It now has an auth badge:
      expect(await unauthorizedClient.read.authBadge(adminClient3.publicKey)).deep.equal({
        address: adminClient3.publicKey,
      });

      // The owner can also remove admins:
      await newOwnerClient.removeAdmin(adminClient3.publicKey);

      // No admin auth badge anymore:
      await assert.promise(newOwnerClient.read.authBadge(adminClient3.publicKey)).fails();
    });

    it('Admins can remove admin roles', async () => {
      // Admin2 can remove admin1:
      await adminClient2.removeAdmin(adminClient1.publicKey);
      await assert.promise(newOwnerClient.read.authBadge(adminClient1.publicKey)).fails();

      // Admin2 can remove itself:
      await adminClient2.removeAdmin(adminClient2.publicKey);
      await assert.promise(newOwnerClient.read.authBadge(adminClient2.publicKey)).fails();

      // Let's reinstate admin1 and admin2 back:
      await newOwnerClient.addAdmin(adminClient1.publicKey);
      await newOwnerClient.addAdmin(adminClient2.publicKey);
    });

    it('Admin cannot add admin', async () => {
      await assert.promise(adminClient1.addAdmin(adminClient3.publicKey)).fails();
      await assert.promise(adminClient1.read.authBadge(adminClient3.publicKey)).fails();
    });

    it('Unauthorized cannot add or remove an admin', async () => {
      await assert
        .promise(unauthorizedClient.addAdmin(adminClient2.publicKey))
        .failsWith('Signature verification failed');
      await assert
        .promise(unauthorizedClient.removeAdmin(adminClient1.publicKey))
        .failsWith('AnchorError caused by account: auth_badge. Error Code: AccountNotInitialized.');
    });
  });

  describe('Peers', () => {
    it('Registers peers', async () => {
      await newOwnerClient.registerPeer(ETHEREUM, ethereumPeer1);
      assert.chainConfig(await unauthorizedClient.read.chainConfig(ETHEREUM)).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(await unauthorizedClient.read.peer(ETHEREUM, ethereumPeer1)).deep.include({
        chainId: ETHEREUM_ID,
        address: uaToArray(ethereumPeer1),
      });

      await adminClient1.registerPeer(ETHEREUM, ethereumPeer2);
      assert.chainConfig(await unauthorizedClient.read.chainConfig(ETHEREUM)).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(await unauthorizedClient.read.peer(ETHEREUM, ethereumPeer2)).deep.include({
        chainId: ETHEREUM_ID,
        address: uaToArray(ethereumPeer2),
      });

      await adminClient1.registerPeer(OASIS, oasisPeer);
      assert.chainConfig(await unauthorizedClient.read.chainConfig(OASIS)).equal({
        chainId: OASIS_ID,
        canonicalPeer: uaToArray(oasisPeer),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      assert.chainConfig(await unauthorizedClient.read.chainConfig(ETHEREUM)).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(await unauthorizedClient.read.peer(OASIS, oasisPeer)).deep.include({
        chainId: OASIS_ID,
        address: uaToArray(oasisPeer),
      });
    });

    it('Updates the canonical peer to another one', async () => {
      await newOwnerClient.updateCanonicalPeer(ETHEREUM, ethereumPeer2);

      assert.chainConfig(await unauthorizedClient.read.chainConfig(ETHEREUM)).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumPeer2),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
    });

    it('Does not let update a peer from another chain as canonical', async () => {
      await assert
        .promise(newOwnerClient.updateCanonicalPeer(ETHEREUM, oasisPeer))
        .fails(SendTransactionError);
    });

    it('Cannot register an existing peer', async () => {
      await assert
        .promise(newOwnerClient.updateCanonicalPeer(OASIS, oasisPeer))
        .fails(SendTransactionError);
    });

    it('Does not let unauthorized signers register or update a peer', async () => {
      // Unauthorized cannot register a peer:
      await assert
        .promise(
          unauthorizedClient.registerPeer(
            ETHEREUM,
            new UniversalAddress(PublicKey.unique().toBuffer()),
          ),
        )
        .failsWith('AnchorError caused by account: auth_badge. Error Code: AccountNotInitialized.');

      // Admin cannot make another peer canonical:
      await assert
        .promise(adminClient1.updateCanonicalPeer(ETHEREUM, ethereumPeer1))
        .failsWith('Signature verification failed');
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

      assert.chainConfig(await unauthorizedClient.read.chainConfig(ETHEREUM)).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumPeer2),
        maxGasDropoffMicroToken,
        pausedOutboundTransfers: false,
        relayerFeeMicroUsd,
      });
    });

    it('Unauthorized cannot update the values', async () => {
      await assert
        .promise(unauthorizedClient.setPauseForOutboundTransfers(ETHEREUM, true))
        .fails(SendTransactionError);
      await assert
        .promise(unauthorizedClient.updateMaxGasDropoff(ETHEREUM, 0))
        .fails(SendTransactionError);
      await assert
        .promise(unauthorizedClient.updateRelayerFee(ETHEREUM, 0))
        .fails(SendTransactionError);
    });
  });

  describe('Main Config', () => {
    it('Values are updated', async () => {
      await Promise.all([
        adminClient1.updateFeeRecipient(feeRecipient),
        adminClient1.updateEvmTransactionConfig(evmTransactionGas, evmTransactionSize),
      ]);

      const config = await unauthorizedClient.read.config();

      assert.key(config.feeRecipient).equal(feeRecipient);
      assert.bn(config.evmTransactionGas).equal(evmTransactionGas);
      assert.bn(config.evmTransactionSize).equal(evmTransactionSize);
    });

    it('Unauthorized cannot update the values', async () => {
      await assert
        .promise(unauthorizedClient.updateFeeRecipient(PublicKey.unique()))
        .fails(SendTransactionError);
      await assert
        .promise(unauthorizedClient.updateEvmTransactionConfig(new anchor.BN(0), new anchor.BN(0)))
        .fails(SendTransactionError);
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
