import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import TransitSystemModule from "./TransitSystem";

const NFTDefiExampleModule = buildModule("NFTDefiExample", (m) => {
  const admin = m.getAccount(0);

  // Use the TransitSystem module for core infra
  const { hubRegistry } = m.useModule(TransitSystemModule);

  // Deploy DEX hub (will auto-register with registry)
  const dex = m.contract("DEX", [hubRegistry, admin]);

  // Deploy StakingToken (mints initial supply to DEX)
  const stakingToken = m.contract("StakingToken", [dex]);

  // Set staking token on DEX
  m.call(dex, "setStakingTokenAddress", [stakingToken]);

  // Deploy Stake hub
  const stake = m.contract("Stake", [stakingToken, hubRegistry, admin]);

  // Deploy ExclusiveNFT hub
  const exclusiveNFT = m.contract("ExclusiveNFT", [stake, hubRegistry, admin]);

  // Deploy MainHub (NFTDefiHub)
  const mainHub = m.contract("NFTDefiHub", [
    stakingToken,
    exclusiveNFT,
    stake,
    hubRegistry,
    admin,
  ]);

  return { dex, stakingToken, stake, exclusiveNFT, mainHub };
});

export default NFTDefiExampleModule;
