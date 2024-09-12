import { BN, AnchorError, web3 } from '@coral-xyz/anchor';
import { PublicKey, SendTransactionError } from '@solana/web3.js';
import { Chain } from '@wormhole-foundation/sdk-base';
import {
  assertResolveFailure,
  assertEqKeys,
  assertEqBns,
  newProvider,
  requestAirdrop,
  assertEqChainConfigs,
} from './utils/helpers';
import { ClientWrapper } from './utils/client-wrapper';
import { assert } from 'chai';

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

  const canonicalEthereumPeer: { chain: Chain; address: Buffer } = {
    chain: 'Ethereum',
    address: PublicKey.unique().toBuffer(),
  };
  const otherEthereumPeer: { chain: Chain; address: Buffer } = {
    chain: 'Ethereum',
    address: PublicKey.unique().toBuffer(),
  };
  const oasisPeer: { chain: Chain; address: Buffer } = {
    chain: 'Oasis',
    address: PublicKey.unique().toBuffer(),
  };

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
    xit('Registers peers', async () => {
      await ownerClient.registerPeer(canonicalEthereumPeer.chain, canonicalEthereumPeer.address);

      //const chainConfig = await unauthorizedClient.read.chainConfig(canonicalEthereumPeer.chain);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(canonicalEthereumPeer.chain), {
        canonicalPeer: Array.from(canonicalEthereumPeer.address),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });

      await adminClient.registerPeer(otherEthereumPeer.chain, otherEthereumPeer.address);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(otherEthereumPeer.chain), {
        canonicalPeer: Array.from(canonicalEthereumPeer.address),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });

      await adminClient.registerPeer(oasisPeer.chain, oasisPeer.address);
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(oasisPeer.chain), {
        canonicalPeer: Array.from(oasisPeer.address),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });
      assertEqChainConfigs(await unauthorizedClient.read.chainConfig(otherEthereumPeer.chain), {
        canonicalPeer: Array.from(canonicalEthereumPeer.address),
        maxGasDropoff: new BN(0),
        pausedOutboundTransfers: true,
        relayerFee: new BN(0),
      });
    });

    it('Updates the canonical peer to another one', async () => {
      //
    });

    it('Does not let unauthorized signers register or update a peer', async () => {
      // Unauthorized cannot register a peer:
      // Admin cannot make another peer canonical:
    });
  });
});
