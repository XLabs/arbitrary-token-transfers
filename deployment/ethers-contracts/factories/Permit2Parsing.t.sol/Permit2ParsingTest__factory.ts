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
import type { NonPayableOverrides } from "../../common";
import type {
  Permit2ParsingTest,
  Permit2ParsingTestInterface,
} from "../../Permit2Parsing.t.sol/Permit2ParsingTest";

const _abi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    name: "log",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "log_address",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256[]",
        name: "val",
        type: "uint256[]",
      },
    ],
    name: "log_array",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "int256[]",
        name: "val",
        type: "int256[]",
      },
    ],
    name: "log_array",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address[]",
        name: "val",
        type: "address[]",
      },
    ],
    name: "log_array",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    name: "log_bytes",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "log_bytes32",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "int256",
        name: "",
        type: "int256",
      },
    ],
    name: "log_int",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "address",
        name: "val",
        type: "address",
      },
    ],
    name: "log_named_address",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "uint256[]",
        name: "val",
        type: "uint256[]",
      },
    ],
    name: "log_named_array",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "int256[]",
        name: "val",
        type: "int256[]",
      },
    ],
    name: "log_named_array",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "address[]",
        name: "val",
        type: "address[]",
      },
    ],
    name: "log_named_array",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "val",
        type: "bytes",
      },
    ],
    name: "log_named_bytes",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "val",
        type: "bytes32",
      },
    ],
    name: "log_named_bytes32",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "int256",
        name: "val",
        type: "int256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "decimals",
        type: "uint256",
      },
    ],
    name: "log_named_decimal_int",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "val",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "decimals",
        type: "uint256",
      },
    ],
    name: "log_named_decimal_uint",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "int256",
        name: "val",
        type: "int256",
      },
    ],
    name: "log_named_int",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "val",
        type: "string",
      },
    ],
    name: "log_named_string",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "key",
        type: "string",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "val",
        type: "uint256",
      },
    ],
    name: "log_named_uint",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    name: "log_string",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "log_uint",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    name: "logs",
    type: "event",
  },
  {
    inputs: [],
    name: "IS_TEST",
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
    name: "excludeArtifacts",
    outputs: [
      {
        internalType: "string[]",
        name: "excludedArtifacts_",
        type: "string[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "excludeContracts",
    outputs: [
      {
        internalType: "address[]",
        name: "excludedContracts_",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "excludeSelectors",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "addr",
            type: "address",
          },
          {
            internalType: "bytes4[]",
            name: "selectors",
            type: "bytes4[]",
          },
        ],
        internalType: "struct StdInvariant.FuzzSelector[]",
        name: "excludedSelectors_",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "excludeSenders",
    outputs: [
      {
        internalType: "address[]",
        name: "excludedSenders_",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "failed",
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
    inputs: [
      {
        internalType: "bytes",
        name: "params",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "offset",
        type: "uint256",
      },
    ],
    name: "parsePermit",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "params",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "offset",
        type: "uint256",
      },
    ],
    name: "parsePermit2Permit",
    outputs: [
      {
        internalType: "uint160",
        name: "",
        type: "uint160",
      },
      {
        internalType: "uint48",
        name: "",
        type: "uint48",
      },
      {
        internalType: "uint48",
        name: "",
        type: "uint48",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "params",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "offset",
        type: "uint256",
      },
    ],
    name: "parsePermit2Transfer",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [],
    name: "targetArtifactSelectors",
    outputs: [
      {
        components: [
          {
            internalType: "string",
            name: "artifact",
            type: "string",
          },
          {
            internalType: "bytes4[]",
            name: "selectors",
            type: "bytes4[]",
          },
        ],
        internalType: "struct StdInvariant.FuzzArtifactSelector[]",
        name: "targetedArtifactSelectors_",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "targetArtifacts",
    outputs: [
      {
        internalType: "string[]",
        name: "targetedArtifacts_",
        type: "string[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "targetContracts",
    outputs: [
      {
        internalType: "address[]",
        name: "targetedContracts_",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "targetInterfaces",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "addr",
            type: "address",
          },
          {
            internalType: "string[]",
            name: "artifacts",
            type: "string[]",
          },
        ],
        internalType: "struct StdInvariant.FuzzInterface[]",
        name: "targetedInterfaces_",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "targetSelectors",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "addr",
            type: "address",
          },
          {
            internalType: "bytes4[]",
            name: "selectors",
            type: "bytes4[]",
          },
        ],
        internalType: "struct StdInvariant.FuzzSelector[]",
        name: "targetedSelectors_",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "targetSenders",
    outputs: [
      {
        internalType: "address[]",
        name: "targetedSenders_",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8",
      },
    ],
    name: "testParsePermit",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint160",
        name: "amount",
        type: "uint160",
      },
      {
        internalType: "uint48",
        name: "expiration",
        type: "uint48",
      },
      {
        internalType: "uint48",
        name: "nonce",
        type: "uint48",
      },
      {
        internalType: "uint256",
        name: "sigDeadline",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "testParsePermit2Permit",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "sigDeadline",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "testParsePermit2Transfer",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
] as const;

const _bytecode =
  "0x60808060405234602c57600160ff198181600c541617600c55601f541617601f556117d790816100328239f35b600080fdfe608080604052600436101561001357600080fd5b600090813560e01c9081631ed7831c14610f8a575080632ade388014610dbc578063303dd4ba14610c495780633acd8ef1146109875780633e5e3c23146109085780633f7286f41461088957806366d9a9a01461076557806385226c81146106d55780638972423914610669578063916a17c6146105c0578063b00ade3d1461056c578063b0464fdc146104c3578063b5508aa914610433578063ba414fa61461040e578063e20c9f711461037f578063eb4d51d21461018b578063eecedab51461010c5763fa7626d4146100e757600080fd5b34610109578060031936011261010957602060ff601f54166040519015158152f35b80fd5b503461010957602061011d36611206565b91829150019060816101806040516041815260416040860187830137601f19608082011695869586604052803560601c8752601481013560d01c82880152601a81013560d01c60408801520135606086015260c0608086015260c085019061106f565b910160a08301520390f35b50346101095760803660031901126101095760243560043560443567ffffffffffffffff60643581811161036c576101c7903690600401611118565b90856041835114737109709ecfa91a80626ff3989d68f67f5b1dd12d90813b1561037b578290602460405180948193632631f2b160e11b835260048301525afa801561037057610358575b50506040519284602085015285604085015280606085015261025260808585516102428184840160208a0161104c565b81010360608101875201856110da565b60405191638972423960e01b835260406004840152878380610277604482018961106f565b8360248301520381305afa95861561034d57889089918a938b968c9a6102ca575b50506102c7996102c0979695936102b66102bb96946102b69461168f565b61168f565b611732565b519061168f565b80f35b959950969550509150503d8089843e6102e381846110da565b82019560a083880312610349578251926020810151976040820151996060830151978811610345576102c79a6102b66102bb96608061032a6102b6966102c09d89016113d0565b960151989c9295989c94509496505093959697819b50610298565b8b80fd5b8880fd5b6040513d8a823e3d90fd5b610361906110c6565b61036c578538610212565b8580fd5b6040513d84823e3d90fd5b8280fd5b5034610109578060031936011261010957604051601580548083529083526020808301937f55f448fdea98c4d29eb340757ef0a66cd03dbb9538908a6a81d96026b71ec47592915b8282106103ee576103ea856103de818903826110da565b60405191829182611007565b0390f35b83546001600160a01b0316865294850194600193840193909101906103c7565b503461010957806003193601126101095760206104296115ed565b6040519015158152f35b5034610109578060031936011261010957601954610450816112d2565b61045d60405191826110da565b8181526020916020820160196000527f944998273e477b495144fb8794c914197f3ccb46be2900f4698fd0ef743c9695936000915b8383106104a757604051806103ea87826111a2565b60018281926104b5896112ea565b815201960192019194610492565b5034610109578060031936011261010957601c546104e0816112d2565b906104ee60405192836110da565b808252601c83527f0e4562a10381dec21b205ed72637e6b1b523bdd0e4d4d50af5cd23dd4500a2119260208084015b83831061053257604051806103ea8782611254565b60028260019260405161054481611094565b848060a01b038a5416815261055a858b01611415565b8382015281520196019201919461051d565b50346101095760c0608161057f36611206565b9291839150019160806040519380358552602081013560208601526040810135604086015260608101356060860152013560f81c60808401520160a0820152f35b5034610109578060031936011261010957601d546105dd816112d2565b906105eb60405192836110da565b808252601d83527f6d4407e7be21f808e6509aa9fa9143369579dd7d760fe20a2c09680fc146134f9260208084015b83831061062f57604051806103ea8782611254565b60028260019260405161064181611094565b848060a01b038a54168152610657858b01611415565b8382015281520196019201919461061a565b503461010957604061067a36611206565b91829150019060a16106ca8451604181526041606086016020830137601f19608082011695869586825280358752602081013560208801520135604086015260a0606086015260a085019061106f565b910160808301520390f35b5034610109578060031936011261010957601a546106f2816112d2565b6106ff60405191826110da565b81815260209160208201601a6000527f057c384a7d1c54f3a1b2e5e67b2617b8224fdfd1ea7234eea573a6ff665ff63e936000915b83831061074957604051806103ea87826111a2565b6001828192610757896112ea565b815201960192019194610734565b5034610109578060031936011261010957601b54610782816112d2565b9061079060405192836110da565b808252601b835260209283830191817f3ad8aa4f87544323a9d1e5dd902f40c356527a7955687113db5f9a85ad579dc1845b8383106108475750505050604051928484019085855251809152604084019460408260051b8601019392955b8287106107fb5785850386f35b909192938280610837600193603f198a820301865288519083610827835160408452604084019061106f565b9201519084818403910152611164565b96019201960195929190926107ee565b60028860019260409a99979a5161085d81611094565b610866866112ea565b8152610873858701611415565b83820152815201920192019190969395966107c2565b5034610109578060031936011261010957604051601780548083529083526020808301937fc624b66cc0138b8fabc209247f72d758e1cf3343756d543badbf24212bed8c1592915b8282106108e8576103ea856103de818903826110da565b83546001600160a01b0316865294850194600193840193909101906108d1565b5034610109578060031936011261010957604051601880548083529083526020808301937fb13d2d76d1f4b7be834882e410b3e3a8afaf69f83600ae24db354391d2378d2e92915b828210610967576103ea856103de818903826110da565b83546001600160a01b031686529485019460019384019390910190610950565b50346101095760a0366003190112610109576004356001600160a01b03811690819003610c455765ffffffffffff6024351690816024350361037b5765ffffffffffff604435166044350361037b5760843567ffffffffffffffff8111610c41576109f6903690600401611118565b6041815114737109709ecfa91a80626ff3989d68f67f5b1dd12d3b15610c3d5760405190632631f2b160e11b825260048201528481602481737109709ecfa91a80626ff3989d68f67f5b1dd12d5afa8015610c3257610c1f575b50604051906bffffffffffffffffffffffff1960043560601b16602083015265ffffffffffff60d01b8060243560d01b16603484015260443560d01b16603a8301526064356040830152610ac26060838351610ab2818484016020880161104c565b81010360408101855201836110da565b60405163eecedab560e01b815260406004820152858180610ae6604482018761106f565b8360248301520381305afa938415610c1457869087889189938a958b99610b59575b5092610b3d6102c79a65ffffffffffff6102c099989795610b37610b50966102bb9960018060a01b031661168f565b1661168f565b65ffffffffffff8060443516911661168f565b6064359061168f565b9850509493505050503d8087863e610b7181866110da565b84019160c085840312610c10578451906001600160a01b0382168203610c0c57610b9d602087016113bd565b95610baa604082016113bd565b91606082015160808301519167ffffffffffffffff8311610345576102c79a65ffffffffffff6102bb96610b37610b3d9460a0610bef6102c09e610b509a8c016113d0565b9901519a9e9296989a9e9699509650509597989950509a50610b08565b8780fd5b8680fd5b6040513d88823e3d90fd5b610c2b909491946110c6565b9238610a50565b6040513d87823e3d90fd5b8480fd5b8380fd5b5080fd5b50346101095760a03660031901126101095760243560043560843560ff8116604435606435828403610c10576040519385602086015286604086015282606086015281608086015260ff60f81b9060f81b1660a08501526081845260c084019184831067ffffffffffffffff841117610da857604083815263b00ade3d60e01b845260c486015260c083610ce161010488018861106f565b8a60e48901528760bf1991030181305afa95861561034d578897898a928b9a8c978d9b610d32575b5094610b3794610d2d60ff98956102c79e956102b6610d2d966102c09e9d9b61168f565b6116e5565b959a50509950509493505060c0853d60c011610da0575b81610d5660c093856110da565b81010312610c0c575160e08501519661010086015192610120870151986101408801519060ff82168203610345576101608901519490959a9194999496979295919a939038610d09565b3d9150610d49565b634e487b7160e01b88526041600452602488fd5b5034610109578060031936011261010957601e54610dd9816112d2565b90610de760405192836110da565b8082526020918281018092601e86527f50bb669a95c7b50b7e8a6f09454034b2b14cf2b85c730dca9a539ca82cb6e35086925b828410610eed57505050506040519280840191818552518092526040840160059060408460051b870101949680925b858410610e565787870388f35b90919293809596603f1989820301855289519082604082019260018060a01b0381511683520151916040848301528251809152606090848284019282881b850101940192875b828110610ebf57505050505090806001929a019401940192979594939190610e49565b91939580610edb6001939597605f19878203018952895161106f565b970195019101918a9594939192610e9c565b866040989795969851610eff81611094565b83546001600160a01b0316815260018481018054909190610f1f816112d2565b92610f2d60405194856110da565b8184528c52848c208c8685015b838210610f655750505050509281600194846002959401528152019201930192909694939596610e1a565b9380959697839495610f788394956112ea565b815201930191018b9695949392610f3a565b905034610c455781600319360112610c4557601680548083529083526020808301937fd833147d7dc355ba459fc788f669e58cfaf9dc25ddcd0702e87d69c7b512428992915b828210610fe7576103ea856103de818903826110da565b83546001600160a01b031686529485019460019384019390910190610fd0565b602090602060408183019282815285518094520193019160005b82811061102f575050505090565b83516001600160a01b031685529381019392810192600101611021565b60005b83811061105f5750506000910152565b818101518382015260200161104f565b906020916110888151809281855285808601910161104c565b601f01601f1916010190565b6040810190811067ffffffffffffffff8211176110b057604052565b634e487b7160e01b600052604160045260246000fd5b67ffffffffffffffff81116110b057604052565b90601f8019910116810190811067ffffffffffffffff8211176110b057604052565b67ffffffffffffffff81116110b057601f01601f191660200190565b81601f8201121561115f5780359061112f826110fc565b9261113d60405194856110da565b8284526020838301011161115f57816000926020809301838601378301015290565b600080fd5b90815180825260208080930193019160005b828110611184575050505090565b83516001600160e01b03191685529381019392810192600101611176565b6020808201906020835283518092526040830192602060408460051b8301019501936000915b8483106111d85750505050505090565b90919293949584806111f6600193603f198682030187528a5161106f565b98019301930191949392906111c8565b90604060031983011261115f5760043567ffffffffffffffff9283821161115f578060238301121561115f57816004013593841161115f576024848301011161115f57602401919060243590565b6020808201908083528351809252604092604081018260408560051b8401019601946000925b85841061128b575050505050505090565b9091929394959685806112c1600193603f1986820301885286838d51878060a01b03815116845201519181858201520190611164565b99019401940192959493919061127a565b67ffffffffffffffff81116110b05760051b60200190565b9060405190600083549060018260011c90600184169687156113b3575b602094858410891461139f578798848997989952908160001461137d575060011461133e575b50505061133c925003836110da565b565b600090815285812095935091905b81831061136557505061133c935082010138808061132d565b8554888401850152948501948794509183019161134c565b9250505061133c94925060ff191682840152151560051b82010138808061132d565b634e487b7160e01b85526022600452602485fd5b91607f1691611307565b519065ffffffffffff8216820361115f57565b81601f8201121561115f5780516113e6816110fc565b926113f460405194856110da565b8184526020828401011161115f57611412916020808501910161104c565b90565b9060409160405180938254928383526020918284019160005282600020946000915b816007840110611576575061133c95549184828210611558575b82821061153a575b82821061151c575b8282106114fe575b8282106114e0575b8282106114c2575b8282106114a6575b5010611492575b50905003836110da565b6001600160e01b0319168152018038611488565b83811b6001600160e01b03191685529093019260010184611481565b604084901b6001600160e01b03191685529093019260010184611479565b606084901b6001600160e01b03191685529093019260010184611471565b608084901b6001600160e01b03191685529093019260010184611469565b60a084901b6001600160e01b03191685529093019260010184611461565b60c084901b6001600160e01b03191685529093019260010184611459565b60e084901b6001600160e01b03191685529093019260010184611451565b86546001600160e01b031960e082811b8216875260c083811b83168989015260a084811b8416868a0152608085811b85166060808c019190915286901b8516908a015284861b84169089015283891b8316908801529116908501526001909601958895506101009093019260089290920191611437565b60085460ff1680156115fc5790565b50604051630667f9d760e41b8152602081604481737109709ecfa91a80626ff3989d68f67f5b1dd12d8060048301526519985a5b195960d21b60248301525afa90811561168357600091611651575b50151590565b90506020813d60201161167b575b8161166c602093836110da565b8101031261115f57513861164b565b3d915061165f565b6040513d6000823e3d90fd5b737109709ecfa91a80626ff3989d68f67f5b1dd12d91823b1561115f576044600092604051948593849263260a5b1560e21b8452600484015260248301525afa8015611683576116dc5750565b61133c906110c6565b737109709ecfa91a80626ff3989d68f67f5b1dd12d91823b1561115f5760446000926040519485938492637c84c69b60e01b8452600484015260248301525afa8015611683576116dc5750565b737109709ecfa91a80626ff3989d68f67f5b1dd12d91823b1561115f576117909261177e60009360405195869485938493639762463160e01b855260406004860152604485019061106f565b8381036003190160248501529061106f565b03915afa8015611683576116dc575056fea2646970667358221220424bfc690beffa1cdb9ecf62b6f2932d3d0f3c81bdd308da781c633a38ab65e064736f6c63430008190033";

type Permit2ParsingTestConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: Permit2ParsingTestConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class Permit2ParsingTest__factory extends ContractFactory {
  constructor(...args: Permit2ParsingTestConstructorParams) {
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
      Permit2ParsingTest & {
        deploymentTransaction(): ContractTransactionResponse;
      }
    >;
  }
  override connect(runner: ContractRunner | null): Permit2ParsingTest__factory {
    return super.connect(runner) as Permit2ParsingTest__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): Permit2ParsingTestInterface {
    return new Interface(_abi) as Permit2ParsingTestInterface;
  }
  static connect(
    address: string,
    runner?: ContractRunner | null
  ): Permit2ParsingTest {
    return new Contract(address, _abi, runner) as unknown as Permit2ParsingTest;
  }
}
