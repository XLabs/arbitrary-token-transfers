# Arbitrary Token Transfers

## Overview

This contract provides an interface to request relayed token bridge transfers.

Users can request a quote for a specific route through the SDK and then sign a transaction to execute the transfer request.

- Relays are paid for using the gas token of the chain they are requesting from. This payment occurs in the source chain.
- Users can request a marginal amount of gas token be delivered at the destination to bootstrap new wallets.

A route to a specific chain is available only if a contract peer was deployed in that chain.

## Operations

### Transfer token

A user can request transferring a token.

When transferring a gas token back to its origin chain, the user can choose to unwrap the token or not.

⚠️ This is ignored in Celo where the gas token always supports an ERC20 interface in addition to being the gas token of the chain.

When the contract executes a transfer request, it calculates the fee to be collected. The tokens taken from the user are only those used for this fee and the transfer.

#### EVM

In EVM, you have four methods for token handoff:
- `Preapproved`: the user needs to `approve` enough tokens before executing the transfer request.
- `Permit`: the user needs to sign a Permit message with their key and submit it along the transfer request.
- `Permit2Transfer`: the user needs to setup a Permit2 "state channel" with enough funds and sign a Permit2 transfer message and submit it along the transfer request.
- `Permit2Permit`: the user needs to setup a Permit2 "state channel" with enough funds and sign a Permit2 permit message and submit it along the transfer request.

Setting up a Permit2 state channel is basically approving tokens for the Permit2 contract. This can be done for any valid ERC20 token. Usually, this state channel will already exist if the user interacted with e.g. Uniswap with this same token.

The advantage of using any of the Permit variants is that the user only needs to sign a single transaction for the transfer request instead of two. This reduces gas costs and waiting times since you need to confirm one transaction less.

##### Known limitations

Tokens that expand or contract their supply on transfers are not supported by this contract implementation.

### Complete transfer

Normally, users don't need to use this operation. But if, for whatever reason, the relay never happens, they can use this to redeem their Token Bridge transfer.

The user needs to only provide the VAA to be redeemed as long as they use the recipient wallet. If they use another wallet, they need to provide the gas dropoff, if any was requested.

