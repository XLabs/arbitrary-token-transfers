/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import {
  Contract,
  ContractFactory,
  ContractTransactionResponse,
  Interface,
} from "ethers";
import type { Signer, ContractDeployTransaction, ContractRunner } from "ethers";
import type { NonPayableOverrides } from "../common";
import type { MockERC721, MockERC721Interface } from "../MockERC721";

const _abi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "_owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "_approved",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "_tokenId",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "_owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "_operator",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "_approved",
        type: "bool",
      },
    ],
    name: "ApprovalForAll",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "_from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "_to",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "_tokenId",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "getApproved",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "name_",
        type: "string",
      },
      {
        internalType: "string",
        name: "symbol_",
        type: "string",
      },
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
    ],
    name: "isApprovedForAll",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "ownerOf",
    outputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        internalType: "bool",
        name: "approved",
        type: "bool",
      },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "tokenURI",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const _bytecode =
  "0x60808060405234601557610ec8908161001b8239f35b600080fdfe608060408181526004918236101561001657600080fd5b600092833560e01c91826301ffc9a714610a8c5750816306fdde03146109db578163081812fc146109a9578163095ea7b3146108f957816323b872dd146108e657816342842e0e1461082b5781634cd88b76146104f05781636352211e1461048557816370a082311461041257816395d89b4114610320578163a22cb4651461029b578163b88d4fde1461016e57508063c87b56dd1461010f5763e985e9c5146100bf57600080fd5b3461010b578060031936011261010b5760ff816020936100dd610b37565b6100e5610b52565b6001600160a01b0391821683526005875283832091168252855220549151911615158152f35b5080fd5b503461010b5760208060031936011261016a579181519283916020835260605191826020850152815b838110610155575050828201840152601f01601f19168101030190f35b60808101518782018701528694508101610138565b8280fd5b9050608036600319011261016a57610184610b37565b9061018d610b52565b60443560643567ffffffffffffffff81116102975736602382011215610297576101c09036906024818701359101610bd5565b916101cc828287610cb1565b803b159485156101e4575b876101e187610e53565b80f35b6020939495508760018060a01b03809261022d8a5198899788968794630a85bd0160e11b9d8e875233908701521660248501526044840152608060648401526084830190610af7565b0393165af190811561028a576101e19350849161025b575b506001600160e01b0319161438808080806101d7565b61027d915060203d602011610283575b6102758183610b9d565b810190610e33565b38610245565b503d61026b565b50505051903d90823e3d90fd5b8680fd5b50503461010b578060031936011261010b576102b5610b37565b906024359081151580920361031c5733845260056020528084209260018060a01b03169283855260205280842060ff1981541660ff8416179055519081527f17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c3160203392a380f35b8380fd5b82843461040f578060031936011261040f5781519182826001936001549461034786610c3a565b91828552602096876001821691826000146103e857505060011461038c575b5050506103889291610379910385610b9d565b51928284938452830190610af7565b0390f35b9190869350600183527fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf65b8284106103d05750505082010181610379610388610366565b8054848a0186015288955087949093019281016103b7565b60ff19168782015293151560051b8601909301935084925061037991506103889050610366565b80fd5b8391503461010b57602036600319011261010b576001600160a01b03610436610b37565b169081156104535760208480858581526003845220549051908152f35b606490602085519162461bcd60e51b8352820152600c60248201526b5a45524f5f4144445245535360a01b6044820152fd5b9050823461040f57602036600319011261040f57813581526002602052829020546001600160a01b03169081156104c0575060209151908152f35b606490602084519162461bcd60e51b8352820152600a6024820152691393d517d3525395115160b21b6044820152fd5b8391503461010b578260031936011261010b5767ffffffffffffffff813581811161031c576105229036908401610c1c565b916024358281116108275761053a9036908301610c1c565b9460ff600654166107ee575082518281116107db578061055a8654610c3a565b94601f95868111610770575b506020908683116001146106ef5787926106e4575b50508160011b916000199060031b1c19161784555b84519182116106d157506001916105a78354610c3a565b81811161066f575b5060209082116001146105f4578394829394926105e9575b5050600019600383901b1c191690821b1781555b60ff19600654161760065580f35b0151905084806105c7565b8284527fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf690601f198316855b8181106106595750958385969710610640575b505050811b0181556105db565b015160001960f88460031b161c19169055848080610633565b8783015184559285019260209283019201610620565b8385527fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf68280850160051c820192602086106106c8575b0160051c019084905b8281106106bd5750506105af565b8681550184906106af565b925081926106a6565b634e487b7160e01b845260419052602483fd5b01519050878061057b565b8780527f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e5639250601f198416885b818110610758575090846001959493921061073f575b505050811b018455610590565b015160001960f88460031b161c19169055878080610732565b9293602060018192878601518155019501930161071c565b9091508680527f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e5638680850160051c820192602086106107d2575b9085949392910160051c01905b8181106107c45750610566565b8881558493506001016107b7565b925081926107aa565b634e487b7160e01b855260418252602485fd5b906020606492519162461bcd60e51b835282015260136024820152721053149150511657d253925512505312569151606a1b6044820152fd5b8480fd5b905061083636610b68565b906108448282859695610cb1565b803b15938415610859575b866101e186610e53565b60209293945060a4908760018060a01b03809489519788968795630a85bd0160e11b9b8c88523390880152166024860152604485015260806064850152826084850152165af190811561028a576101e1935084916108c7575b506001600160e01b031916143880808061084f565b6108e0915060203d602011610283576102758183610b9d565b386108b2565b836101e16108f336610b68565b91610cb1565b90508160031936011261016a5761090e610b37565b602435808552600260205283852054909391926001600160a01b039182169290338414801561098a575b61094190610c74565b8587526020528520921691826bffffffffffffffffffffffff60a01b8254161790557f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258480a480f35b508387526005602090815282882033895290528187205460ff16610938565b90503461016a57602036600319011261016a57803583526020908152918190205490516001600160a01b039091168152f35b82843461040f578060031936011261040f57815191828283546109fd81610c3a565b90818452602095600191876001821691826000146103e8575050600114610a31575050506103889291610379910385610b9d565b91908693508280527f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e5635b828410610a745750505082010181610379610388610366565b8054848a018601528895508794909301928101610a5b565b84913461016a57602036600319011261016a573563ffffffff60e01b811680910361016a57602092506301ffc9a760e01b8114908115610ae6575b8115610ad5575b5015158152f35b635b5e139f60e01b14905083610ace565b6380ac58cd60e01b81149150610ac7565b919082519283825260005b848110610b23575050826000602080949584010152601f8019910116010190565b602081830181015184830182015201610b02565b600435906001600160a01b0382168203610b4d57565b600080fd5b602435906001600160a01b0382168203610b4d57565b6060906003190112610b4d576001600160a01b03906004358281168103610b4d57916024359081168103610b4d579060443590565b90601f8019910116810190811067ffffffffffffffff821117610bbf57604052565b634e487b7160e01b600052604160045260246000fd5b92919267ffffffffffffffff8211610bbf5760405191610bff601f8201601f191660200184610b9d565b829481845281830111610b4d578281602093846000960137010152565b9080601f83011215610b4d57816020610c3793359101610bd5565b90565b90600182811c92168015610c6a575b6020831014610c5457565b634e487b7160e01b600052602260045260246000fd5b91607f1691610c49565b15610c7b57565b60405162461bcd60e51b815260206004820152600e60248201526d1393d517d055551213d49256915160921b6044820152606490fd5b6000838152600260209081526040808320546001600160a01b0395948616949086168503610e02578516948515610dca57610cfe90853314908115610dad575b8115610d97575b50610c74565b838352600382528083208054908115610d8357600019918201905585845260038352818420805490918114610d835760010190558583526002825280832080546001600160a01b0319908116871790915560049092528220805490911690557fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9080a4565b634e487b7160e01b85526011600452602485fd5b9050878552600484528285205416331438610cf8565b8686526005855283862033875285528386205460ff169150610cf1565b815162461bcd60e51b81526004810184905260116024820152701253959053125117d49150d25412515395607a1b6044820152606490fd5b815162461bcd60e51b815260048101849052600a60248201526957524f4e475f46524f4d60b01b6044820152606490fd5b90816020910312610b4d57516001600160e01b031981168103610b4d5790565b15610e5a57565b60405162461bcd60e51b815260206004820152601060248201526f155394d0519157d49150d2541251539560821b6044820152606490fdfea264697066735822122064af0122b0695ee176f4d42e936bff434d343d6e981ed3fbff04527b5342491064736f6c63430008190033";

type MockERC721ConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: MockERC721ConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class MockERC721__factory extends ContractFactory {
  constructor(...args: MockERC721ConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override getDeployTransaction(
    overrides?: NonPayableOverrides & { from?: string }
  ): Promise<ContractDeployTransaction> {
    return super.getDeployTransaction(overrides || {});
  }
  override deploy(overrides?: NonPayableOverrides & { from?: string }) {
    return super.deploy(overrides || {}) as Promise<
      MockERC721 & {
        deploymentTransaction(): ContractTransactionResponse;
      }
    >;
  }
  override connect(runner: ContractRunner | null): MockERC721__factory {
    return super.connect(runner) as MockERC721__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): MockERC721Interface {
    return new Interface(_abi) as MockERC721Interface;
  }
  static connect(address: string, runner?: ContractRunner | null): MockERC721 {
    return new Contract(address, _abi, runner) as unknown as MockERC721;
  }
}
