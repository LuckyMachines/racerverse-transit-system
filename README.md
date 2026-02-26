# Racerverse Transit System

![Solidity](https://img.shields.io/badge/Solidity-0.8.34-363636?logo=solidity)
![License](https://img.shields.io/badge/License-GPL--3.0-blue)
![Tests](https://img.shields.io/badge/Tests-135%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-94%25-brightgreen)

![Racerverse Transit System](assets/racerverse-transit-system.png)

**On-chain infrastructure for connecting smart contracts into composable, multi-step transaction flows.**

**Cross-contract orchestration** — Chain multiple smart contract operations into a single user transaction. A user calls one function and triggers a sequence of actions across many independent contracts.

**Hub-based architecture** — Any smart contract can become a "Hub" by extending the base contract. Hubs register with a central registry, connect to each other, and route users through customizable lifecycle hooks.

**Group transit via Railcars** — Users can form groups (Railcars) for coordinated multi-party operations across connected hubs.

**Plug-and-play composability** — Third-party dapps can join the transit network by deploying a Hub, registering it, and connecting to existing hubs. No changes to other contracts required.

**Production-ready** — OpenZeppelin v5, custom errors, reentrancy protection, 135 tests, 94% code coverage, gas-optimized with Hardhat tooling.

**Five working end-to-end examples** — An NFT+DeFi flow, a Gaming Loot Box flow, an Arcade Strip flow, a Mall Crawl flow, and a Depot Scheduler flow demonstrate the full system in action, from atomic single-transaction workflows to automated time-based dispatch.

## AI Agent and LLM Discovery

Machine-readable project context is available at `llms.txt`.

Recommended integration path for automated agents:

1. Read `llms.txt` and this `README.md`
2. Compile and test core contracts (`npm run compile`, `npm test`)
3. Run AutoLoop integration harness (`npm run test:autoloop-integration`)
4. Start from `contracts/examples/depot/` for async transit plus worker-driven progression

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
| **AutoLoopHub** | Extends Hub with AutoLoop compatibility for time-based automated transit. |
| **Railcar** | Group transit. Users join railcars for coordinated group operations. |
| **ValidCharacters** | Library for validating hub names against `[a-z0-9._-]+`. |

### User Lifecycle Hooks

Every Hub provides override points that fire when individual users arrive or depart:

| Hook | When it fires |
|------|---------------|
| `_userWillEnter(address)` | Before a user enters this hub |
| `_userDidEnter(address)` | After a user enters — **primary place for custom logic** |
| `_userWillExit(address)` | Before a user is sent to the next hub |
| `_userDidExit(address)` | After a user has been forwarded |

### Railcar Lifecycle Hooks

Parallel hooks for group transit — fire when a railcar (group of users) arrives or departs:

| Hook | When it fires |
|------|---------------|
| `_railcarWillEnter(uint256)` | Before a railcar enters this hub |
| `_railcarDidEnter(uint256)` | After a railcar enters — **primary place for group logic** |
| `_railcarWillExit(uint256)` | Before a railcar is sent to the next hub |
| `_railcarDidExit(uint256)` | After a railcar has been forwarded |

## Quick Start

The Transit System uses the Lucky Machines package registry for `@luckymachines/autoloop`. The `.npmrc` file in this repo is already configured.

```bash
npm install          # Install dependencies (pulls autoloop from packages.luckymachines.io)
npm run compile      # Compile contracts
npm test             # Run all 135 tests
```

```bash
npm run coverage             # Generate coverage report
REPORT_GAS=true npm test     # Gas usage report
```

```bash
npx hardhat node             # Start local node
npm run deploy:local         # Deploy to local network
```

## AutoLoop Integration (Full Stack)

The repository now includes an end-to-end integration harness that runs Transit with the real AutoLoop contracts and worker:

```bash
npm run test:autoloop-integration
```

What this script does:

1. Starts Anvil on `http://localhost:8555`
2. Deploys AutoLoop core contracts from the sibling `autoloop` repo
3. Deploys `HubRegistry`, `Railcar`, `StampStation`, and `Depot`
4. Registers `Depot` in AutoLoop
5. Starts `autoloop-worker` and verifies queued users are auto-dispatched through `StampStation` and back to `Depot`

By default, the script looks for sibling paths:
- `../AUTOLOOP_STUFF/autoloop`
- `../AUTOLOOP_STUFF/autoloop-worker`

You can override these with `AUTOLOOP_DIR=...` and `WORKER_DIR=...`.

The deployment-only portion is also available as:

```bash
RPC_URL=http://localhost:8555 DEPLOYER_KEY=0x... npm run deploy:depot:live
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

## Examples

| # | Example | Pattern | Hubs | Entry point |
|---|---------|---------|------|-------------|
| 1 | [NFT + DeFi Flow](#nft--defi-flow) | User transit | DEX, Stake, ExclusiveNFT, MainHub | `claimNFT()` |
| 2 | [Gaming Loot Box](#gaming-loot-box) | User transit | TicketBooth, LootRoll, Forge, Arena | `buyLootBox()` |
| 3 | [Arcade Strip](#arcade-strip) | User transit | Arcade, CoinPusher, ClawMachine, PrizeCounter | `playArcade()` |
| 4 | [Mall Crawl](#mall-crawl) | Railcar transit | Concourse, Gallery, SoundStage, GameRoom | `startCrawl()` |
| 5 | [Depot Scheduler](#depot-scheduler) | AutoLoop async | Depot, StampStation | `enterQueue()` |

### NFT + DeFi Flow

[`contracts/examples/nft+defi/`](contracts/examples/nft+defi/)

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

### Gaming Loot Box

[`contracts/examples/gaming/`](contracts/examples/gaming/)

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

### Arcade Strip

[`contracts/examples/arcade/`](contracts/examples/arcade/)

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

### Mall Crawl

[`contracts/examples/mall/`](contracts/examples/mall/) — First **railcar-based example**

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

### Depot Scheduler

[`contracts/examples/depot/`](contracts/examples/depot/) — First **AutoLoop-compatible example**

```
Depot ──▶ StampStation ──▶ Depot
(queue)    (stamp)          (complete trip)
```

**What makes this different from other examples:**

This is the first **async transit pattern** in the system. Instead of executing everything in a single user transaction, users enter a queue and an AutoLoop worker periodically checks `shouldProgressLoop()` and calls `progressLoop()` to dispatch them.

1. **Depot** — Users pay 0.005 ETH to enter queue. After the configured interval, an AutoLoop worker dispatches all queued users as a railcar
2. **StampStation** — Increments a stamp counter for each member, routes railcar back
3. **Depot** — On return, increments `tripsCompleted` for each member

The `AutoLoopHub` base contract extends `Hub` with `IAutoLoopCompatible` support, enabling any hub to participate in automated, scheduled workflows via the AutoLoop system.

## Revenue Model

The transit system generates revenue at three levels. All fees are configurable by the contract admin and withdrawable via `withdrawFees()`.

### Protocol Fees (HubRegistry)

The HubRegistry is the tollbooth at the on-ramp. Every hub that joins the network pays fees to the registry:

| Fee | When charged | Default | Set by |
|-----|-------------|---------|--------|
| `registrationFee` | Hub registers with the network | 0 | `setRegistrationFee(uint256)` |
| `namingFee` | Hub claims a human-readable name | 0 | `setNamingFee(uint256)` |

These fees scale with network growth — every new hub or name reservation generates registry revenue regardless of who deploys it.

### Infrastructure Fees (Railcar)

| Fee | When charged | Default | Set by |
|-----|-------------|---------|--------|
| `creationFee` | User or hub creates a new railcar | 0 | `setCreationFee(uint256)` |

Railcar fees apply to any group transit usage across the entire network.

### Application Fees (Individual Hubs)

Each hub can collect ETH through its own payable entry points. The hub admin controls pricing and withdraws revenue:

| Hub | Entry point | Price | Revenue stays in |
|-----|------------|-------|-----------------|
| TicketBooth | `buyLootBox()` | 0.05 ETH | TicketBooth |
| Arcade | `playArcade()` | 0.02 ETH | Arcade |
| Concourse | `startCrawl()` | 0.01 ETH | Concourse |
| Depot | `enterQueue()` | 0.005 ETH | Depot |
| MainHub | `claimNFT()` | 0.1 ETH | DEX (via prepay) |

### Fee Withdrawal

Every contract that collects ETH exposes the same withdrawal pattern:

```solidity
// Admin withdraws all accumulated ETH to a specified address
hub.withdrawFees(payable(treasuryAddress));
```

- **HubRegistry**, **Hub** (and all subclasses), and **Railcar** all implement `withdrawFees()`
- Restricted to `DEFAULT_ADMIN_ROLE` with reentrancy protection
- Emits `FeesWithdrawn(address indexed to, uint256 amount)` on every call

### Revenue for Lucky Machines vs. Third Parties

Lucky Machines controls revenue from contracts it deploys and admins. Third-party developers who deploy their own hubs:

- **Pay** registration and naming fees to the HubRegistry (Lucky Machines revenue)
- **Keep** all application-level fees collected by their own hubs
- **Pay** railcar creation fees if their hubs use group transit

This creates a network-effect model: as more third-party hubs join, protocol-level fee revenue grows without Lucky Machines needing to operate those hubs.

## Project Structure

135 tests across 9 test suites:

```
contracts/
  Hub.sol                  # Base hub contract
  AutoLoopHub.sol          # AutoLoop-compatible hub base
  HubRegistry.sol          # Central hub registry
  Railcar.sol              # Group transit management
  ValidCharacters.sol      # Name validation library
  interfaces/              # IHub, IHubRegistry, IRailcar, IAutoLoopCompatible
  examples/nft+defi/       # Full working example
  examples/gaming/         # Gaming loot box example
  examples/arcade/         # Arcade strip example
  examples/mall/           # Mall crawl example (railcar transit)
  examples/depot/          # Depot scheduler example (AutoLoop async transit)
test/
  Hub.test.ts              # 21 tests
  HubRegistry.test.ts      # 16 tests
  Railcar.test.ts          # 18 tests
  ValidCharacters.test.ts  # 13 tests
  examples/
    NFTDefiIntegration.test.ts  # 14 tests
    GamingLootBox.test.ts       # 13 tests
    ArcadeStrip.test.ts         # 13 tests
    MallCrawl.test.ts           # 14 tests
    DepotScheduler.test.ts      # 14 tests
ignition/modules/          # Hardhat Ignition deployment modules
```

## Contributing

Issues and PRs welcome.

## License

[GPL-3.0](LICENSE)
