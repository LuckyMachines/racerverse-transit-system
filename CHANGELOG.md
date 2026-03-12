# Changelog

## [1.1.0] - 2026-03-12

### Added
- **Transit depth guard** on `Hub.enterUser()` and `Hub.enterRailcar()`. A `MAX_TRANSIT_DEPTH` (32) counter prevents unbounded recursion while allowing legitimate circular flows (e.g. MainHub → DEX → ... → MainHub). Reverts with `TransitDepthExceeded()` if exceeded.
- **Max range limit** on `HubRegistry.hubAddressesInRange()`. A `MAX_RANGE_SIZE` (500) cap prevents gas-limit DoS on large registries. Reverts with `RangeExceedsMaximum(requested, maximum)` if exceeded.
- **Randomness warnings** on all example contracts using `block.prevrandao`/`block.timestamp`. NatDoc `@dev WARNING` blocks note validator influence and recommend AutoLoop VRF for production.
- This CHANGELOG.

### Changed
- Default npm registry switched to `https://packages.luckymachines.io` (prod Verdaccio).

## [1.0.2] - Previous

- Migrate transit package workflows to Verdaccio registry.
- Use Verdaccio-hosted autoloop dependency.
- Add AutoLoop transit integration scripts and LLM docs.
- Upgrade to Solidity 0.8.34.

## [1.0.1] - Previous

- Bug fixes: `removeInput()`, `removeHubConnectionsTo()`, `hubAddressesInRange()`, `setNamingFee()`.
- Add `withdrawFees()` to Hub and Railcar.
- Add Depot Scheduler, Mall Crawl, Arcade Strip, Gaming Loot Box examples.
- 135 tests, 94% coverage.
