/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/token_bridge_relayer.json`.
 */
export type TokenBridgeRelayer = {
  "address": "7TLiBkpDGshV4o3jmacTCx93CLkmo3VjZ111AsijN9f8",
  "metadata": {
    "name": "tokenBridgeRelayer",
    "version": "3.0.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addAdmin",
      "docs": [
        "Adds a new admin account."
      ],
      "discriminator": [
        177,
        236,
        33,
        205,
        124,
        152,
        55,
        186
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "The signer must be the owner."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "tbrConfig"
          ]
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`owner`] specified",
            "in the context equals the owner role stored in the config."
          ]
        },
        {
          "name": "authBadge",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  98,
                  97,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "newAdmin"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "cancelOwnerTransferRequest",
      "docs": [
        "The owner role transfer is cancelled by the current one."
      ],
      "discriminator": [
        0,
        246,
        43,
        198,
        0,
        116,
        66,
        246
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "tbrConfig"
          ]
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`signer`] specified",
            "in the context equals a pubkey specified in this account. Mutable,",
            "because we will update roles depending on the operation."
          ],
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "completeTransfer",
      "docs": [
        "Complete a transfer initiated from another chain."
      ],
      "discriminator": [
        98,
        39,
        123,
        229,
        202,
        12,
        82,
        182
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Payer will pay for completing the Wormhole transfer tokens and create temporary",
            "token account."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "tbrConfig",
          "docs": [
            "This program's config."
          ]
        },
        {
          "name": "mint",
          "docs": [
            "Mint info. This is the SPL token that will be bridged over to the",
            "foreign contract. Mutable.",
            "",
            "In the case of a native transfer, it's the mint for the token wrapped by Wormhole;",
            "in the case of a wrapped transfer, it's the native SPL token mint."
          ],
          "writable": true
        },
        {
          "name": "recipientTokenAccount",
          "docs": [
            "Recipient associated token account. The recipient authority check",
            "is necessary to ensure that the recipient is the intended recipient",
            "of the bridged tokens. Mutable."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipient",
          "docs": [
            "transaction. This instruction verifies that the recipient key",
            "passed in this context matches the intended recipient in the vaa."
          ],
          "writable": true
        },
        {
          "name": "vaa",
          "docs": [
            "Verified Wormhole message account. Read-only."
          ]
        },
        {
          "name": "temporaryAccount",
          "docs": [
            "Program's temporary token account. This account is created before the",
            "instruction is invoked to temporarily take custody of the payer's",
            "tokens. When the tokens are finally bridged in, the tokens will be",
            "transferred to the destination token accounts. This account will have",
            "zero balance and can be closed."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  109,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "peer"
        },
        {
          "name": "tokenBridgeConfig"
        },
        {
          "name": "tokenBridgeClaim",
          "docs": [
            "is true if the bridged assets have been claimed. If the transfer has",
            "not been redeemed, this account will not exist yet.",
            "",
            "NOTE: The Token Bridge program's claim account is only initialized when",
            "a transfer is redeemed (and the boolean value `true` is written as",
            "its data)."
          ],
          "writable": true
        },
        {
          "name": "tokenBridgeForeignEndpoint",
          "docs": [
            "endpoint per chain, but the PDA allows for multiple endpoints for each",
            "chain! We store the proper endpoint for the emitter chain."
          ]
        },
        {
          "name": "tokenBridgeCustody",
          "docs": [
            "account that holds this mint's balance. This account needs to be",
            "unchecked because a token account may not have been created for this",
            "mint yet. Mutable.",
            "",
            "# Exclusive",
            "",
            "Native transfer only."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenBridgeCustodySigner",
          "docs": [
            "",
            "# Exclusive",
            "",
            "Native transfer only."
          ],
          "optional": true
        },
        {
          "name": "tokenBridgeMintAuthority",
          "docs": [
            "",
            "# Exclusive",
            "",
            "Wrapped transfer only."
          ],
          "optional": true
        },
        {
          "name": "tokenBridgeWrappedMeta",
          "docs": [
            "about the token from its native chain:",
            "* Wormhole Chain ID",
            "* Token's native contract address",
            "* Token's native decimals",
            "",
            "# Exclusive",
            "",
            "Wrapped transfer only."
          ],
          "optional": true
        },
        {
          "name": "wormholeRedeemer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  100,
                  101,
                  101,
                  109,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "wormholeProgram",
          "address": "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5"
        },
        {
          "name": "tokenBridgeProgram",
          "address": "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "confirmOwnerTransferRequest",
      "docs": [
        "The new owner confirms to be so."
      ],
      "discriminator": [
        206,
        156,
        150,
        150,
        227,
        18,
        31,
        184
      ],
      "accounts": [
        {
          "name": "newOwner",
          "writable": true,
          "signer": true
        },
        {
          "name": "authBadgeNewOwner",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  98,
                  97,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "newOwner"
              }
            ]
          }
        },
        {
          "name": "authBadgePreviousOwner",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  98,
                  97,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "tbr_config.owner",
                "account": "tbrConfigState"
              }
            ]
          }
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`signer`] specified",
            "in the context equals a pubkey specified in this account. Mutable,",
            "because we will update roles depending on the operation."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "deployer",
          "docs": [
            "Since we are passing on the upgarde authority, the original deployer is the only one",
            "who can initialize the program."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "docs": [
            "The designated owner of the program."
          ]
        },
        {
          "name": "authBadge",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  98,
                  97,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Owner Config account. This program requires that the `owner` specified",
            "in the context equals the pubkey specified in this account. Mutable."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "programData",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  229,
                  130,
                  69,
                  46,
                  141,
                  178,
                  231,
                  56,
                  213,
                  199,
                  161,
                  79,
                  236,
                  191,
                  130,
                  165,
                  181,
                  246,
                  134,
                  44,
                  135,
                  169,
                  19,
                  212,
                  103,
                  182,
                  152,
                  69,
                  169,
                  9,
                  75
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                2,
                168,
                246,
                145,
                78,
                136,
                161,
                176,
                226,
                16,
                21,
                62,
                247,
                99,
                174,
                43,
                0,
                194,
                185,
                61,
                22,
                193,
                36,
                210,
                192,
                83,
                122,
                16,
                4,
                128,
                0,
                0
              ]
            }
          }
        },
        {
          "name": "wormholeSender",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  110,
                  100,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "wormholeRedeemer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  100,
                  101,
                  101,
                  109,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "bpfLoaderUpgradeable",
          "address": "BPFLoaderUpgradeab1e11111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feeRecipient",
          "type": "pubkey"
        },
        {
          "name": "admins",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "registerPeer",
      "docs": [
        "Register a new peer for the given chain. If this peer is the first one to be registered",
        "on this chain,  it becomes the canonical peer for this chain.",
        "",
        "# Authorization",
        "",
        "Owner or Admin."
      ],
      "discriminator": [
        171,
        229,
        187,
        70,
        101,
        216,
        224,
        55
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "Owner or admin of the program as set in the [`TbrConfig`] account."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "authBadge",
          "docs": [
            "Proof that the signer is authorized."
          ]
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Owner Config account. This program requires that the `signer` specified",
            "in the context equals an authorized pubkey specified in this account."
          ]
        },
        {
          "name": "peer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "chainId"
              },
              {
                "kind": "arg",
                "path": "peerAddress"
              }
            ]
          }
        },
        {
          "name": "chainConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  97,
                  105,
                  110,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "arg",
                "path": "chainId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "chainId",
          "type": "u16"
        },
        {
          "name": "peerAddress",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "relayingFee",
      "docs": [
        "Returns a quote for a transfer, in µUSD."
      ],
      "discriminator": [
        140,
        90,
        50,
        203,
        107,
        172,
        183,
        250
      ],
      "accounts": [
        {
          "name": "tbrConfig",
          "docs": [
            "This program's config."
          ]
        },
        {
          "name": "chainConfig",
          "docs": [
            "The peer config. We need to verify that the transfer is sent to the",
            "canonical peer."
          ]
        },
        {
          "name": "oracleConfig"
        },
        {
          "name": "oracleEvmPrices",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  109,
                  112,
                  114,
                  105,
                  99,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "chain_config.chain_id",
                "account": "chainConfigState"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "dropoffAmountMicro",
          "type": "u32"
        }
      ],
      "returns": "u64"
    },
    {
      "name": "removeAdmin",
      "docs": [
        "Removes a previously added admin account."
      ],
      "discriminator": [
        74,
        202,
        71,
        106,
        252,
        31,
        72,
        183
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "The signer can be the owner or an admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "authBadge",
          "docs": [
            "Proof that the signer is authorized."
          ]
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`owner`] specified",
            "in the context equals the owner role stored in the config."
          ]
        },
        {
          "name": "authBadgeToBeRemoved",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "setPauseForOutboundTransfers",
      "docs": [
        "Forbids or allows any outbound transfer, *i.e.* from this chain.",
        "",
        "# Authorization",
        "",
        "Owner or Admin."
      ],
      "discriminator": [
        3,
        124,
        126,
        64,
        254,
        110,
        150,
        6
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "Owner as set in the [`TbrConfig`] account, or an admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "authBadge",
          "docs": [
            "Proof that the signer is authorized."
          ]
        },
        {
          "name": "chainConfig",
          "writable": true
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`signer`] specified",
            "in the context equals a pubkey specified in this account. Mutable,",
            "because we will update roles depending on the operation."
          ]
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "submitOwnerTransferRequest",
      "docs": [
        "Updates the owner account. This needs to be either cancelled or approved."
      ],
      "discriminator": [
        99,
        58,
        140,
        229,
        113,
        201,
        237,
        47
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "tbrConfig"
          ]
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`signer`] specified",
            "in the context equals a pubkey specified in this account. Mutable,",
            "because we will update roles depending on the operation."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "transferTokens",
      "docs": [
        "# Parameters",
        "",
        "- `dropoff_amount_micro`: the dropoff in µ-target-token.",
        "- `max_fee_lamports`: the maximum fee the user is willing to pay, in lamports."
      ],
      "discriminator": [
        54,
        180,
        238,
        175,
        74,
        85,
        126,
        188
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Payer will pay Wormhole fee to transfer tokens and create temporary",
            "token account."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "tbrConfig",
          "docs": [
            "This program's config."
          ]
        },
        {
          "name": "chainConfig",
          "docs": [
            "The peer config. We need to verify that the transfer is sent to the",
            "canonical peer."
          ]
        },
        {
          "name": "mint",
          "docs": [
            "Mint info. This is the SPL token that will be bridged over to the",
            "canonical peer. Mutable.",
            "",
            "In the case of a native transfer, it's the native mint; in the case of a",
            "wrapped transfer, it's the token wrapped by Wormhole."
          ],
          "writable": true
        },
        {
          "name": "userTokenAccount",
          "docs": [
            "Payer's token account. It holds the SPL token that will be transferred."
          ],
          "writable": true
        },
        {
          "name": "temporaryAccount",
          "docs": [
            "Program's temporary token account. This account is created before the",
            "instruction is invoked to temporarily take custody of the payer's",
            "tokens. When the tokens are finally bridged out, the token account",
            "will have zero balance and can be closed."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  109,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "feeRecipient",
          "docs": [
            "Fee recipient's account. The fee will be transferred to this account."
          ],
          "writable": true,
          "relations": [
            "tbrConfig"
          ]
        },
        {
          "name": "oracleConfig"
        },
        {
          "name": "oracleEvmPrices",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  109,
                  112,
                  114,
                  105,
                  99,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "chain_config.chain_id",
                "account": "chainConfigState"
              }
            ]
          }
        },
        {
          "name": "tokenBridgeConfig"
        },
        {
          "name": "tokenBridgeCustody",
          "docs": [
            "account that holds this mint's balance. This account needs to be",
            "unchecked because a token account may not have been created for this",
            "mint yet. Mutable.",
            "",
            "# Exclusive",
            "",
            "Native transfer only."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenBridgeAuthoritySigner"
        },
        {
          "name": "tokenBridgeCustodySigner",
          "docs": [
            "",
            "# Exclusive",
            "",
            "Native transfer only."
          ],
          "optional": true
        },
        {
          "name": "tokenBridgeWrappedMeta",
          "docs": [
            "about the token from its native chain:",
            "* Wormhole Chain ID",
            "* Token's native contract address",
            "* Token's native decimals",
            "",
            "# Exclusive",
            "",
            "Wrapped transfer only."
          ],
          "optional": true
        },
        {
          "name": "wormholeBridge",
          "writable": true
        },
        {
          "name": "tokenBridgeEmitter"
        },
        {
          "name": "tokenBridgeSequence",
          "writable": true
        },
        {
          "name": "wormholeMessage",
          "docs": [
            "tokens transferred in this account for our program. Mutable."
          ],
          "writable": true
        },
        {
          "name": "wormholeSender",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  110,
                  100,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "wormholeFeeCollector",
          "writable": true
        },
        {
          "name": "payerSequence",
          "docs": [
            "Used to keep track of payer's Wormhole sequence number."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  113
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenBridgeProgram",
          "address": "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe"
        },
        {
          "name": "wormholeProgram",
          "address": "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5"
        },
        {
          "name": "clock",
          "address": "SysvarC1ock11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "recipientAddress",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "transferredAmount",
          "type": "u64"
        },
        {
          "name": "unwrapIntent",
          "type": "bool"
        },
        {
          "name": "dropoffAmountMicro",
          "type": "u32"
        },
        {
          "name": "maxFeeLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateCanonicalPeer",
      "docs": [
        "Set a different peer as canonical.",
        "",
        "# Authorization",
        "",
        "Owner."
      ],
      "discriminator": [
        200,
        99,
        223,
        191,
        10,
        20,
        40,
        255
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Owner of the program as set in the [`TbrConfig`] account."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "tbrConfig"
          ]
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Owner Config account. This program requires that the `owner` specified",
            "in the context equals the `owner` pubkey specified in this account."
          ]
        },
        {
          "name": "peer"
        },
        {
          "name": "chainConfig",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateEvmTransactionConfig",
      "docs": [
        "Updates the transaction size of the EVM receiving side.",
        "",
        "# Authorization",
        "",
        "Owner or Admin."
      ],
      "discriminator": [
        84,
        38,
        174,
        152,
        174,
        134,
        193,
        10
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "The signer may be the owner, or admin, depending on the operation."
          ],
          "signer": true
        },
        {
          "name": "authBadge",
          "docs": [
            "Proof that the signer is authorized."
          ]
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`signer`] specified",
            "in the context equals a pubkey specified in this account. Mutable,",
            "because we will update roles depending on the operation."
          ],
          "writable": true
        }
      ],
      "args": [
        {
          "name": "evmTransactionGas",
          "type": "u64"
        },
        {
          "name": "evmTransactionSize",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateFeeRecipient",
      "docs": [
        "Updates the account to which the fees will be sent.",
        "",
        "# Authorization",
        "",
        "Owner or Admin."
      ],
      "discriminator": [
        249,
        0,
        198,
        35,
        183,
        123,
        57,
        188
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "The signer may be the owner, or admin, depending on the operation."
          ],
          "signer": true
        },
        {
          "name": "authBadge",
          "docs": [
            "Proof that the signer is authorized."
          ]
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`signer`] specified",
            "in the context equals a pubkey specified in this account. Mutable,",
            "because we will update roles depending on the operation."
          ],
          "writable": true
        }
      ],
      "args": [
        {
          "name": "newFeeRecipient",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateMaxGasDropoff",
      "docs": [
        "What is the maximum allowed gas dropoff for this chain.",
        "",
        "# Authorization",
        "",
        "Owner or Admin."
      ],
      "discriminator": [
        137,
        122,
        33,
        50,
        35,
        79,
        97,
        150
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "Owner as set in the [`TbrConfig`] account, or an admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "authBadge",
          "docs": [
            "Proof that the signer is authorized."
          ]
        },
        {
          "name": "chainConfig",
          "writable": true
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`signer`] specified",
            "in the context equals a pubkey specified in this account. Mutable,",
            "because we will update roles depending on the operation."
          ]
        }
      ],
      "args": [
        {
          "name": "maxGasDropoffMicroToken",
          "type": "u32"
        }
      ]
    },
    {
      "name": "updateRelayerFee",
      "docs": [
        "Updates the value of the relayer fee, *i.e.* the flat USD amount",
        "to pay for a transfer to be done.",
        "",
        "# Authorization",
        "",
        "Owner or Admin."
      ],
      "discriminator": [
        247,
        4,
        34,
        35,
        30,
        149,
        78,
        25
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "Owner as set in the [`TbrConfig`] account, or an admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "authBadge",
          "docs": [
            "Proof that the signer is authorized."
          ]
        },
        {
          "name": "chainConfig",
          "writable": true
        },
        {
          "name": "tbrConfig",
          "docs": [
            "Program Config account. This program requires that the [`signer`] specified",
            "in the context equals a pubkey specified in this account. Mutable,",
            "because we will update roles depending on the operation."
          ]
        }
      ],
      "args": [
        {
          "name": "relayerFeeMicroUsd",
          "type": "u32"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "authBadgeState",
      "discriminator": [
        230,
        136,
        128,
        117,
        214,
        51,
        214,
        152
      ]
    },
    {
      "name": "chainConfigState",
      "discriminator": [
        212,
        167,
        157,
        171,
        147,
        249,
        227,
        212
      ]
    },
    {
      "name": "evmPricesState",
      "discriminator": [
        96,
        16,
        101,
        97,
        209,
        101,
        197,
        178
      ]
    },
    {
      "name": "peerState",
      "discriminator": [
        219,
        45,
        155,
        229,
        250,
        23,
        40,
        183
      ]
    },
    {
      "name": "priceOracleConfigState",
      "discriminator": [
        86,
        37,
        173,
        69,
        170,
        230,
        127,
        150
      ]
    },
    {
      "name": "signerSequenceState",
      "discriminator": [
        38,
        80,
        82,
        109,
        140,
        90,
        97,
        169
      ]
    },
    {
      "name": "tbrConfigState",
      "discriminator": [
        153,
        149,
        1,
        51,
        242,
        134,
        143,
        144
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "adminCountMismatch",
      "msg": "adminCountMismatch"
    },
    {
      "code": 6001,
      "name": "ownerOnly",
      "msg": "ownerOnly"
    },
    {
      "code": 6002,
      "name": "pendingOwnerOnly",
      "msg": "pendingOwnerOnly"
    },
    {
      "code": 6003,
      "name": "ownerOrAdminOnly",
      "msg": "ownerOrAdminOnly"
    },
    {
      "code": 6004,
      "name": "alreadyTheOwner",
      "msg": "alreadyTheOwner"
    },
    {
      "code": 6005,
      "name": "chainIdMismatch",
      "msg": "chainIdMismatch"
    },
    {
      "code": 6006,
      "name": "alreadyTheCanonicalPeer",
      "msg": "alreadyTheCanonicalPeer"
    },
    {
      "code": 6007,
      "name": "feeExceedingMaximum",
      "msg": "feeExceedingMaximum"
    },
    {
      "code": 6008,
      "name": "wrongFeeRecipient",
      "msg": "wrongFeeRecipient"
    },
    {
      "code": 6009,
      "name": "wronglySetOptionalAccounts",
      "msg": "wronglySetOptionalAccounts"
    },
    {
      "code": 6010,
      "name": "wrongMintAuthority",
      "msg": "wrongMintAuthority"
    },
    {
      "code": 6011,
      "name": "invalidRecipient",
      "msg": "invalidRecipient"
    },
    {
      "code": 6012,
      "name": "evmChainPriceNotSet",
      "msg": "evmChainPriceNotSet"
    },
    {
      "code": 6013,
      "name": "pausedTransfers",
      "msg": "pausedTransfers"
    },
    {
      "code": 6014,
      "name": "invalidSendingPeer",
      "msg": "invalidSendingPeer"
    },
    {
      "code": 6015,
      "name": "cannotRegisterSolana",
      "msg": "cannotRegisterSolana"
    },
    {
      "code": 6016,
      "name": "invalidPeerAddress",
      "msg": "invalidPeerAddress"
    }
  ],
  "types": [
    {
      "name": "authBadgeState",
      "docs": [
        "A badge indicating that an admin account is authorized."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "address",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "chainConfigState",
      "docs": [
        "The config for a single chain."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chainId",
            "type": "u16"
          },
          {
            "name": "canonicalPeer",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "maxGasDropoffMicroToken",
            "docs": [
              "The maximum amount of target token the user can ask a dropoff for, in µ-target-token."
            ],
            "type": "u32"
          },
          {
            "name": "relayerFeeMicroUsd",
            "docs": [
              "The fee for the relayer, in μUSD."
            ],
            "type": "u32"
          },
          {
            "name": "pausedOutboundTransfers",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "evmPricesState",
      "docs": [
        "EVM chains prices."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chainId",
            "docs": [
              "The chain that will be read or updated is identified by this field."
            ],
            "type": "u16"
          },
          {
            "name": "gasPrice",
            "docs": [
              "The gas price / base fee for the Ethereum transaction, in Mwei/gas."
            ],
            "type": "u32"
          },
          {
            "name": "pricePerByte",
            "docs": [
              "Regulates the cost of including data blobs in Ethereum transactions, in Mwei/byte."
            ],
            "type": "u32"
          },
          {
            "name": "gasTokenPrice",
            "docs": [
              "The gas price in μusd/Token, typically ETH."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "peerState",
      "docs": [
        "A peer chain for sending token to or from."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chainId",
            "type": "u16"
          },
          {
            "name": "address",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "priceOracleConfigState",
      "docs": [
        "The program's main account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "Program's owner."
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingOwner",
            "docs": [
              "Intermediate storage for the pending owner. Is used to transfer ownership."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "solPrice",
            "docs": [
              "The SOL price in μusd/SOL."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "signerSequenceState",
      "docs": [
        "Adds a number to a user's message PDA seed, so that a different account is",
        "generated every transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "value",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tbrConfigState",
      "docs": [
        "The program's main account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "Program's owner."
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingOwner",
            "docs": [
              "Intermediate storage for the pending owner. Is used to transfer ownership."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "feeRecipient",
            "type": "pubkey"
          },
          {
            "name": "evmTransactionGas",
            "type": "u64"
          },
          {
            "name": "evmTransactionSize",
            "type": "u64"
          },
          {
            "name": "senderBump",
            "type": "u8"
          },
          {
            "name": "redeemerBump",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "seedPrefixBridged",
      "type": "bytes",
      "value": "[98, 114, 105, 100, 103, 101, 100]"
    },
    {
      "name": "seedPrefixTemporary",
      "type": "bytes",
      "value": "[116, 109, 112]"
    }
  ]
};
