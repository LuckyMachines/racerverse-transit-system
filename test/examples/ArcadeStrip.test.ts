import { expect } from "chai";
import { ethers } from "hardhat";
import {
  HubRegistry,
  Arcade,
  CoinPusher,
  ClawMachine,
  PrizeCounter,
  ArcadeToken,
  PrizeTicket,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deployRegistry } from "../helpers";

describe("Arcade Strip Integration", function () {
  let registry: HubRegistry;
  let arcade: Arcade;
  let coinPusher: CoinPusher;
  let clawMachine: ClawMachine;
  let prizeCounter: PrizeCounter;
  let arcadeToken: ArcadeToken;
  let prizeTicket: PrizeTicket;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    // Deploy registry (with linked ValidCharacters library)
    registry = await deployRegistry(admin.address);

    // 1. Deploy CoinPusher (hub 1) - registers as "arcade.coin-pusher"
    const CoinPusherFactory = await ethers.getContractFactory("CoinPusher");
    coinPusher = await CoinPusherFactory.deploy(
      await registry.getAddress(),
      admin.address
    );

    // 2. Deploy ClawMachine (hub 2) - registers as "arcade.claw-machine"
    const ClawMachineFactory = await ethers.getContractFactory("ClawMachine");
    clawMachine = await ClawMachineFactory.deploy(
      await registry.getAddress(),
      admin.address
    );

    // 3. Deploy PrizeCounter (hub 3) - registers as "arcade.prize-counter"
    const PrizeCounterFactory = await ethers.getContractFactory("PrizeCounter");
    prizeCounter = await PrizeCounterFactory.deploy(
      await clawMachine.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // 4. Deploy Arcade (hub 4) - registers as "arcade.entrance"
    const ArcadeFactory = await ethers.getContractFactory("Arcade");
    arcade = await ArcadeFactory.deploy(
      await clawMachine.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // 5. Deploy ArcadeToken (mints 1M to Arcade)
    const ArcadeTokenFactory = await ethers.getContractFactory("ArcadeToken");
    arcadeToken = await ArcadeTokenFactory.deploy(await arcade.getAddress());

    // 6. Deploy PrizeTicket (mints 1M to CoinPusher)
    const PrizeTicketFactory = await ethers.getContractFactory("PrizeTicket");
    prizeTicket = await PrizeTicketFactory.deploy(
      await coinPusher.getAddress()
    );

    // 7. Set token addresses on hubs
    await arcade.setArcadeTokenAddress(await arcadeToken.getAddress());
    await coinPusher.setArcadeTokenAddress(await arcadeToken.getAddress());
    await coinPusher.setPrizeTicketAddress(await prizeTicket.getAddress());
    await clawMachine.setPrizeTicketAddress(await prizeTicket.getAddress());

    // Set up hub connections: Arcade → CoinPusher → ClawMachine → PrizeCounter → Arcade
    await coinPusher.setAllowAllInputs(true);
    await clawMachine.setAllowAllInputs(true);
    await prizeCounter.setAllowAllInputs(true);
    await arcade.setAllowAllInputs(true);

    const coinPusherId = await registry.idFromAddress(
      await coinPusher.getAddress()
    );
    const clawMachineId = await registry.idFromAddress(
      await clawMachine.getAddress()
    );
    const prizeCounterId = await registry.idFromAddress(
      await prizeCounter.getAddress()
    );
    const arcadeId = await registry.idFromAddress(await arcade.getAddress());

    // Arcade outputs to CoinPusher
    await arcade.addHubConnections([coinPusherId]);
    // CoinPusher outputs to ClawMachine
    await coinPusher.addHubConnections([clawMachineId]);
    // ClawMachine outputs to PrizeCounter
    await clawMachine.addHubConnections([prizeCounterId]);
    // PrizeCounter outputs to Arcade
    await prizeCounter.addHubConnections([arcadeId]);
  });

  describe("Full Transit Flow", function () {
    it("should complete the full playArcade flow", async function () {
      const price = ethers.parseEther("0.02");

      // User must approve CoinPusher for ArcadeTokens and ClawMachine for PrizeTickets
      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });

      // Verify: User should have leftover ArcadeTokens (50 given - 50 taken by CoinPusher = 0)
      expect(await arcadeToken.balanceOf(user1.address)).to.equal(0);

      // Verify: User should have PrizeTickets (won some, 10 taken by ClawMachine)
      // At minimum: Consolation gives 10, minus 10 for claw = 0
      // Could be more if they won bigger
      const ticketBalance = await prizeTicket.balanceOf(user1.address);
      expect(ticketBalance).to.be.gte(0);

      // Verify: User should own a Plushie NFT
      expect(await clawMachine.balanceOf(user1.address)).to.equal(1);

      // Verify: PrizeCounter should have recorded the prize
      expect(await prizeCounter.prizesRecorded(user1.address)).to.equal(1);

      // Verify: User should be in the hall of fame
      expect(await arcade.isInHallOfFame(user1.address)).to.be.true;
      const hallOfFame = await arcade.getHallOfFame();
      expect(hallOfFame.length).to.equal(1);
      expect(hallOfFame[0]).to.equal(user1.address);
    });

    it("should handle multiple users completing the flow", async function () {
      const price = ethers.parseEther("0.02");

      // Approve for both users
      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);
      await arcadeToken
        .connect(user2)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user2)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });
      await arcade.connect(user2).playArcade({ value: price });

      // Both should own plushie NFTs
      expect(await clawMachine.balanceOf(user1.address)).to.equal(1);
      expect(await clawMachine.balanceOf(user2.address)).to.equal(1);

      // Both should be in the hall of fame
      const hallOfFame = await arcade.getHallOfFame();
      expect(hallOfFame.length).to.equal(2);
      expect(await arcade.isInHallOfFame(user1.address)).to.be.true;
      expect(await arcade.isInHallOfFame(user2.address)).to.be.true;
    });

    it("should reject insufficient payment", async function () {
      await expect(
        arcade
          .connect(user1)
          .playArcade({ value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(arcade, "InsufficientPayment");
    });

    it("should allow same user to play multiple times", async function () {
      const price = ethers.parseEther("0.02");

      // Approve for user
      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });
      await arcade.connect(user1).playArcade({ value: price });

      // Should own 2 plushie NFTs
      expect(await clawMachine.balanceOf(user1.address)).to.equal(2);

      // Counter should be 2
      expect(await arcade.timesPlayed(user1.address)).to.equal(2);

      // Hall of fame registration is idempotent — still 1 entry
      const hallOfFame = await arcade.getHallOfFame();
      expect(hallOfFame.length).to.equal(1);
    });
  });

  describe("Hub Registry Naming", function () {
    it("should register all hubs with correct arcade.* names", async function () {
      expect(await registry.addressFromName("arcade.entrance")).to.equal(
        await arcade.getAddress()
      );
      expect(await registry.addressFromName("arcade.coin-pusher")).to.equal(
        await coinPusher.getAddress()
      );
      expect(await registry.addressFromName("arcade.claw-machine")).to.equal(
        await clawMachine.getAddress()
      );
      expect(await registry.addressFromName("arcade.prize-counter")).to.equal(
        await prizeCounter.getAddress()
      );
    });

    it("should have 4 total registrations", async function () {
      expect(await registry.totalRegistrations()).to.equal(4);
    });
  });

  describe("Individual Contract Checks", function () {
    it("CoinPusher: should track total plays", async function () {
      const price = ethers.parseEther("0.02");

      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });
      await arcade.connect(user1).playArcade({ value: price });

      expect(await coinPusher.totalPlays()).to.equal(2);
    });

    it("CoinPusher: should award prize tickets on entry", async function () {
      const price = ethers.parseEther("0.02");

      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });

      // lastTicketsWon should be one of the valid amounts (10, 50, 100, 200) * 1e18
      const ticketsWon = await coinPusher.lastTicketsWon(user1.address);
      const validAmounts = [10, 50, 100, 200].map((n) =>
        ethers.parseEther(String(n))
      );
      expect(validAmounts).to.include(ticketsWon);
    });

    it("ClawMachine: should mint plushie NFT with stats", async function () {
      const price = ethers.parseEther("0.02");

      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });

      // User should own exactly 1 plushie
      expect(await clawMachine.balanceOf(user1.address)).to.equal(1);

      // Plushie stats should be valid
      const stats = await clawMachine.plushieStats(0);
      // plushieType should be 0-3 (Bear, Bunny, Dragon, Unicorn)
      expect(stats.plushieType).to.be.lte(3);
      // rarity should be 0-3 (Common, Uncommon, Rare, Legendary)
      expect(stats.rarity).to.be.lte(3);
    });

    it("ClawMachine: should track plushie stats per token", async function () {
      const price = ethers.parseEther("0.02");

      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);
      await arcadeToken
        .connect(user2)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user2)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });
      await arcade.connect(user2).playArcade({ value: price });

      // Token 0 (user1) and token 1 (user2) should both have valid stats
      const stats0 = await clawMachine.plushieStats(0);
      const stats1 = await clawMachine.plushieStats(1);

      expect(stats0.plushieType).to.be.lte(3);
      expect(stats0.rarity).to.be.lte(3);
      expect(stats1.plushieType).to.be.lte(3);
      expect(stats1.rarity).to.be.lte(3);
    });

    it("PrizeCounter: should track total prizes awarded", async function () {
      const price = ethers.parseEther("0.02");

      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);
      await arcadeToken
        .connect(user2)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user2)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });
      await arcade.connect(user2).playArcade({ value: price });

      expect(await prizeCounter.totalPrizesAwarded()).to.equal(2);
    });

    it("ArcadeToken/PrizeTicket: should mint initial supply correctly", async function () {
      const expectedSupply = ethers.parseEther("1000000");

      // ArcadeToken: full supply at Arcade (before any plays)
      const arcadeBalance = await arcadeToken.balanceOf(
        await arcade.getAddress()
      );
      expect(arcadeBalance).to.equal(expectedSupply);

      // PrizeTicket: full supply at CoinPusher (before any plays)
      const coinPusherBalance = await prizeTicket.balanceOf(
        await coinPusher.getAddress()
      );
      expect(coinPusherBalance).to.equal(expectedSupply);
    });
  });

  describe("Fee Withdrawal", function () {
    it("should withdraw accumulated ETH from Arcade", async function () {
      const price = ethers.parseEther("0.02");

      await arcadeToken
        .connect(user1)
        .approve(await coinPusher.getAddress(), ethers.MaxUint256);
      await prizeTicket
        .connect(user1)
        .approve(await clawMachine.getAddress(), ethers.MaxUint256);

      await arcade.connect(user1).playArcade({ value: price });

      const balanceBefore = await ethers.provider.getBalance(admin.address);
      const tx = await arcade.withdrawFees(admin.address);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(admin.address);
      expect(balanceAfter - balanceBefore + gasCost).to.equal(ethers.parseEther("0.02"));
    });
  });
});
