import { chainToChainId } from '@wormhole-foundation/sdk-base';
import { toNative, UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { Keypair, PublicKey, SendTransactionError, Transaction } from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import {
  assert,
  TestMint,
  TestsHelper,
  tokenBridgeEmitter,
  WormholeContracts,
} from './utils/helpers.js';
import { TbrWrapper } from './utils/tbr-wrapper.js';
import { SolanaPriceOracle, uaToArray } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { expect } from 'chai';

import testProgramKeypair from '../programs/token-bridge-relayer/test-program-keypair.json' with { type: 'json' };
import oracleKeypair from './oracle-program-keypair.json' with { type: 'json' };
import { toVaaWithTbrV3Message } from 'common-arbitrary-token-transfer';
import { TestingWormholeCore } from './utils/testing-wormhole-core.js';
import { TestingTokenBridge } from './utils/testing-token-bridge.js';

const DEBUG = false;

const ETHEREUM = 'Ethereum';
const ETHEREUM_ID = chainToChainId(ETHEREUM);
const OASIS = 'Oasis';
const OASIS_ID = chainToChainId(OASIS);

const authorityKeypair = './target/deploy/token_bridge_relayer-keypair.json';

const $ = new TestsHelper();

const uaToPubkey = (address: UniversalAddress) => toNative('Solana', address).unwrap();

describe('Token Bridge Relayer Program', () => {
  const oracleClient = new SolanaPriceOracle($.connection, $.pubkey.from(oracleKeypair));
  const clients = Array.from({ length: 6 }).map(() =>
    TbrWrapper.from($.keypair.generate(), oracleClient, DEBUG),
  );
  const [
    ownerClient,
    newOwnerClient,
    adminClient1,
    adminClient2,
    adminClient3,
    unauthorizedClient,
  ] = clients;

  const wormholeCoreOwner = $.keypair.generate();
  const wormholeCoreClient = new TestingWormholeCore(
    wormholeCoreOwner,
    $.connection,
    WormholeContracts.Network,
    $.pubkey.from(testProgramKeypair),
    WormholeContracts.addresses,
  );

  const tokenBridgeOwner = $.keypair.generate();
  const tokenBridgeClient = new TestingTokenBridge(
    tokenBridgeOwner,
    $.connection,
    WormholeContracts.Network,
    wormholeCoreClient.guardians,
    WormholeContracts.addresses,
  );

  const feeRecipient = PublicKey.unique();
  const evmTransactionGas = 321_000n;
  const evmTransactionSize = 654_000n;

  const ethereumTokenBridge = $.universalAddress.generate();
  const oasisTokenBridge = $.universalAddress.generate();

  const ethereumTbrPeer1 = $.universalAddress.generate('ethereum');
  const ethereumTbrPeer2 = $.universalAddress.generate('ethereum');
  const oasisTbrPeer = $.universalAddress.generate('ethereum');

  before(async () => {
    await $.airdrop([
      wormholeCoreOwner,
      tokenBridgeOwner,
      ...clients.map((client) => client.signer),
    ]);

    // Programs Deployment
    // ===================
    await Promise.all([
      // Token Bridge Relayer
      $.deploy({
        programKeypair: './solana/programs/token-bridge-relayer/test-program-keypair.json',
        authorityKeypair,
        binary: './target/sbf-solana-solana/release/token_bridge_relayer.so',
      }),
      // Price Oracle
      $.deploy({
        programKeypair:
          './lib/relayer-infra-contracts/src/solana/programs/price-oracle/test-program-keypair.json',
        authorityKeypair,
        binary: './target/sbf-solana-solana/release/solana_price_oracle.so',
      }),
    ]);

    // Oracle Setup
    // ============
    const oracleAuthorityProvider = await $.keypair.read(authorityKeypair);
    const oracleAuthorityClient = await SolanaPriceOracle.create($.connection);
    await $.sendAndConfirm(
      new Transaction().add(
        await oracleAuthorityClient.initialize(oracleAuthorityProvider.publicKey, [], []),
        await oracleAuthorityClient.registerEvmPrices(oracleAuthorityProvider.publicKey, {
          chain: ETHEREUM,
          gasPrice: 2117, // 1 gas costs 2117 Mwei
          pricePerByte: 0, // ETH does not care about transaction size
          gasTokenPrice: 789_000_000n, // ETH is at $789
        }),
        await oracleAuthorityClient.updateSolPrice(oracleAuthorityProvider.publicKey, 113_000_000n), // SOL is at $113
      ),
      oracleAuthorityProvider,
    );

    // Wormhole Core Setup
    // ===================
    await Promise.all([wormholeCoreClient.initialize(), tokenBridgeClient.initialize()]);
    await Promise.all([
      tokenBridgeClient.registerPeer(ETHEREUM, ethereumTokenBridge),
      tokenBridgeClient.registerPeer(OASIS, oasisTokenBridge),
    ]);
  });

  after(async () => {
    // Prevents the tests to be stuck, by closing the open channels.
    await Promise.all(clients.map((client) => client.close()));
  });

  it('Is initialized!', async () => {
    const upgradeAuthorityClient = await TbrWrapper.create(
      await $.keypair.read(authorityKeypair),
      $.connection,
      DEBUG,
    );

    await upgradeAuthorityClient.initialize({
      feeRecipient,
      owner: ownerClient.publicKey,
      admins: [adminClient1.publicKey, adminClient2.publicKey],
    });

    const config = await unauthorizedClient.read.config();
    expect(config.owner).deep.equal(ownerClient.publicKey);

    // The owner has an auth badge:
    expect(await unauthorizedClient.account.authBadge(ownerClient.publicKey).fetch()).deep.equal({
      address: ownerClient.publicKey,
    });

    // The admins have an auth badge:
    expect(await unauthorizedClient.account.authBadge(adminClient1.publicKey).fetch()).deep.equal({
      address: adminClient1.publicKey,
    });
    expect(await unauthorizedClient.account.authBadge(adminClient2.publicKey).fetch()).deep.equal({
      address: adminClient2.publicKey,
    });

    // Verify that the accounts reader works:
    const adminAccounts = await unauthorizedClient.client.read.allAdminAccounts();
    assert.array(adminAccounts).equal([adminClient1.publicKey, adminClient2.publicKey]);

    await upgradeAuthorityClient.close();
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
      expect(
        await unauthorizedClient.account.authBadge(newOwnerClient.publicKey).fetch(),
      ).deep.equal({
        address: newOwnerClient.publicKey,
      });

      // The previous owner doesn't have a badge anymore:
      await assert.promise(newOwnerClient.account.authBadge(ownerClient.publicKey).fetch()).fails();
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
      expect(await unauthorizedClient.account.authBadge(adminClient3.publicKey).fetch()).deep.equal(
        {
          address: adminClient3.publicKey,
        },
      );

      // The owner can also remove admins:
      await newOwnerClient.removeAdmin(adminClient3.publicKey);

      // No admin auth badge anymore:
      await assert
        .promise(newOwnerClient.account.authBadge(adminClient3.publicKey).fetch())
        .fails();
    });

    it('Admins can remove admin roles', async () => {
      // Admin2 can remove admin1:
      await adminClient2.removeAdmin(adminClient1.publicKey);
      await assert
        .promise(newOwnerClient.account.authBadge(adminClient1.publicKey).fetch())
        .fails();

      // Admin2 can remove itself:
      await adminClient2.removeAdmin(adminClient2.publicKey);
      await assert
        .promise(newOwnerClient.account.authBadge(adminClient2.publicKey).fetch())
        .fails();

      // Let's reinstate admin1 and admin2 back:
      await newOwnerClient.addAdmin(adminClient1.publicKey);
      await newOwnerClient.addAdmin(adminClient2.publicKey);
    });

    it('Admin cannot add admin', async () => {
      await assert.promise(adminClient1.addAdmin(adminClient3.publicKey)).fails();
      await assert.promise(adminClient1.account.authBadge(adminClient3.publicKey).fetch()).fails();
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
      await newOwnerClient.registerPeer(ETHEREUM, ethereumTbrPeer1);
      assert.chainConfig(await unauthorizedClient.account.chainConfig(ETHEREUM).fetch()).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumTbrPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(
        await unauthorizedClient.account.peer(ETHEREUM, ethereumTbrPeer1).fetch(),
      ).deep.include({
        chainId: ETHEREUM_ID,
        address: uaToArray(ethereumTbrPeer1),
      });

      await adminClient1.registerPeer(ETHEREUM, ethereumTbrPeer2);
      assert.chainConfig(await unauthorizedClient.account.chainConfig(ETHEREUM).fetch()).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumTbrPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(
        await unauthorizedClient.account.peer(ETHEREUM, ethereumTbrPeer2).fetch(),
      ).deep.include({
        chainId: ETHEREUM_ID,
        address: uaToArray(ethereumTbrPeer2),
      });

      await adminClient1.registerPeer(OASIS, oasisTbrPeer);
      assert.chainConfig(await unauthorizedClient.account.chainConfig(OASIS).fetch()).equal({
        chainId: OASIS_ID,
        canonicalPeer: uaToArray(oasisTbrPeer),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      assert.chainConfig(await unauthorizedClient.account.chainConfig(ETHEREUM).fetch()).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumTbrPeer1),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
      expect(await unauthorizedClient.account.peer(OASIS, oasisTbrPeer).fetch()).deep.include({
        chainId: OASIS_ID,
        address: uaToArray(oasisTbrPeer),
      });
    });

    it('Updates the canonical peer to another one', async () => {
      await newOwnerClient.updateCanonicalPeer(ETHEREUM, ethereumTbrPeer2);

      assert.chainConfig(await unauthorizedClient.account.chainConfig(ETHEREUM).fetch()).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumTbrPeer2),
        maxGasDropoffMicroToken: 0,
        pausedOutboundTransfers: true,
        relayerFeeMicroUsd: 0,
      });
    });

    it('Does not let update a peer from another chain as canonical', async () => {
      await assert
        .promise(newOwnerClient.updateCanonicalPeer(ETHEREUM, oasisTbrPeer))
        .fails(SendTransactionError);
    });

    it('Cannot register an existing peer', async () => {
      await assert
        .promise(newOwnerClient.updateCanonicalPeer(OASIS, oasisTbrPeer))
        .fails(SendTransactionError);
    });

    it('Does not let unauthorized signers register or update a peer', async () => {
      // Unauthorized cannot register a peer:
      await assert
        .promise(unauthorizedClient.registerPeer(ETHEREUM, $.universalAddress.generate()))
        .failsWith('AnchorError caused by account: auth_badge. Error Code: AccountNotInitialized.');

      // Admin cannot make another peer canonical:
      await assert
        .promise(adminClient1.updateCanonicalPeer(ETHEREUM, ethereumTbrPeer1))
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

      assert.chainConfig(await unauthorizedClient.account.chainConfig(ETHEREUM).fetch()).equal({
        chainId: ETHEREUM_ID,
        canonicalPeer: uaToArray(ethereumTbrPeer2),
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

      expect(config.feeRecipient).deep.equal(feeRecipient);
      expect(config.evmTransactionGas).equal(evmTransactionGas);
      expect(config.evmTransactionSize).equal(evmTransactionSize);
    });

    it('Unauthorized cannot update the values', async () => {
      await assert
        .promise(unauthorizedClient.updateFeeRecipient(PublicKey.unique()))
        .fails(SendTransactionError);
      await assert
        .promise(unauthorizedClient.updateEvmTransactionConfig(0n, 0n))
        .fails(SendTransactionError);
    });
  });

  describe('Querying the relaying fee', () => {
    it('No discrepancy between SDK and program calculation', async () => {
      const dropoff = 50000; // ETH0.05

      const simulatedResult = await unauthorizedClient.relayingFeeSimulated(ETHEREUM, dropoff);
      const offChainResult = await unauthorizedClient.relayingFee(ETHEREUM, dropoff);

      expect(simulatedResult).closeTo(offChainResult, 0.000001);
      // SOL.36, which is roughly $40:
      expect(simulatedResult).closeTo(0.361824, 0.000001);
    });
  });

  describe('Running transfers', () => {
    const ethereumTokenAddressFoo = $.universalAddress.generate('ethereum');
    const recipientForeignToken = $.keypair.generate();
    let recipientTokenAccountForeignToken = PublicKey.default; // Will be initialized down the line
    let clientForeignToken: TbrWrapper = null as any;
    let barMint: TestMint = null as any;

    before(async () => {
      [clientForeignToken, barMint] = await Promise.all([
        TbrWrapper.create(recipientForeignToken, $.connection, DEBUG),
        await TestMint.create($.connection, ownerClient.signer, 10),
        tokenBridgeClient.attestToken(ethereumTokenBridge, ETHEREUM, ethereumTokenAddressFoo, {
          decimals: 12,
        }),
        $.airdrop(recipientForeignToken),
      ]);
    });

    it('Transfers SOL to another chain', async () => {
      const tokenAccount = await $.wrapSol(unauthorizedClient.signer, 1_000_000);
      const gasDropoffAmount = 5;
      const unwrapIntent = false; // Does not matter anyway
      const transferredAmount = 123789n;

      const foreignAddress = $.universalAddress.generate();
      const canonicalEthereum = await unauthorizedClient.read.canonicalPeer(ETHEREUM);

      await unauthorizedClient.transferTokens({
        recipient: { address: foreignAddress, chain: ETHEREUM },
        userTokenAccount: tokenAccount.publicKey,
        transferredAmount,
        gasDropoffAmount,
        maxFeeLamports: 100_000_000n, // 0.1SOL max
        unwrapIntent,
      });

      const sequence = 0n;
      const vaa = toVaaWithTbrV3Message(
        await wormholeCoreClient.parseVaa(
          unauthorizedClient.account.wormholeMessage(unauthorizedClient.publicKey, sequence)
            .address,
        ),
      );

      expect(vaa.sequence).equal(sequence);
      expect(vaa.emitterChain).equal('Solana');
      expect(uaToPubkey(vaa.emitterAddress)).deep.equal(tokenBridgeEmitter());

      expect(vaa.payload.to).deep.equal({ address: canonicalEthereum, chain: ETHEREUM });
      // Since the native mint has 9 decimals, the last digit is removed by the token bridge:
      expect(vaa.payload.token.amount).equal(transferredAmount / 10n);

      expect(vaa.payload.payload.recipient).deep.equal(foreignAddress);
      // We need to divide by 1 million because it's deserialized as the token, not µToken:
      expect(vaa.payload.payload.gasDropoff).equal(gasDropoffAmount / 1_000_000);
      expect(vaa.payload.payload.unwrapIntent).equal(unwrapIntent);
    });

    it('Transfers a token to another chain', async () => {
      const gasDropoffAmount = 0;
      const unwrapIntent = false; // Does not matter anyway
      const transferredAmount = 321654n;

      const tokenAccount = await barMint.mint(1_000_000_000n, unauthorizedClient.signer); //

      const foreignAddress = $.universalAddress.generate();
      const canonicalEthereum = await unauthorizedClient.read.canonicalPeer(ETHEREUM);

      await unauthorizedClient.transferTokens({
        recipient: { address: foreignAddress, chain: ETHEREUM },
        userTokenAccount: tokenAccount.publicKey,
        transferredAmount,
        gasDropoffAmount,
        maxFeeLamports: 100_000_000n, // 0.1SOL max
        unwrapIntent,
      });

      const sequence = 1n;
      const vaa = toVaaWithTbrV3Message(
        await wormholeCoreClient.parseVaa(
          unauthorizedClient.account.wormholeMessage(unauthorizedClient.publicKey, sequence)
            .address,
        ),
      );
      expect(vaa.sequence).equal(sequence);
      expect(vaa.emitterChain).equal('Solana');
      expect(uaToPubkey(vaa.emitterAddress)).deep.equal(tokenBridgeEmitter());

      expect(vaa.payload.to).deep.equal({ address: canonicalEthereum, chain: ETHEREUM });
      // Since the mint has 10 decimals, the last digit is removed by the token bridge:
      expect(vaa.payload.token.amount).equal(transferredAmount / 100n);

      expect(vaa.payload.payload.recipient).deep.equal(foreignAddress);
      // We need to divide by 1 million because it's deserialize as the token, not µToken:
      expect(vaa.payload.payload.gasDropoff).equal(gasDropoffAmount / 1_000_000);
      expect(vaa.payload.payload.unwrapIntent).equal(unwrapIntent);
    });

    it('Gets wrapped SOL back from another chain', async () => {
      const [payer, recipient] = await $.airdrop([Keypair.generate(), $.keypair.generate()]);
      // Associated token account already existing (to test if it breaks the transfer completion):
      const recipientTokenAccount = await spl.createAssociatedTokenAccount(
        $.connection,
        recipient,
        spl.NATIVE_MINT,
        recipient.publicKey,
      );
      const amount = 123n;

      const vaaAddress = await wormholeCoreClient.postVaa(
        payer,
        // The token originally comes from Solana's native mint
        { amount, chain: 'Solana', address: new UniversalAddress(spl.NATIVE_MINT.toBuffer()) },
        { chain: ETHEREUM, tokenBridge: ethereumTokenBridge, tbrPeer: ethereumTbrPeer1 },
        {
          recipient: new UniversalAddress(recipient.publicKey.toBuffer()),
          gasDropoff: 0,
          unwrapIntent: false,
        },
      );
      const vaa = await wormholeCoreClient.parseVaa(vaaAddress);

      await unauthorizedClient.completeTransfer(vaa);

      const balance = await $.connection.getTokenAccountBalance(recipientTokenAccount);
      // The wrapped token has 8 decimals, but the native one has 9. We must multiply the amount by 10:
      expect(balance.value.amount).equal((amount * 10n).toString());
    });

    it('Gets and unwraps wrapped SOL back from another chain', async () => {
      const [payer, recipient] = await $.airdrop([Keypair.generate(), $.keypair.generate()]);

      const initialRecipientBalance = BigInt(await $.connection.getBalance(recipient.publicKey));

      const amount = 432n;

      const vaaAddress = await wormholeCoreClient.postVaa(
        payer,
        // The token originally comes from Solana's native mint
        { amount, chain: 'Solana', address: new UniversalAddress(spl.NATIVE_MINT.toBuffer()) },
        { chain: ETHEREUM, tokenBridge: ethereumTokenBridge, tbrPeer: ethereumTbrPeer1 },
        {
          recipient: new UniversalAddress(recipient.publicKey.toBuffer()),
          gasDropoff: 0,
          unwrapIntent: true,
        },
      );
      const vaa = await wormholeCoreClient.parseVaa(vaaAddress);
      const { associatedTokenAccount } = unauthorizedClient.client.getRecipientAccountsFromVaa(vaa);

      await unauthorizedClient.completeTransfer(vaa);

      // No associated token account has been initialized because we want the SOL as gas, not SPL token:
      const associatedTokenAccountBalance = await $.connection.getBalance(associatedTokenAccount);
      expect(associatedTokenAccountBalance).equal(0);

      // Verify that we got the tokens:
      const newRecipientBalance = BigInt(await $.connection.getBalance(recipient.publicKey));
      const transferredValue = amount * 10n;

      expect(newRecipientBalance).equal(initialRecipientBalance + transferredValue);
    });

    it('Gets wrapped Foo token back from another chain with dropoff', async () => {
      const [payer, recipient] = await $.airdrop([Keypair.generate(), $.keypair.generate()]);

      const initialRecipientBalance = BigInt(await $.connection.getBalance(recipient.publicKey));
      const amount = 123n;

      const vaaAddress = await wormholeCoreClient.postVaa(
        payer,
        // The token originally comes from the Bar mint
        { amount, chain: 'Solana', address: new UniversalAddress(barMint.address.toBuffer()) },
        { chain: ETHEREUM, tokenBridge: ethereumTokenBridge, tbrPeer: ethereumTbrPeer1 },
        {
          recipient: new UniversalAddress(recipient.publicKey.toBuffer()),
          gasDropoff: 0.1, // We want 0.1 SOL
          unwrapIntent: false,
        },
      );
      const vaa = await wormholeCoreClient.parseVaa(vaaAddress);
      const { associatedTokenAccount } = unauthorizedClient.client.getRecipientAccountsFromVaa(vaa);

      await unauthorizedClient.completeTransfer(vaa);

      const balance = await $.connection.getTokenAccountBalance(associatedTokenAccount);
      // The wrapped token has 8 decimals, but this token has 10. We must multiply the amount by 100:
      expect(balance.value.amount).equal((amount * 100n).toString());

      // Verify that we got the dropoff:
      const newRecipientBalance = BigInt(await $.connection.getBalance(recipient.publicKey));
      expect(newRecipientBalance).equal(initialRecipientBalance + 100_000_000n);
    });

    it('Gets a foreign token from another chain', async () => {
      const payer = await $.airdrop(Keypair.generate());
      // Do not create the associated token account, it should be done by the SDK.

      const amount = 654_000_000n;

      const vaaAddress = await wormholeCoreClient.postVaa(
        payer,
        // Token:
        { amount, chain: ETHEREUM, address: ethereumTokenAddressFoo },
        // Source:
        { chain: ETHEREUM, tokenBridge: ethereumTokenBridge, tbrPeer: ethereumTbrPeer1 },
        // TBRv3 message:
        {
          recipient: new UniversalAddress(recipientForeignToken.publicKey.toBuffer()),
          gasDropoff: 0,
          unwrapIntent: false,
        },
      );

      const vaa = await wormholeCoreClient.parseVaa(vaaAddress);

      const { wallet, associatedTokenAccount } =
        unauthorizedClient.client.getRecipientAccountsFromVaa(vaa);
      recipientTokenAccountForeignToken = associatedTokenAccount;
      expect(wallet).deep.equal(recipientForeignToken.publicKey);

      await unauthorizedClient.completeTransfer(vaa);

      const balance = await $.connection.getTokenAccountBalance(associatedTokenAccount);
      expect(balance.value.amount).equal(amount.toString());
    });

    it('Sends a foreign token back to its original chain', async () => {
      const gasDropoffAmount = 0;
      const unwrapIntent = false; // Does not matter anyway
      const transferredAmount = 301_000_000n;

      const foreignAddress = $.universalAddress.generate();
      const canonicalEthereum = await unauthorizedClient.read.canonicalPeer(ETHEREUM);

      await clientForeignToken.transferTokens({
        recipient: { address: foreignAddress, chain: ETHEREUM },
        userTokenAccount: recipientTokenAccountForeignToken,
        transferredAmount,
        gasDropoffAmount,
        maxFeeLamports: 100_000_000n, // 0.1SOL max
        unwrapIntent,
      });

      const sequence = 0n;
      const vaa = toVaaWithTbrV3Message(
        await wormholeCoreClient.parseVaa(
          unauthorizedClient.account.wormholeMessage(clientForeignToken.publicKey, sequence)
            .address,
        ),
      );

      //expect(vaa.sequence).equal(sequence);
      expect(vaa.emitterChain).equal('Solana');
      expect(vaa.emitterAddress.address).deep.equal(tokenBridgeEmitter().toBytes());

      expect(vaa.payload.to).deep.equal({ address: canonicalEthereum, chain: ETHEREUM });

      expect(vaa.payload.token).deep.equal({
        // It is a wrapped token, so it has the expected number of decimals. No shenanigans, then:
        amount: transferredAmount,
        chain: ETHEREUM,
        address: ethereumTokenAddressFoo,
      });

      expect(vaa.payload.payload.recipient).deep.equal(foreignAddress);
    });

    after(async () => {
      await clientForeignToken.close();
    });
  });
});
