import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import TransitSystemModule from "./TransitSystem";

const GamingLootBoxExampleModule = buildModule("GamingLootBoxExample", (m) => {
  const admin = m.getAccount(0);

  // Use the TransitSystem module for core infra
  const { hubRegistry } = m.useModule(TransitSystemModule);

  // 1. Deploy LootRoll hub (no gaming deps)
  const lootRoll = m.contract("LootRoll", [hubRegistry, admin]);

  // 2. Deploy Forge hub (needs LootRoll)
  const forge = m.contract("Forge", [lootRoll, hubRegistry, admin]);

  // 3. Deploy Arena hub (needs Forge)
  const arena = m.contract("Arena", [forge, hubRegistry, admin]);

  // 4. Deploy TicketBooth hub (needs Forge) — gold token NOT in constructor
  const ticketBooth = m.contract("TicketBooth", [forge, hubRegistry, admin]);

  // 5. Deploy GoldToken (mints initial supply to TicketBooth)
  const goldToken = m.contract("GoldToken", [ticketBooth]);

  // 6. Set gold token on TicketBooth
  m.call(ticketBooth, "setGoldTokenAddress", [goldToken]);

  return { lootRoll, forge, arena, ticketBooth, goldToken };
});

export default GamingLootBoxExampleModule;
