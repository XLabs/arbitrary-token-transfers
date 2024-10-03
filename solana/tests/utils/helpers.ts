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
import { execSync } from 'child_process';
import fs from 'fs/promises';

const LOCALHOST = 'http://localhost:8899';
export const wormholeProgramId = new PublicKey('worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth');
export const tokenBridgeProgramId = new PublicKey('wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb');

export interface ErrorConstructor {
  new (...args: any[]): Error;
}

export const assert = {
  bn: (left: BN) => ({
    equal: (right: BN) => expect(left.toString()).equal(right.toString()),
  }),

  key: (left: PublicKey) => ({
    equal: (right: PublicKey) => expect(left.toString()).equal(right.toString()),
  }),

  chainConfig: (left: ChainConfigAccount) => ({
    equal: (right: ChainConfigAccount) => {
      expect(left.chainId).equal(right.chainId);
      expect(left.canonicalPeer).deep.equal(right.canonicalPeer);
      expect(left.maxGasDropoffMicroToken).equal(right.maxGasDropoffMicroToken);
      expect(left.relayerFeeMicroUsd).equal(right.relayerFeeMicroUsd);
      expect(left.pausedOutboundTransfers).equal(right.pausedOutboundTransfers);
    },
  }),

  promise: (prom: Promise<unknown>) => ({
    fails: async (errorType?: ErrorConstructor) => {
      let result: any;
      try {
        result = await prom;
      } catch (error: any) {
        if (errorType != null && !(error instanceof errorType)) {
          throw { message: 'Error is not of the asked type', stack: error.toString() };
        }
        return;
      }
      throw new Error(`Promise did not fail. Result: ${result}`);
    },
    failsWith: async (message: string) => {
      let result: any;
      try {
        result = await prom;
      } catch (error: any) {
        const errorStr: string = error.toString();
        if (errorStr.includes(message)) {
          return;
        }
        throw { message: 'Error does not contain the asked message', stack: errorStr };
      }
      throw new Error(`Promise did not fail. Result: ${result}`);
    },
  }),

  array: <T>(left: T[]) => ({
    equal: (right: T[]) => {
      left = [...left];
      right = [...right];
      left.sort();
      right.sort();

      expect(left).deep.equal(right);
    },
  }),
};

export async function sendAndConfirmIxs(
  provider: AnchorProvider,
  ...ixs: Array<TransactionInstruction | Promise<TransactionInstruction>>
): Promise<TransactionSignature> {
  const tx = new Transaction().add(...(await Promise.all(ixs)));

  return provider.sendAndConfirm(tx);
}

export function newProvider(keypair?: Keypair): AnchorProvider {
  const connection = new Connection(LOCALHOST, 'processed');
  const wallet = new Wallet(keypair ?? new Keypair());

  return new AnchorProvider(connection, wallet);
}

export async function requestAirdrop(provider: Provider) {
  if (provider.publicKey === undefined) {
    throw new Error('The provider must have a public key to request airdrop');
  }

  //console.log('Airdropping to', provider.publicKey.toString());
  await confirmTransaction(
    provider,
    await provider.connection.requestAirdrop(provider.publicKey, 20 * LAMPORTS_PER_SOL),
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

export async function keypairFromFile(path: string) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(await fs.readFile(path, { encoding: 'utf8' }))),
  );
}

/**
 *
 * @param programKeyPairPath The path to the JSON keypair.
 * @param authorityKeyPairPath The path to the program authority.
 * @param artifactPath The .so file.
 */
export async function deployProgram(
  programKeyPairPath: string,
  authorityKeyPairPath: string,
  artifactPath: string,
) {
  // deploy
  execSync(
    `solana --url localhost -k ${authorityKeyPairPath} program deploy ${artifactPath} --program-id ${programKeyPairPath}`,
  );

  // Wait for deploy to be finalized. Don't remove.
  const programPublicKey = await keypairFromFile(programKeyPairPath).then((kp) => kp.publicKey);
  const connection = AnchorProvider.local().connection;
  let programAccount = null;
  while (programAccount === null) {
    programAccount = await connection.getAccountInfo(programPublicKey, 'finalized');
  }
}

export async function putProgramKeyBackInIdl(programId: string) {
  const idlPath = './target/idl/token_bridge_relayer.json';
  const idlRaw = await fs.readFile(idlPath, 'utf-8');
  const idl = JSON.parse(idlRaw);

  idl.address = programId;

  await fs.writeFile(idlPath, JSON.stringify(idl, null, 2));
}
