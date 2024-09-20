import { AnchorProvider, BN, Wallet, Provider } from '@coral-xyz/anchor';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  Connection,
  LAMPORTS_PER_SOL,
  Keypair,
  RpcResponseAndContext,
  SignatureResult,
} from '@solana/web3.js';
import { ChainConfigAccount } from '@xlabs-xyz/solana-arbitrary-token-transfers';
import { expect } from 'chai';

const LOCALHOST = 'http://localhost:8899';
export const wormholeProgramId = new PublicKey('worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth');
export const tokenBridgeProgramId = new PublicKey('wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb');

export interface ErrorConstructor {
  new (...args: any[]): Error;
}

export async function assertResolveFailure(
  promise: Promise<unknown>,
  errorType?: ErrorConstructor,
): Promise<void> {
  let result: any;
  try {
    result = await promise;
  } catch (error) {
    if (errorType != null && !(error instanceof errorType)) {
      throw error;
    }
    return;
  }
  throw new Error(`Did not fail. Result: ${result}`);
}

export function assertEqChainConfigs(
  left: ChainConfigAccount,
  right: Omit<ChainConfigAccount, 'bump'>,
) {
  expect(Buffer.from(left.canonicalPeer).toString('hex')).equal(
    Buffer.from(right.canonicalPeer).toString('hex'),
  );
  expect(left.maxGasDropoffMicroToken).equal(right.maxGasDropoffMicroToken);
  expect(left.pausedOutboundTransfers).equal(right.pausedOutboundTransfers);
  expect(left.relayerFeeMicroUsd).equal(right.relayerFeeMicroUsd);
}

export function assertEqKeys(left: PublicKey, right: PublicKey) {
  expect(left.toString()).equal(right.toString());
}

export function assertEqBns(left: BN, right: BN) {
  expect(left.toString()).equal(right.toString());
}

export async function sendAndConfirmIx(
  ix: TransactionInstruction | Promise<TransactionInstruction>,
  provider: AnchorProvider,
): Promise<TransactionSignature> {
  const tx = new Transaction().add(await ix);

  return provider.sendAndConfirm(tx);
}

export function newProvider(): AnchorProvider {
  const connection = new Connection(LOCALHOST, 'processed');
  const wallet = new Wallet(new Keypair());

  return new AnchorProvider(connection, wallet);
}

export async function requestAirdrop(provider: Provider) {
  if (provider.publicKey === undefined) {
    throw new Error('The provider must have a public key to request airdrop');
  }

  await confirmTransaction(
    provider,
    await provider.connection.requestAirdrop(provider.publicKey, 10 * LAMPORTS_PER_SOL),
  );
}

export async function confirmTransaction(
  provider: Provider,
  signature: TransactionSignature,
): Promise<RpcResponseAndContext<SignatureResult>> {
  const latestBlockHash = await provider.connection.getLatestBlockhash();

  return provider.connection.confirmTransaction({
    signature,
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
  });
}
