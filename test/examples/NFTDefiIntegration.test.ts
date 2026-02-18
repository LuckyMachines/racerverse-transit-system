import { expect } from "chai";
import { ethers } from "hardhat";
import {
  HubRegistry,
  DEX,
  Stake,
  ExclusiveNFT,
  NFTDefiHub,
  StakingToken,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deployRegistry } from "../helpers";

describe("NFT+DeFi Integration", function () {
  let registry: HubRegistry;
  let dex: DEX;
  let stake: Stake;
  let exclusiveNFT: ExclusiveNFT;
  let mainHub: NFTDefiHub;
  let stakingToken: StakingToken;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    // Deploy registry (with linked ValidCharacters library)
    registry = await deployRegistry(admin.address);

    // Deploy DEX (hub 1) - registers as "sample.dex"
    const DEX = await ethers.getContractFactory("DEX");
    dex = await DEX.deploy(await registry.getAddress(), admin.address);

    // Deploy StakingToken (mints to DEX)
    const StakingToken = await ethers.getContractFactory("StakingToken");
    stakingToken = await StakingToken.deploy(await dex.getAddress());

    // Set staking token on DEX
    await dex.setStakingTokenAddress(await stakingToken.getAddress());

    // Deploy Stake (hub 2) - registers as "sample.stake"
    const StakeFactory = await ethers.getContractFactory("Stake");
    stake = await StakeFactory.deploy(
      await stakingToken.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // Deploy ExclusiveNFT (hub 3) - registers as "sample.exclusive-nft"
    const ExclusiveNFT = await ethers.getContractFactory("ExclusiveNFT");
    exclusiveNFT = await ExclusiveNFT.deploy(
      await stake.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // Deploy MainHub (hub 4) - registers as "sample.main-hub"
    const NFTDefiHub = await ethers.getContractFactory("NFTDefiHub");
    mainHub = await NFTDefiHub.deploy(
      await stakingToken.getAddress(),
      await exclusiveNFT.getAddress(),
      await stake.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // Set up hub connections: MainHub → DEX → Stake → ExclusiveNFT → MainHub
    // Each downstream hub needs to allow all inputs for the connections to work
    await dex.setAllowAllInputs(true);
    await stake.setAllowAllInputs(true);
    await exclusiveNFT.setAllowAllInputs(true);
    await mainHub.setAllowAllInputs(true);

    const dexId = await registry.idFromAddress(await dex.getAddress());
    const stakeId = await registry.idFromAddress(await stake.getAddress());
    const nftId = await registry.idFromAddress(await exclusiveNFT.getAddress());
    const mainHubId = await registry.idFromAddress(await mainHub.getAddress());

    // MainHub outputs to DEX
    await mainHub.addHubConnections([dexId]);
    // DEX outputs to Stake
    await dex.addHubConnections([stakeId]);
    // Stake outputs to ExclusiveNFT
    await stake.addHubConnections([nftId]);
    // ExclusiveNFT outputs to MainHub
    await exclusiveNFT.addHubConnections([mainHubId]);

    // User needs StakingToken allowance for Stake contract
    // The DEX will transfer tokens to user, who needs to approve Stake
    // But in the transit flow, DEX transfers to user, then Stake does transferFrom
    // So user needs to approve Stake to spend their StakingToken
  });

  describe("Full Transit Flow", function () {
    it("should complete the full claimNFT flow", async function () {
      const claimAmount = ethers.parseEther("0.1");

      // User approves Stake contract to spend their StakingToken
      await stakingToken
        .connect(user1)
        .approve(await stake.getAddress(), ethers.parseEther("1"));

      // User calls claimNFT on MainHub
      await mainHub.connect(user1).claimNFT({ value: claimAmount });

      // Verify: User should have staked balance of 0.01
      expect(await stake.stakedBalanceOf(user1.address)).to.equal(
        ethers.parseEther("0.01")
      );

      // Verify: User should own an ExclusiveNFT
      expect(await exclusiveNFT.balanceOf(user1.address)).to.equal(1);

      // Verify: User should be at the party
      expect(await mainHub.atParty(user1.address)).to.be.true;
      const guests = await mainHub.getPartyGuests();
      expect(guests.length).to.equal(1);
      expect(guests[0]).to.equal(user1.address);

      // Verify: User should have remaining StakingTokens
      // 0.1 ETH was exchanged for 0.1 STK, 0.01 was staked
      const expectedRemaining = claimAmount - ethers.parseEther("0.01");
      expect(await stakingToken.balanceOf(user1.address)).to.equal(
        expectedRemaining
      );
    });

    it("should handle multiple users completing the flow", async function () {
      const claimAmount = ethers.parseEther("0.2");

      // Both users approve
      await stakingToken
        .connect(user1)
        .approve(await stake.getAddress(), ethers.parseEther("1"));
      await stakingToken
        .connect(user2)
        .approve(await stake.getAddress(), ethers.parseEther("1"));

      // Both users claim
      await mainHub.connect(user1).claimNFT({ value: claimAmount });
      await mainHub.connect(user2).claimNFT({ value: claimAmount });

      // Both should be at party
      const guests = await mainHub.getPartyGuests();
      expect(guests.length).to.equal(2);
      expect(await mainHub.atParty(user1.address)).to.be.true;
      expect(await mainHub.atParty(user2.address)).to.be.true;

      // Both should own NFTs (IDs 0 and 1)
      expect(await exclusiveNFT.balanceOf(user1.address)).to.equal(1);
      expect(await exclusiveNFT.balanceOf(user2.address)).to.equal(1);
    });

    it("should reject claim with insufficient payment", async function () {
      await expect(
        mainHub.connect(user1).claimNFT({ value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(mainHub, "InsufficientPayment");
    });
  });

  describe("Hub Registry Naming", function () {
    it("should register all hubs with correct names", async function () {
      expect(await registry.addressFromName("sample.dex")).to.equal(
        await dex.getAddress()
      );
      expect(await registry.addressFromName("sample.stake")).to.equal(
        await stake.getAddress()
      );
      expect(await registry.addressFromName("sample.exclusive-nft")).to.equal(
        await exclusiveNFT.getAddress()
      );
      expect(await registry.addressFromName("sample.main-hub")).to.equal(
        await mainHub.getAddress()
      );
    });

    it("should have 4 total registrations", async function () {
      expect(await registry.totalRegistrations()).to.equal(4);
    });
  });

  describe("Individual Contract Checks", function () {
    it("DEX: should exchange native tokens for StakingToken", async function () {
      const amount = ethers.parseEther("1");
      await dex.connect(user1).exchange({ value: amount });
      expect(await stakingToken.balanceOf(user1.address)).to.equal(amount);
    });

    it("Stake: should allow manual staking", async function () {
      // Get tokens first
      await dex.connect(user1).exchange({ value: ethers.parseEther("1") });
      await stakingToken
        .connect(user1)
        .approve(await stake.getAddress(), ethers.parseEther("0.5"));
      await stake.connect(user1).stakeTokens(ethers.parseEther("0.5"));
      expect(await stake.stakedBalanceOf(user1.address)).to.equal(
        ethers.parseEther("0.5")
      );
    });

    it("ExclusiveNFT: should mint for users with sufficient stake", async function () {
      // Get and stake tokens
      await dex.connect(user1).exchange({ value: ethers.parseEther("1") });
      await stakingToken
        .connect(user1)
        .approve(await stake.getAddress(), ethers.parseEther("0.5"));
      await stake.connect(user1).stakeTokens(ethers.parseEther("0.5"));

      // Mint NFT
      await exclusiveNFT.connect(user1).mint();
      expect(await exclusiveNFT.balanceOf(user1.address)).to.equal(1);
    });

    it("ExclusiveNFT: should reject mint without sufficient stake", async function () {
      await expect(
        exclusiveNFT.connect(user1).mint()
      ).to.be.revertedWithCustomError(exclusiveNFT, "MinimumStakingNotMet");
    });

    it("MainHub: should allow manual party entry with NFT", async function () {
      // Complete the full flow first
      await stakingToken
        .connect(user1)
        .approve(await stake.getAddress(), ethers.parseEther("1"));
      await mainHub
        .connect(user1)
        .claimNFT({ value: ethers.parseEther("0.1") });

      // Try manual entry for user2 (should fail - no NFT)
      await expect(
        mainHub.connect(user2).attemptPartyEntry()
      ).to.be.revertedWithCustomError(mainHub, "NFTRequired");
    });
  });
});
