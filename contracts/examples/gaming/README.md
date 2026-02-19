# Gaming Loot Box Example

A single `buyLootBox()` call triggers a 4-hub transit flow: purchase a loot box, roll for random gear, forge an item NFT, and register for the arena — all atomically in one transaction.

## Transit Flow

```
TicketBooth → LootRoll → Forge → Arena → TicketBooth
```

1. **TicketBooth** — User pays 0.05 ETH, receives 100 GoldTokens, routes to LootRoll
2. **LootRoll** — Rolls random item type (Sword/Shield/Potion) + power level (1–100), routes to Forge
3. **Forge** — Mints an ERC721 item NFT with the roll stats, equips it, routes to Arena
4. **Arena** — Validates equipped item, registers player for PvP, routes back to TicketBooth
5. **TicketBooth** — Adds returning user to arena participant list

## Contracts

| Contract | Type | Registry Name | Purpose |
|----------|------|---------------|---------|
| `GoldToken.sol` | ERC20 | — | Game currency (1M minted to TicketBooth) |
| `LootRoll.sol` | Hub | `loot.roll` | Pseudo-random item type + power level |
| `Forge.sol` | ERC721 + Hub | `loot.forge` | Item NFT minter + equip |
| `Arena.sol` | Hub | `loot.arena` | PvP registration (requires equipped item) |
| `TicketBooth.sol` | Hub | `loot.ticket-booth` | Entry point — `buyLootBox()` triggers full flow |

## Deployment Order

1. LootRoll (no gaming dependencies)
2. Forge (needs LootRoll address)
3. Arena (needs Forge address)
4. TicketBooth (needs Forge address)
5. GoldToken (mints supply to TicketBooth)
6. `ticketBooth.setGoldTokenAddress(goldToken)`

## Key Design Decisions

- **No token approval needed** — TicketBooth holds GOLD and transfers directly (no `transferFrom` against the user)
- **ETH stays in TicketBooth** — ETH payments are protocol revenue, not forwarded
- **Pseudo-random** — LootRoll uses `block.prevrandao` + `block.timestamp` (not production-safe; use Chainlink VRF for production)
- **Repeat purchases** — Users can buy multiple loot boxes; `equippedItem` overwrites with the latest, arena registration is idempotent
