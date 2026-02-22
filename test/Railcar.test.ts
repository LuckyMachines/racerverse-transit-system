import { expect } from "chai";
import { ethers } from "hardhat";
import { Railcar } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Railcar", function () {
  let railcar: Railcar;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  beforeEach(async function () {
    [admin, user1, user2, user3] = await ethers.getSigners();
    const Railcar = await ethers.getContractFactory("Railcar");
    railcar = await Railcar.deploy(admin.address);
  });

  describe("Creation", function () {
    it("should create a railcar", async function () {
      await railcar.connect(user1).createRailcar(10);
      expect(await railcar.totalRailcars()).to.equal(1);
      expect(await railcar.owner(1)).to.equal(user1.address);
      expect(await railcar.memberLimit(1)).to.equal(10);
    });

    it("should emit RailcarCreated event", async function () {
      await expect(railcar.connect(user1).createRailcar(5))
        .to.emit(railcar, "RailcarCreated")
        .withArgs(1, user1.address, 5);
    });

    it("should track created railcars per user", async function () {
      await railcar.connect(user1).createRailcar(10);
      await railcar.connect(user1).createRailcar(20);
      const created = await railcar.connect(user1).getCreatedRailcars();
      expect(created.length).to.equal(2);
      expect(created[0]).to.equal(1);
      expect(created[1]).to.equal(2);
    });

    it("should enforce creation fee", async function () {
      await railcar.setCreationFee(ethers.parseEther("0.1"));
      await expect(
        railcar.connect(user1).createRailcar(10)
      ).to.be.revertedWithCustomError(railcar, "InsufficientCreationFee");
      await expect(
        railcar.connect(user1).createRailcar(10, { value: ethers.parseEther("0.1") })
      ).to.not.be.reverted;
    });

    it("should emit CreationFeeUpdated event", async function () {
      await expect(railcar.setCreationFee(ethers.parseEther("0.5")))
        .to.emit(railcar, "CreationFeeUpdated")
        .withArgs(0, ethers.parseEther("0.5"));
    });
  });

  describe("joinRailcar", function () {
    beforeEach(async function () {
      await railcar.connect(user1).createRailcar(3);
    });

    it("should allow users to join an existing railcar", async function () {
      await railcar.connect(user2).joinRailcar(1);
      expect(await railcar.isMember(1, user2.address)).to.be.true;
      const members = await railcar.getMembers(1);
      expect(members.length).to.equal(1);
      expect(members[0]).to.equal(user2.address);
    });

    it("should emit MemberJoined event", async function () {
      await expect(railcar.connect(user2).joinRailcar(1))
        .to.emit(railcar, "MemberJoined")
        .withArgs(1, user2.address);
    });

    it("should reject joining a full railcar", async function () {
      await railcar.connect(user1).joinRailcar(1);
      await railcar.connect(user2).joinRailcar(1);
      await railcar.connect(user3).joinRailcar(1);
      // Railcar limit is 3, should be full
      const [, , , , extra] = await ethers.getSigners();
      await expect(
        railcar.connect(extra).joinRailcar(1)
      ).to.be.revertedWithCustomError(railcar, "RailcarFull");
    });

    it("should reject joining twice", async function () {
      await railcar.connect(user2).joinRailcar(1);
      await expect(
        railcar.connect(user2).joinRailcar(1)
      ).to.be.revertedWithCustomError(railcar, "AlreadyMember");
    });

    it("should reject invalid railcar ID", async function () {
      await expect(
        railcar.connect(user2).joinRailcar(0)
      ).to.be.revertedWithCustomError(railcar, "InvalidRailcarId");
      await expect(
        railcar.connect(user2).joinRailcar(999)
      ).to.be.revertedWithCustomError(railcar, "InvalidRailcarId");
    });

    it("should track railcars per member", async function () {
      await railcar.connect(user1).createRailcar(5); // railcar 2
      await railcar.connect(user2).joinRailcar(1);
      await railcar.connect(user2).joinRailcar(2);
      const userRailcars = await railcar.connect(user2).getRailcars();
      expect(userRailcars.length).to.equal(2);
    });
  });

  describe("getMembers", function () {
    it("should return all members of a railcar", async function () {
      await railcar.connect(user1).createRailcar(10);
      await railcar.connect(user2).joinRailcar(1);
      await railcar.connect(user3).joinRailcar(1);
      const members = await railcar.getMembers(1);
      expect(members.length).to.equal(2);
      expect(members[0]).to.equal(user2.address);
      expect(members[1]).to.equal(user3.address);
    });

    it("should revert for invalid railcar ID", async function () {
      await expect(
        railcar.getMembers(0)
      ).to.be.revertedWithCustomError(railcar, "InvalidRailcarId");
    });
  });

  describe("Access Control", function () {
    it("should restrict setCreationFee to admin", async function () {
      await expect(
        railcar.connect(user1).setCreationFee(100)
      ).to.be.reverted;
    });
  });

  describe("Fee Withdrawal", function () {
    it("should withdraw accumulated creation fees", async function () {
      await railcar.setCreationFee(ethers.parseEther("0.1"));
      await railcar.connect(user1).createRailcar(10, { value: ethers.parseEther("0.1") });
      await railcar.connect(user2).createRailcar(10, { value: ethers.parseEther("0.1") });

      const balanceBefore = await ethers.provider.getBalance(admin.address);
      const tx = await railcar.withdrawFees(admin.address);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(admin.address);
      expect(balanceAfter - balanceBefore + gasCost).to.equal(ethers.parseEther("0.2"));
    });

    it("should emit FeesWithdrawn event", async function () {
      await railcar.setCreationFee(ethers.parseEther("0.1"));
      await railcar.connect(user1).createRailcar(10, { value: ethers.parseEther("0.1") });

      await expect(railcar.withdrawFees(user1.address))
        .to.emit(railcar, "FeesWithdrawn")
        .withArgs(user1.address, ethers.parseEther("0.1"));
    });

    it("should handle zero balance withdrawal", async function () {
      await expect(railcar.withdrawFees(user1.address))
        .to.emit(railcar, "FeesWithdrawn")
        .withArgs(user1.address, 0);
    });

    it("should restrict withdrawFees to admin role", async function () {
      await expect(
        railcar.connect(user1).withdrawFees(user1.address)
      ).to.be.reverted;
    });
  });
});
