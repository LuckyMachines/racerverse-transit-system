import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TransitSystemModule = buildModule("TransitSystem", (m) => {
  const admin = m.getAccount(0);

  // Deploy ValidCharacters library
  const validCharacters = m.library("ValidCharacters");

  // Deploy HubRegistry with linked library
  const hubRegistry = m.contract("HubRegistry", [admin], {
    libraries: {
      ValidCharacters: validCharacters,
    },
  });

  // Deploy Railcar
  const railcar = m.contract("Railcar", [admin]);

  return { validCharacters, hubRegistry, railcar };
});

export default TransitSystemModule;
