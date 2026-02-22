import { expect } from "chai";
import { ethers } from "hardhat";
import { HubRegistry, Hub } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deployRegistry } from "./helpers";

async function fundAddress(address: string) {
  await ethers.provider.send("hardhat_setBalance", [
    address,
    "0xDE0B6B3A7640000", // 1 ETH
  ]);
}

describe("Hub", function () {
  let registry: HubRegistry;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;

  beforeEach(async function () {
    [admin, user1] = await ethers.getSigners();
    registry = await deployRegistry(admin.address);
  });

  describe("Construction & Registration", function () {
    it("should auto-register on construction", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      expect(await registry.isRegistered(await hub.getAddress())).to.be.true;
    });

    it("should set admin role on construction", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      const DEFAULT_ADMIN_ROLE = await hub.DEFAULT_ADMIN_ROLE();
      expect(await hub.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });
  });

  describe("Hub Connections", function () {
    let hubA: Hub;
    let hubB: Hub;
    let hubC: Hub;

    beforeEach(async function () {
      const Hub = await ethers.getContractFactory("Hub");
      hubA = await Hub.deploy(await registry.getAddress(), admin.address);
      hubB = await Hub.deploy(await registry.getAddress(), admin.address);
      hubC = await Hub.deploy(await registry.getAddress(), admin.address);

      await hubB.setAllowAllInputs(true);
      await hubC.setAllowAllInputs(true);
    });

    it("should add hub connections", async function () {
      const hubBId = await registry.idFromAddress(await hubB.getAddress());
      const hubCId = await registry.idFromAddress(await hubC.getAddress());

      await hubA.addHubConnections([hubBId, hubCId]);

      const outputs = await hubA.hubOutputs();
      expect(outputs.length).to.equal(2);
      expect(outputs[0]).to.equal(hubBId);
      expect(outputs[1]).to.equal(hubCId);

      const hubAId = await registry.idFromAddress(await hubA.getAddress());
      const hubBInputs = await hubB.hubInputs();
      expect(hubBInputs.length).to.equal(1);
      expect(hubBInputs[0]).to.equal(hubAId);
    });

    it("BUG FIX: removeInput should actually remove from _hubInputs", async function () {
      const hubBId = await registry.idFromAddress(await hubB.getAddress());
      await hubA.addHubConnections([hubBId]);

      let hubBInputs = await hubB.hubInputs();
      expect(hubBInputs.length).to.equal(1);

      await hubA.removeHubConnectionsTo([hubBId]);

      hubBInputs = await hubB.hubInputs();
      expect(hubBInputs.length).to.equal(0);
    });

    it("BUG FIX: removeHubConnectionsTo should remove from _hubOutputs", async function () {
      const hubBId = await registry.idFromAddress(await hubB.getAddress());
      await hubA.addHubConnections([hubBId]);

      let outputs = await hubA.hubOutputs();
      expect(outputs.length).to.equal(1);

      await hubA.removeHubConnectionsTo([hubBId]);

      outputs = await hubA.hubOutputs();
      expect(outputs.length).to.equal(0);
    });

    it("should reject connections to non-existent hubs", async function () {
      await expect(
        hubA.addHubConnections([999])
      ).to.be.revertedWithCustomError(hubA, "InvalidHubIndices");
    });
  });

  describe("User Transit", function () {
    let hubA: Hub;
    let hubB: Hub;

    beforeEach(async function () {
      const Hub = await ethers.getContractFactory("Hub");
      hubA = await Hub.deploy(await registry.getAddress(), admin.address);
      hubB = await Hub.deploy(await registry.getAddress(), admin.address);
      await hubB.setAllowAllInputs(true);

      const hubBId = await registry.idFromAddress(await hubB.getAddress());
      await hubA.addHubConnections([hubBId]);
    });

    it("should allow authorized hub to enter user", async function () {
      const hubAAddr = await hubA.getAddress();
      await fundAddress(hubAAddr);
      const hubASigner = await ethers.getImpersonatedSigner(hubAAddr);

      await expect(hubB.connect(hubASigner).enterUser(user1.address)).to.not.be
        .reverted;
    });

    it("should reject unauthorized hub from entering user", async function () {
      // Create a new hub that is NOT connected as input to hubB
      const Hub = await ethers.getContractFactory("Hub");
      const hubC = await Hub.deploy(await registry.getAddress(), admin.address);
      // Turn off allowAllInputs on hubB for this test
      await hubB.setAllowAllInputs(false);

      const hubCAddr = await hubC.getAddress();
      await fundAddress(hubCAddr);
      const hubCSigner = await ethers.getImpersonatedSigner(hubCAddr);

      await expect(
        hubB.connect(hubCSigner).enterUser(user1.address)
      ).to.be.revertedWithCustomError(hubB, "HubNotAuthorized");
    });

    it("should emit UserEntered event", async function () {
      const hubAAddr = await hubA.getAddress();
      await fundAddress(hubAAddr);
      const hubASigner = await ethers.getImpersonatedSigner(hubAAddr);

      const hubAId = await registry.idFromAddress(hubAAddr);
      await expect(hubB.connect(hubASigner).enterUser(user1.address))
        .to.emit(hubB, "UserEntered")
        .withArgs(user1.address, hubAId);
    });
  });

  describe("Railcar Transit", function () {
    let hubA: Hub;
    let hubB: Hub;

    beforeEach(async function () {
      const Hub = await ethers.getContractFactory("Hub");
      hubA = await Hub.deploy(await registry.getAddress(), admin.address);
      hubB = await Hub.deploy(await registry.getAddress(), admin.address);
      await hubB.setAllowAllInputs(true);

      const hubBId = await registry.idFromAddress(await hubB.getAddress());
      await hubA.addHubConnections([hubBId]);
    });

    it("should allow authorized hub to enter railcar", async function () {
      const hubAAddr = await hubA.getAddress();
      await fundAddress(hubAAddr);
      const hubASigner = await ethers.getImpersonatedSigner(hubAAddr);

      await expect(hubB.connect(hubASigner).enterRailcar(42)).to.not.be
        .reverted;
    });

    it("should reject unauthorized hub from entering railcar", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hubC = await Hub.deploy(await registry.getAddress(), admin.address);
      await hubB.setAllowAllInputs(false);

      const hubCAddr = await hubC.getAddress();
      await fundAddress(hubCAddr);
      const hubCSigner = await ethers.getImpersonatedSigner(hubCAddr);

      await expect(
        hubB.connect(hubCSigner).enterRailcar(42)
      ).to.be.revertedWithCustomError(hubB, "HubNotAuthorized");
    });

    it("should emit RailcarEntered event", async function () {
      const hubAAddr = await hubA.getAddress();
      await fundAddress(hubAAddr);
      const hubASigner = await ethers.getImpersonatedSigner(hubAAddr);

      const hubAId = await registry.idFromAddress(hubAAddr);
      await expect(hubB.connect(hubASigner).enterRailcar(42))
        .to.emit(hubB, "RailcarEntered")
        .withArgs(42, hubAId);
    });
  });

  describe("Input Allow/Deny", function () {
    it("should toggle allowAllInputs", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      expect(await hub.allowAllInputs()).to.be.false;
      await hub.setAllowAllInputs(true);
      expect(await hub.allowAllInputs()).to.be.true;
    });

    it("should set specific input allowed", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      await hub.setInputAllowed(5, true);
      expect(await hub.inputAllowed(5)).to.be.true;
      await hub.setInputAllowed(5, false);
      expect(await hub.inputAllowed(5)).to.be.false;
    });

    it("should emit AllowAllInputsChanged event", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      await expect(hub.setAllowAllInputs(true))
        .to.emit(hub, "AllowAllInputsChanged")
        .withArgs(true);
    });

    it("should emit InputAllowedChanged event", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      await expect(hub.setInputAllowed(3, true))
        .to.emit(hub, "InputAllowedChanged")
        .withArgs(3, true);
    });

    it("should restrict admin functions to admin role", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      await expect(
        hub.connect(user1).setAllowAllInputs(true)
      ).to.be.reverted;
      await expect(
        hub.connect(user1).setInputAllowed(1, true)
      ).to.be.reverted;
      await expect(
        hub.connect(user1).addHubConnections([1])
      ).to.be.reverted;
    });
  });

  describe("Fee Withdrawal", function () {
    it("should withdraw accumulated ETH to specified address", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      const hubAddr = await hub.getAddress();

      // Fund the hub via hardhat_setBalance (base Hub has no receive/payable)
      await ethers.provider.send("hardhat_setBalance", [
        hubAddr,
        "0xDE0B6B3A7640000", // 1 ETH
      ]);

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await hub.withdrawFees(user1.address);
      const balanceAfter = await ethers.provider.getBalance(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1"));
    });

    it("should emit FeesWithdrawn event", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      const hubAddr = await hub.getAddress();

      await ethers.provider.send("hardhat_setBalance", [
        hubAddr,
        "0x6F05B59D3B20000", // 0.5 ETH
      ]);

      await expect(hub.withdrawFees(user1.address))
        .to.emit(hub, "FeesWithdrawn")
        .withArgs(user1.address, ethers.parseEther("0.5"));
    });

    it("should handle zero balance withdrawal", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);

      await expect(hub.withdrawFees(user1.address))
        .to.emit(hub, "FeesWithdrawn")
        .withArgs(user1.address, 0);
    });

    it("should restrict withdrawFees to admin role", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);

      await expect(
        hub.connect(user1).withdrawFees(user1.address)
      ).to.be.reverted;
    });
  });
});
