import { PartialTx } from '@xlabs-xyz/evm-arbitrary-token-transfers';
import { ethers } from 'ethers';

export function wrapEthersProvider(ethersProvider: ethers.Provider) {
  return {
    ethCall: async ({ to, data }: Omit<PartialTx, 'value'>): Promise<Uint8Array> => {
      const result = await ethersProvider.call({
        to,
        data: ethers.hexlify(data),
      });
      return ethers.getBytes(result);
    },
  };
}
