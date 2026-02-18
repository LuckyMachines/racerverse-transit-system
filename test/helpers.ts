import { ethers } from "hardhat";
import { HubRegistry } from "../typechain-types";

/**
 * Deploy HubRegistry with the ValidCharacters library linked.
 */
export async function deployRegistry(adminAddress: string): Promise<HubRegistry> {
  const ValidCharacters = await ethers.getContractFactory("ValidCharacters");
  const validChars = await ValidCharacters.deploy();

  const HubRegistry = await ethers.getContractFactory("HubRegistry", {
    libraries: {
      ValidCharacters: await validChars.getAddress(),
    },
  });
  return HubRegistry.deploy(adminAddress) as Promise<HubRegistry>;
}
