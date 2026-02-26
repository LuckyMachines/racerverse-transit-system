import { ethers } from "hardhat";
import fs from "node:fs";

async function main() {
  const [admin] = await ethers.getSigners();
  const interval = Number(process.env.DEPOT_INTERVAL ?? "2");
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("DEPOT_INTERVAL must be a positive number of seconds");
  }

  const ValidCharactersFactory =
    await ethers.getContractFactory("ValidCharacters");
  const validCharacters = await ValidCharactersFactory.deploy();
  await validCharacters.waitForDeployment();

  const HubRegistryFactory = await ethers.getContractFactory("HubRegistry", {
    libraries: {
      ValidCharacters: await validCharacters.getAddress(),
    },
  });
  const hubRegistry = await HubRegistryFactory.deploy(admin.address);
  await hubRegistry.waitForDeployment();

  const RailcarFactory = await ethers.getContractFactory("Railcar");
  const railcar = await RailcarFactory.deploy(admin.address);
  await railcar.waitForDeployment();

  const StampStationFactory = await ethers.getContractFactory("StampStation");
  const stampStation = await StampStationFactory.deploy(
    await railcar.getAddress(),
    await hubRegistry.getAddress(),
    admin.address
  );
  await stampStation.waitForDeployment();

  const DepotFactory = await ethers.getContractFactory("Depot");
  const depot = await DepotFactory.deploy(
    await railcar.getAddress(),
    interval,
    await hubRegistry.getAddress(),
    admin.address
  );
  await depot.waitForDeployment();

  const hubRole = await railcar.HUB_ROLE();
  await (await railcar.grantRole(hubRole, await depot.getAddress())).wait();

  await (await depot.setAllowAllInputs(true)).wait();
  await (await stampStation.setAllowAllInputs(true)).wait();

  const stampStationId = await hubRegistry.idFromAddress(
    await stampStation.getAddress()
  );
  const depotId = await hubRegistry.idFromAddress(await depot.getAddress());
  await (await depot.addHubConnections([stampStationId])).wait();
  await (await stampStation.addHubConnections([depotId])).wait();

  const result = {
    admin: admin.address,
    interval,
    validCharacters: await validCharacters.getAddress(),
    hubRegistry: await hubRegistry.getAddress(),
    railcar: await railcar.getAddress(),
    stampStation: await stampStation.getAddress(),
    depot: await depot.getAddress(),
  };

  if (process.env.DEPLOY_OUT) {
    fs.writeFileSync(process.env.DEPLOY_OUT, JSON.stringify(result, null, 2));
  }

  // Machine-readable token for scripts.
  console.log(`DEPLOYMENT_JSON::${JSON.stringify(result)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
