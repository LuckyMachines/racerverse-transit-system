import { expect } from "chai";
import { ethers } from "hardhat";
import {
  HubRegistry,
  Railcar,
  Depot,
  StampStation,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deployRegistry } from "../helpers";

describe("Depot Scheduler Integration", function () {
  let registry: HubRegistry;
  let railcar: Railcar;
  let depot: Depot;
  let stampStation: StampStation;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  const INTERVAL = 60; // 60 seconds
  const ENTRY_PRICE = ethers.parseEther("0.005");

  beforeEach(async function () {
    [admin, user1, user2, user3] = await ethers.getSigners();

    // 1. Deploy registry (with linked ValidCharacters library)
    registry = await deployRegistry(admin.address);

    // 2. Deploy Railcar (standalone)
    const RailcarFactory = await ethers.getContractFactory("Railcar");
    railcar = await RailcarFactory.deploy(admin.address);

    // 3. Deploy StampStation (hub 1) - registers as "depot.stamp-station"
    const StampStationFactory =
      await ethers.getContractFactory("StampStation");
    stampStation = await StampStationFactory.deploy(
      await railcar.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // 4. Deploy Depot (hub 2) - registers as "depot.platform"
    const DepotFactory = await ethers.getContractFactory("Depot");
    depot = await DepotFactory.deploy(
      await railcar.getAddress(),
      INTERVAL,
      await registry.getAddress(),
      admin.address
    );

    // 5. Grant HUB_ROLE on Railcar to Depot so it can call createRailcarFromHub
    const HUB_ROLE = await railcar.HUB_ROLE();
    await railcar.grantRole(HUB_ROLE, await depot.getAddress());

    // 6. Set allowAllInputs on both hubs
    await depot.setAllowAllInputs(true);
    await stampStation.setAllowAllInputs(true);

    // 7. Connect cycle: Depot → StampStation → Depot
    const stationId = await registry.idFromAddress(
      await stampStation.getAddress()
    );
    const depotId = await registry.idFromAddress(await depot.getAddress());
    await depot.addHubConnections([stationId]);
    await stampStation.addHubConnections([depotId]);
  });

  describe("AutoLoop Interface", function () {
    it("should support IAutoLoopCompatible interface via ERC165", async function () {
      // IAutoLoopCompatible interfaceId = XOR of function selectors
      // shouldProgressLoop() = 0x1ba8a259
      // progressLoop(bytes) = 0xf3453949
      // interfaceId = 0x1ba8a259 ^ 0xf3453949
      const iface = new ethers.Interface([
        "function shouldProgressLoop() view returns (bool, bytes)",
        "function progressLoop(bytes)",
      ]);
      const selectors = iface.fragments
        .filter((f) => f.type === "function")
        .map((f) => iface.getFunction(f.name)!.selector);
      const interfaceId =
        BigInt(selectors[0]) ^ BigInt(selectors[1]);
      const interfaceIdHex =
        "0x" + interfaceId.toString(16).padStart(8, "0");

      expect(await depot.supportsInterface(interfaceIdHex)).to.be.true;
    });

    it("should support IAccessControlEnumerable interface via ERC165", async function () {
      // IAccessControlEnumerable interfaceId
      const iface = new ethers.Interface([
        "function getRoleMember(bytes32,uint256) view returns (address)",
        "function getRoleMemberCount(bytes32) view returns (uint256)",
      ]);
      const selectors = iface.fragments
        .filter((f) => f.type === "function")
        .map((f) => iface.getFunction(f.name)!.selector);
      const interfaceId =
        BigInt(selectors[0]) ^ BigInt(selectors[1]);
      const interfaceIdHex =
        "0x" + interfaceId.toString(16).padStart(8, "0");

      expect(await depot.supportsInterface(interfaceIdHex)).to.be.true;
    });
  });

  describe("Queue Mechanics", function () {
    it("should allow users to enter queue", async function () {
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });

      const queue = await depot.getQueue();
      expect(queue.length).to.equal(1);
      expect(queue[0]).to.equal(user1.address);
      expect(await depot.inQueue(user1.address)).to.be.true;
    });

    it("should reject duplicate queue entries", async function () {
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });

      await expect(
        depot.connect(user1).enterQueue({ value: ENTRY_PRICE })
      ).to.be.revertedWithCustomError(depot, "AlreadyInQueue");
    });

    it("should reject insufficient payment", async function () {
      await expect(
        depot.connect(user1).enterQueue({ value: ethers.parseEther("0.001") })
      ).to.be.revertedWithCustomError(depot, "InsufficientPayment");
    });
  });

  describe("shouldProgressLoop", function () {
    it("should return false when queue is empty", async function () {
      const [ready] = await depot.shouldProgressLoop();
      expect(ready).to.be.false;
    });

    it("should return false when interval hasn't passed", async function () {
      // First dispatch to set lastDispatch to current timestamp
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });
      await ethers.provider.send("evm_increaseTime", [INTERVAL + 1]);
      await ethers.provider.send("evm_mine", []);
      const [, firstData] = await depot.shouldProgressLoop();
      await depot.progressLoop(firstData);

      // Re-enter queue immediately (interval hasn't passed yet)
      await depot.connect(user2).enterQueue({ value: ENTRY_PRICE });
      const [ready] = await depot.shouldProgressLoop();
      expect(ready).to.be.false;
    });

    it("should return true when queue has members and interval passed", async function () {
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });

      // Advance time past interval
      await ethers.provider.send("evm_increaseTime", [INTERVAL + 1]);
      await ethers.provider.send("evm_mine", []);

      const [ready, data] = await depot.shouldProgressLoop();
      expect(ready).to.be.true;
      expect(data).to.not.equal("0x");
    });
  });

  describe("progressLoop (Auto-Dispatch)", function () {
    it("should dispatch queued members as railcar through full flow", async function () {
      // Two users enter queue
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });
      await depot.connect(user2).enterQueue({ value: ENTRY_PRICE });

      // Advance time past interval
      await ethers.provider.send("evm_increaseTime", [INTERVAL + 1]);
      await ethers.provider.send("evm_mine", []);

      // Check readiness and dispatch
      const [ready, data] = await depot.shouldProgressLoop();
      expect(ready).to.be.true;

      await depot.progressLoop(data);

      // Verify stamps were applied (railcar went through StampStation)
      expect(await stampStation.stamps(user1.address)).to.equal(1);
      expect(await stampStation.stamps(user2.address)).to.equal(1);
      expect(await stampStation.totalStamps()).to.equal(2);

      // Verify trips completed (railcar returned to Depot)
      expect(await depot.tripsCompleted(user1.address)).to.equal(1);
      expect(await depot.tripsCompleted(user2.address)).to.equal(1);

      // Verify dispatch counter
      expect(await depot.totalDispatches()).to.equal(1);
    });

    it("should clear queue after dispatch", async function () {
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });
      await depot.connect(user2).enterQueue({ value: ENTRY_PRICE });

      // Advance time and dispatch
      await ethers.provider.send("evm_increaseTime", [INTERVAL + 1]);
      await ethers.provider.send("evm_mine", []);

      const [, data] = await depot.shouldProgressLoop();
      await depot.progressLoop(data);

      // Queue should be empty
      const queue = await depot.getQueue();
      expect(queue.length).to.equal(0);

      // Users should no longer be in queue
      expect(await depot.inQueue(user1.address)).to.be.false;
      expect(await depot.inQueue(user2.address)).to.be.false;

      // Users can re-enter queue
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });
      expect(await depot.inQueue(user1.address)).to.be.true;
    });

    it("should handle multiple dispatch cycles", async function () {
      // Cycle 1: user1 and user2
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });
      await depot.connect(user2).enterQueue({ value: ENTRY_PRICE });

      await ethers.provider.send("evm_increaseTime", [INTERVAL + 1]);
      await ethers.provider.send("evm_mine", []);

      let [, data] = await depot.shouldProgressLoop();
      await depot.progressLoop(data);

      expect(await depot.totalDispatches()).to.equal(1);
      expect(await stampStation.stamps(user1.address)).to.equal(1);

      // Cycle 2: user2 and user3
      await depot.connect(user2).enterQueue({ value: ENTRY_PRICE });
      await depot.connect(user3).enterQueue({ value: ENTRY_PRICE });

      await ethers.provider.send("evm_increaseTime", [INTERVAL + 1]);
      await ethers.provider.send("evm_mine", []);

      [, data] = await depot.shouldProgressLoop();
      await depot.progressLoop(data);

      expect(await depot.totalDispatches()).to.equal(2);
      expect(await stampStation.stamps(user2.address)).to.equal(2);
      expect(await stampStation.stamps(user3.address)).to.equal(1);
      expect(await depot.tripsCompleted(user1.address)).to.equal(1);
      expect(await depot.tripsCompleted(user2.address)).to.equal(2);
      expect(await depot.tripsCompleted(user3.address)).to.equal(1);
    });
  });

  describe("Hub Registry Naming", function () {
    it("should register all hubs with correct depot.* names", async function () {
      expect(await registry.addressFromName("depot.platform")).to.equal(
        await depot.getAddress()
      );
      expect(await registry.addressFromName("depot.stamp-station")).to.equal(
        await stampStation.getAddress()
      );
    });

    it("should have 2 total registrations", async function () {
      expect(await registry.totalRegistrations()).to.equal(2);
    });
  });

  describe("Fee Withdrawal", function () {
    it("should withdraw accumulated ETH from Depot", async function () {
      await depot.connect(user1).enterQueue({ value: ENTRY_PRICE });
      await depot.connect(user2).enterQueue({ value: ENTRY_PRICE });

      // Depot should hold 0.01 ETH (2 × 0.005)
      const balanceBefore = await ethers.provider.getBalance(admin.address);
      const tx = await depot.withdrawFees(admin.address);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(admin.address);
      expect(balanceAfter - balanceBefore + gasCost).to.equal(ethers.parseEther("0.01"));
    });
  });
});
