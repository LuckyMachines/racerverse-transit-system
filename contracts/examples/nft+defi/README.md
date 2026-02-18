## NFT + DeFi Transit Example

This example shows how we can connect 4 different contracts via the Racerverse Transit System.

**Each contract is a simplified version of a realistic contract, connected to a transit hub:**

- **DEX.sol:** A sample exchange that swaps native tokens for a sample custom ERC20 token
- **Stake.sol:** A sample staking contract that locks up some amount of the sample ERC20 token
- **ExclusiveNFT.sol:** An ERC721 token that is mintable only to addresses with some amount of StakingToken staked
- **MainHub.sol:** An example of a central hub, from which users could choose a variety of destinations. In this example we only have one route we can take.

The hubs are connected as follows:

**Main Hub -> DEX -> Stake -> ExclusiveNFT -> Main Hub**\*

(Arrows represent connections, output from the hub on the left, input to the hub on the right.)

\*Notice how Main Hub is mentioned twice. In this flow, the ExclusiveNFT contract is connected back to the main hub, so when a user redeems an NFT, it can send them back to the main hub to celebrate with all the other users.

This example has only one output per hub, though hubs can have many inputs and outputs.

## Transaction Flow

From MainHub, the user calls one function & performs one transaction, but executes all of the various operations required across many different contracts to finally purchase this exclusive NFT and return back to the main hub where the NFT party can begin!

The four processes we are demonstrating here are:

1. Trade some native tokens for a custom token on a sample dex
2. Stake these newly obtained custom tokens on a second contract
3. Purchase NFT on another contract that requires tokens to be staked
4. Head over to the NFT party

## Run the example:

1. Call getTokenSummary() on MainHub. Notice we only have our native token balance.
2. Make sure you have enough native tokens and call claimNFT()
3. You should now have executed a trade, staked some tokens, and minted your NFT! Call getTokenSummary() again to see.
4. As a bonus, call getPartyGuests() to see how many users have completed this same transit sequence

[![Watch the video](https://img.youtube.com/vi/DUUnCTDvmmM/hqdefault.jpg)](https://youtu.be/DUUnCTDvmmM)
