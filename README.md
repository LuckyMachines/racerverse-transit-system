# Racerverse Transit System

An on-chain registry and mass connection / transit system for dapps and their users.

At its core, the Racerverse Transit System connects smart contracts and directs transaction flow to and from one another in either direction. Perform a task on one contract, then a second task on another, and continue to run a third task back on the first contract. These tasks can be for many users, enabling group operations and complex collections of coordinated transactions. This adds a new level of composability to web3 and opens the door to collaborations and interconnected dapps.

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
          │ (central)    │
          └──────────────┘
```

### Core Contracts

- **HubRegistry** — Central registry for all hubs. Manages registration, naming, and fees.
- **Hub** — Base contract for transit hubs. Hubs connect to each other and route users through the system. Override `_userDidEnter()` and other hooks to add custom behavior.
- **Railcar** — Group transit management. Users can join railcars for coordinated group travel.
- **ValidCharacters** — Library for validating hub names against `[a-z0-9._-]+`.

## Getting Started

### Prerequisites

- Node.js >= 18
- npm or yarn

### Install

```bash
npm install
```

### Compile

```bash
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

## Contract Overview

### Creating a Hub

Extend the `Hub` contract and override lifecycle hooks:

```solidity
contract MyHub is Hub {
    constructor(address registry, address admin)
        Hub(registry, admin)
    {
        // Hub auto-registers with the registry
    }

    function _userDidEnter(address user) internal override {
        // Custom logic when a user arrives
    }
}
```

### Connecting Hubs

```solidity
// Hub admin connects to output hubs
myHub.addHubConnections([hubBId, hubCId]);

// Or allow all inputs
myHub.setAllowAllInputs(true);
```

### Transit Flow

Users are routed through connected hubs automatically. Each hub executes its custom logic via hooks (`_userWillEnter`, `_userDidEnter`, `_userWillExit`, `_userDidExit`), then forwards the user to the next hub.

## Examples

See [`contracts/examples/nft+defi/`](contracts/examples/nft+defi/) for a full working example that demonstrates a 4-hub transit flow: DEX → Stake → NFT Mint → Party.

## License

GPL-3.0
