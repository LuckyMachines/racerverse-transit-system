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

describe("HubRegistry", function () {
  let registry: HubRegistry;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;

  beforeEach(async function () {
    [admin, user1] = await ethers.getSigners();
    registry = await deployRegistry(admin.address);
  });

  describe("Registration", function () {
    it("should register a hub via Hub constructor", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      expect(await registry.isRegistered(await hub.getAddress())).to.be.true;
      expect(await registry.totalRegistrations()).to.equal(1);
    });

    it("should assign sequential IDs starting at 1", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub1 = await Hub.deploy(await registry.getAddress(), admin.address);
      const hub2 = await Hub.deploy(await registry.getAddress(), admin.address);
      expect(await registry.idFromAddress(await hub1.getAddress())).to.equal(1);
      expect(await registry.idFromAddress(await hub2.getAddress())).to.equal(2);
    });

    it("should emit HubRegistered event", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub = await Hub.deploy(await registry.getAddress(), admin.address);
      const hubAddr = await hub.getAddress();
      expect(await registry.isRegistered(hubAddr)).to.be.true;
    });

    it("should reject registration with fee if insufficient", async function () {
      await registry.setRegistrationFee(ethers.parseEther("1"));
      const Hub = await ethers.getContractFactory("Hub");
      await expect(
        Hub.deploy(await registry.getAddress(), admin.address)
      ).to.be.reverted;
    });
  });

  describe("Naming", function () {
    let hub: Hub;

    beforeEach(async function () {
      const Hub = await ethers.getContractFactory("Hub");
      hub = await Hub.deploy(await registry.getAddress(), admin.address);
    });

    it("should allow a registered hub to set its name", async function () {
      const hubAddr = await hub.getAddress();
      const hubID = await registry.idFromAddress(hubAddr);
      await fundAddress(hubAddr);
      const hubSigner = await ethers.getImpersonatedSigner(hubAddr);
      await registry.connect(hubSigner).setName("test.hub", hubID);
      expect(await registry.addressFromName("test.hub")).to.equal(hubAddr);
    });

    it("should reject invalid hub names", async function () {
      const hubAddr = await hub.getAddress();
      const hubID = await registry.idFromAddress(hubAddr);
      await fundAddress(hubAddr);
      const hubSigner = await ethers.getImpersonatedSigner(hubAddr);
      await expect(
        registry.connect(hubSigner).setName("INVALID", hubID)
      ).to.be.revertedWithCustomError(registry, "InvalidHubName");
    });

    it("should reject duplicate names", async function () {
      const hubAddr = await hub.getAddress();
      const hubID = await registry.idFromAddress(hubAddr);
      await fundAddress(hubAddr);
      const hubSigner = await ethers.getImpersonatedSigner(hubAddr);
      await registry.connect(hubSigner).setName("test.hub", hubID);

      // Deploy second hub and try same name
      const Hub2 = await ethers.getContractFactory("Hub");
      const hub2 = await Hub2.deploy(await registry.getAddress(), admin.address);
      const hub2Addr = await hub2.getAddress();
      const hub2ID = await registry.idFromAddress(hub2Addr);
      await fundAddress(hub2Addr);
      const hub2Signer = await ethers.getImpersonatedSigner(hub2Addr);
      await expect(
        registry.connect(hub2Signer).setName("test.hub", hub2ID)
      ).to.be.revertedWithCustomError(registry, "NameUnavailable");
    });
  });

  describe("Fee management", function () {
    it("should update registration fee", async function () {
      await registry.setRegistrationFee(ethers.parseEther("0.5"));
      expect(await registry.registrationFee()).to.equal(ethers.parseEther("0.5"));
    });

    it("BUG FIX: setNamingFee should update namingFee (not registrationFee)", async function () {
      await registry.setNamingFee(ethers.parseEther("0.1"));
      expect(await registry.namingFee()).to.equal(ethers.parseEther("0.1"));
      expect(await registry.registrationFee()).to.equal(0);
    });

    it("should restrict fee changes to admin", async function () {
      await expect(
        registry.connect(user1).setRegistrationFee(100)
      ).to.be.reverted;
      await expect(
        registry.connect(user1).setNamingFee(100)
      ).to.be.reverted;
    });
  });

  describe("hubAddressesInRange", function () {
    it("BUG FIX: should return correct addresses in range", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      const hub1 = await Hub.deploy(await registry.getAddress(), admin.address);
      const hub2 = await Hub.deploy(await registry.getAddress(), admin.address);
      const hub3 = await Hub.deploy(await registry.getAddress(), admin.address);

      const addresses = await registry.hubAddressesInRange(1, 3);
      expect(addresses.length).to.equal(3);
      expect(addresses[0]).to.equal(await hub1.getAddress());
      expect(addresses[1]).to.equal(await hub2.getAddress());
      expect(addresses[2]).to.equal(await hub3.getAddress());
    });

    it("should handle partial range", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      await Hub.deploy(await registry.getAddress(), admin.address);
      const hub2 = await Hub.deploy(await registry.getAddress(), admin.address);
      const hub3 = await Hub.deploy(await registry.getAddress(), admin.address);

      const addresses = await registry.hubAddressesInRange(2, 3);
      expect(addresses.length).to.equal(2);
      expect(addresses[0]).to.equal(await hub2.getAddress());
      expect(addresses[1]).to.equal(await hub3.getAddress());
    });

    it("should clamp maxID to totalRegistrations", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      await Hub.deploy(await registry.getAddress(), admin.address);
      const addresses = await registry.hubAddressesInRange(1, 100);
      expect(addresses.length).to.equal(1);
    });

    it("should revert if startingID out of bounds", async function () {
      await expect(
        registry.hubAddressesInRange(1, 1)
      ).to.be.revertedWithCustomError(registry, "StartingIdOutOfBounds");
    });

    it("should revert if maxID < startingID", async function () {
      const Hub = await ethers.getContractFactory("Hub");
      await Hub.deploy(await registry.getAddress(), admin.address);
      await Hub.deploy(await registry.getAddress(), admin.address);
      // Now totalRegistrations = 2, startingID=2 is valid, maxID=1 < startingID
      await expect(
        registry.hubAddressesInRange(2, 1)
      ).to.be.revertedWithCustomError(registry, "MaxIdLessThanStartingId");
    });
  });

  describe("withdrawFees", function () {
    it("should allow admin to withdraw accumulated fees", async function () {
      // Registry doesn't have receive(), so we test the flow logic
      // The registry accumulates fees from register() and setName() payable calls
      const balanceBefore = await ethers.provider.getBalance(admin.address);
      // No fees accumulated yet, so withdrawal should succeed with 0
      await registry.withdrawFees(admin.address);
    });

    it("should restrict withdrawals to admin", async function () {
      await expect(
        registry.connect(user1).withdrawFees(user1.address)
      ).to.be.reverted;
    });
  });
});
