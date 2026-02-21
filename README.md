# Racerverse Transit System

![Racerverse Transit System](assets/racerverse-transit-system.png)

**On-chain infrastructure for connecting smart contracts into composable, multi-step transaction flows.**

## Executive Summary

- **Cross-contract orchestration** — Chain multiple smart contract operations into a single user transaction. A user calls one function and triggers a sequence of actions across many independent contracts.
- **Hub-based architecture** — Any smart contract can become a "Hub" by extending the base contract. Hubs register with a central registry, connect to each other, and route users through customizable lifecycle hooks.
- **Group transit via Railcars** — Users can form groups (Railcars) for coordinated multi-party operations across connected hubs.
- **Plug-and-play composability** — Third-party dapps can join the transit network by deploying a Hub, registering it, and connecting to existing hubs. No changes to other contracts required.
- **Production-ready** — Solidity 0.8.33, OpenZeppelin v5, custom errors, reentrancy protection, 108 tests, 87% code coverage, gas-optimized with Hardhat tooling.
- **Four working end-to-end examples** — An NFT+DeFi flow (DEX → Stake → NFT Mint → Party), a Gaming Loot Box flow (TicketBooth → LootRoll → Forge → Arena), an Arcade Strip flow (Arcade → CoinPusher → ClawMachine → PrizeCounter), and a Mall Crawl flow (Concourse → Gallery → SoundStage → GameRoom) demonstrate the full system in action, each executing multi-step workflows atomically in a single transaction.

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

## Example: Gaming Loot Box

The [`contracts/examples/gaming/`](contracts/examples/gaming/) directory contains a gaming use case with 4 connected hubs:

```
TicketBooth ──▶ LootRoll ──▶ Forge ──▶ Arena ──▶ TicketBooth
```

**What happens in a single `buyLootBox()` call:**

1. **TicketBooth** — User pays 0.05 ETH, receives 100 GoldTokens
2. **LootRoll** — Rolls a random item type (Sword/Shield/Potion) and power level (1–100)
3. **Forge** — Mints an ERC721 item NFT with the roll stats and equips it
4. **Arena** — Validates the equipped item and registers the player for PvP
5. **TicketBooth** — Adds the returning user to the arena participant list

All five steps execute atomically in one transaction.

## Example: Arcade Strip

The [`contracts/examples/arcade/`](contracts/examples/arcade/) directory contains an arcade gaming flow with 4 connected hubs and ERC20 token economies:

```
Arcade ──▶ CoinPusher ──▶ ClawMachine ──▶ PrizeCounter ──▶ Arcade
```

**What happens in a single `playArcade()` call:**

1. **Arcade** — User pays 0.02 ETH, receives 50 ArcadeTokens
2. **CoinPusher** — Takes 50 ArcadeTokens, awards random PrizeTickets (Jackpot 200 / BigWin 100 / SmallWin 50 / Consolation 10)
3. **ClawMachine** — Takes 10 PrizeTickets, mints a Plushie NFT with random type (Bear/Bunny/Dragon/Unicorn) and rarity (Common/Uncommon/Rare/Legendary)
4. **PrizeCounter** — Validates plushie ownership, records the prize
5. **Arcade** — Adds the returning user to the hall of fame

All five steps execute atomically in one transaction. Users pre-approve ERC20 spending before calling `playArcade()`, enabling token transfers across hubs within the flow.

## Example: Mall Crawl

The [`contracts/examples/mall/`](contracts/examples/mall/) directory contains the first **railcar-based example** — a mall where a shopping group (Railcar) visits 4 storefronts in a single atomic transaction:

```
Concourse ──▶ Gallery ──▶ SoundStage ──▶ GameRoom ──▶ Concourse
```

**What happens in a single `startCrawl()` call:**

1. **Concourse** — Caller pays 0.01 ETH, each railcar member receives 100 MallCredit
2. **Gallery** — Mints a generative art NFT (random Style + Palette) for each member
3. **SoundStage** — Takes 20 MallCredit per member, mints a music NFT (random Genre + BPM)
4. **GameRoom** — Awards random MallCredit (Platinum 100 / Gold 50 / Silver 25 / Bronze 10) per member
5. **Concourse** — Increments crawl count, grants VIP status to members holding both NFTs

All five steps execute atomically in one transaction. Unlike other examples that use user transit (`_userDidEnter`), this example uses **railcar transit** (`_railcarDidEnter`) — each hub iterates over all railcar members, enabling coordinated group operations.

## Project Structure

```
contracts/
  Hub.sol                  # Base hub contract
  HubRegistry.sol          # Central hub registry
  Railcar.sol              # Group transit management
  ValidCharacters.sol      # Name validation library
  interfaces/              # IHub, IHubRegistry, IRailcar
  examples/nft+defi/       # Full working example
  examples/gaming/         # Gaming loot box example
  examples/arcade/         # Arcade strip example
  examples/mall/           # Mall crawl example (railcar transit)
test/
  Hub.test.ts              # 17 tests
  HubRegistry.test.ts      # 16 tests
  Railcar.test.ts          # 14 tests
  ValidCharacters.test.ts  # 13 tests
  examples/
    NFTDefiIntegration.test.ts  # 12 tests
    GamingLootBox.test.ts       # 12 tests
    ArcadeStrip.test.ts         # 12 tests
    MallCrawl.test.ts           # 13 tests
ignition/modules/          # Hardhat Ignition deployment modules
```

## License

GPL-3.0
