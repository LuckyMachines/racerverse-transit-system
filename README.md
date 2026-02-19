# Racerverse Transit System

![Racerverse Transit System](assets/racerverse-transit-system.png)

**On-chain infrastructure for connecting smart contracts into composable, multi-step transaction flows.**

## Executive Summary

- **Cross-contract orchestration** — Chain multiple smart contract operations into a single user transaction. A user calls one function and triggers a sequence of actions across many independent contracts.
- **Hub-based architecture** — Any smart contract can become a "Hub" by extending the base contract. Hubs register with a central registry, connect to each other, and route users through customizable lifecycle hooks.
- **Group transit via Railcars** — Users can form groups (Railcars) for coordinated multi-party operations across connected hubs.
- **Plug-and-play composability** — Third-party dapps can join the transit network by deploying a Hub, registering it, and connecting to existing hubs. No changes to other contracts required.
- **Production-ready** — Solidity 0.8.33, OpenZeppelin v5, custom errors, reentrancy protection, 68 tests, 87% code coverage, gas-optimized with Hardhat tooling.
- **Working end-to-end example** — A 4-hub flow (DEX → Stake → NFT Mint → Party) demonstrates the full system in action, where a single `claimNFT()` call executes a token swap, stakes tokens, mints an NFT, and adds the user to an exclusive guest list.

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Hub A      │─────▶│   Hub B      │─────▶│   Hub C      │
│ (any dapp)   │◀─────│ (any dapp)   │      │ (any dapp)   │
└─────────────┘      └─────────────┘      └─────────────┘
       │                     │                     │
       └──────────┬──────────┘                     │
                  ▼                                │
          ┌──────────────┐                         │
          │  HubRegistry │◀────────────────────────┘
          │  (central)   │
          └──────────────┘
```

### Core Contracts

| Contract | Purpose |
|----------|---------|
| **HubRegistry** | Central registry for all hubs. Manages registration, naming, and fees. |
| **Hub** | Base contract for transit hubs. Override lifecycle hooks to add custom behavior at each stop. |
| **Railcar** | Group transit. Users join railcars for coordinated group operations. |
| **ValidCharacters** | Library for validating hub names against `[a-z0-9._-]+`. |

### Hub Lifecycle Hooks

Every Hub provides override points that fire when users arrive or depart:

| Hook | When it fires |
|------|---------------|
| `_userWillEnter(address)` | Before a user enters this hub |
| `_userDidEnter(address)` | After a user enters — **primary place for custom logic** |
| `_userWillExit(address)` | Before a user is sent to the next hub |
| `_userDidExit(address)` | After a user has been forwarded |

## Getting Started

### Prerequisites

- Node.js >= 18

### Install & Build

```bash
npm install
npm run compile
```

### Test

```bash
npm test
```

### Coverage

```bash
npm run coverage
```

### Gas Report

```bash
REPORT_GAS=true npm test
```

### Deploy (local)

```bash
npx hardhat node
npm run deploy:local
```

## Usage

### Creating a Hub

Extend the `Hub` contract and override lifecycle hooks:

```solidity
import {Hub} from "./Hub.sol";

contract MyHub is Hub {
    constructor(address registry, address admin)
        Hub(registry, admin)
    {
        // Hub auto-registers with the registry on construction
    }

    function _userDidEnter(address user) internal override {
        // Your custom logic when a user arrives
        // Then optionally forward them to the next hub:
        _sendUserToHub(user, "next-hub-name");
    }
}
```

### Connecting Hubs

```solidity
// Admin connects this hub's output to other hubs
myHub.addHubConnections([hubBId, hubCId]);

// Target hubs must allow input — either from all hubs:
targetHub.setAllowAllInputs(true);

// Or from specific hubs:
targetHub.setInputAllowed(myHubId, true);
```

### Transit Flow

Users are routed through connected hubs automatically. Each hub executes its custom logic via hooks, then forwards the user to the next hub in the chain. This enables complex multi-contract workflows from a single transaction.

## Example: NFT + DeFi Flow

The [`contracts/examples/nft+defi/`](contracts/examples/nft+defi/) directory contains a complete working example with 4 connected hubs:

```
MainHub ──▶ DEX ──▶ Stake ──▶ ExclusiveNFT ──▶ MainHub
```

**What happens in a single `claimNFT()` call:**

1. **MainHub** — User pays 0.1 ETH, which is prepaid to the DEX
2. **DEX** — Swaps the ETH for StakingTokens and forwards them to the user
3. **Stake** — Stakes 0.01 StakingTokens on behalf of the user
4. **ExclusiveNFT** — Mints an NFT (requires staked balance) and sends user back
5. **MainHub** — Adds the user to the exclusive party guest list

All five steps execute atomically in one transaction.

## Project Structure

```
contracts/
  Hub.sol                  # Base hub contract
  HubRegistry.sol          # Central hub registry
  Railcar.sol              # Group transit management
  ValidCharacters.sol      # Name validation library
  interfaces/              # IHub, IHubRegistry, IRailcar
  examples/nft+defi/       # Full working example
test/
  Hub.test.ts              # 13 tests
  HubRegistry.test.ts      # 16 tests
  Railcar.test.ts          # 14 tests
  ValidCharacters.test.ts  # 13 tests
  examples/
    NFTDefiIntegration.test.ts  # 12 end-to-end tests
ignition/modules/          # Hardhat Ignition deployment modules
```

## License

GPL-3.0
