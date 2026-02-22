import { expect } from "chai";
import { ethers } from "hardhat";
import {
  HubRegistry,
  Railcar,
  Concourse,
  Gallery,
  SoundStage,
  GameRoom,
  MallCredit,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deployRegistry } from "../helpers";

describe("Mall Crawl Integration", function () {
  let registry: HubRegistry;
  let railcar: Railcar;
  let concourse: Concourse;
  let gallery: Gallery;
  let soundStage: SoundStage;
  let gameRoom: GameRoom;
  let mallCredit: MallCredit;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    // 1. Deploy registry (with linked ValidCharacters library)
    registry = await deployRegistry(admin.address);

    // 2. Deploy Railcar (standalone)
    const RailcarFactory = await ethers.getContractFactory("Railcar");
    railcar = await RailcarFactory.deploy(admin.address);

    // 3. Deploy Gallery (hub 1), SoundStage (hub 2), GameRoom (hub 3)
    const GalleryFactory = await ethers.getContractFactory("Gallery");
    gallery = await GalleryFactory.deploy(
      await railcar.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    const SoundStageFactory = await ethers.getContractFactory("SoundStage");
    soundStage = await SoundStageFactory.deploy(
      await railcar.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    const GameRoomFactory = await ethers.getContractFactory("GameRoom");
    gameRoom = await GameRoomFactory.deploy(
      await railcar.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // 4. Deploy Concourse (hub 4) - needs Gallery + SoundStage for VIP checks
    const ConcourseFactory = await ethers.getContractFactory("Concourse");
    concourse = await ConcourseFactory.deploy(
      await railcar.getAddress(),
      await gallery.getAddress(),
      await soundStage.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // 5. Deploy MallCredit → mints 500K to Concourse + 500K to GameRoom
    const MallCreditFactory = await ethers.getContractFactory("MallCredit");
    mallCredit = await MallCreditFactory.deploy(
      await concourse.getAddress(),
      await gameRoom.getAddress()
    );

    // 6. Set MallCredit address on Concourse, SoundStage, GameRoom
    await concourse.setMallCreditAddress(await mallCredit.getAddress());
    await soundStage.setMallCreditAddress(await mallCredit.getAddress());
    await gameRoom.setMallCreditAddress(await mallCredit.getAddress());

    // 7. Allow all inputs on all 4 hubs
    await gallery.setAllowAllInputs(true);
    await soundStage.setAllowAllInputs(true);
    await gameRoom.setAllowAllInputs(true);
    await concourse.setAllowAllInputs(true);

    // 8. Connect cycle: Concourse → Gallery → SoundStage → GameRoom → Concourse
    const galleryId = await registry.idFromAddress(
      await gallery.getAddress()
    );
    const soundStageId = await registry.idFromAddress(
      await soundStage.getAddress()
    );
    const gameRoomId = await registry.idFromAddress(
      await gameRoom.getAddress()
    );
    const concourseId = await registry.idFromAddress(
      await concourse.getAddress()
    );

    await concourse.addHubConnections([galleryId]);
    await gallery.addHubConnections([soundStageId]);
    await soundStage.addHubConnections([gameRoomId]);
    await gameRoom.addHubConnections([concourseId]);
  });

  describe("Full Transit Flow", function () {
    it("should complete the full mall crawl with a 2-member railcar", async function () {
      const price = ethers.parseEther("0.01");

      // Create railcar with limit 5, then both users join
      await railcar.connect(user1).createRailcar(5);
      await railcar.connect(user1).joinRailcar(1);
      await railcar.connect(user2).joinRailcar(1);

      // Members pre-approve SoundStage for MallCredit spending
      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);
      await mallCredit
        .connect(user2)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });

      // Both members should own art NFTs from Gallery
      expect(await gallery.balanceOf(user1.address)).to.equal(1);
      expect(await gallery.balanceOf(user2.address)).to.equal(1);

      // Both members should own music NFTs from SoundStage
      expect(await soundStage.balanceOf(user1.address)).to.equal(1);
      expect(await soundStage.balanceOf(user2.address)).to.equal(1);

      // Both members should have completed 1 crawl
      expect(await concourse.crawlsCompleted(user1.address)).to.equal(1);
      expect(await concourse.crawlsCompleted(user2.address)).to.equal(1);

      // Both members should be VIP (they hold both Gallery + SoundStage NFTs)
      expect(await concourse.isVIP(user1.address)).to.be.true;
      expect(await concourse.isVIP(user2.address)).to.be.true;

      // Both members should have MallCredit balance:
      // Started with 100, paid 20 to SoundStage, received 10-100 from GameRoom
      const balance1 = await mallCredit.balanceOf(user1.address);
      const balance2 = await mallCredit.balanceOf(user2.address);
      expect(balance1).to.be.gte(ethers.parseEther("90"));
      expect(balance1).to.be.lte(ethers.parseEther("180"));
      expect(balance2).to.be.gte(ethers.parseEther("90"));
      expect(balance2).to.be.lte(ethers.parseEther("180"));
    });

    it("should handle a single-member railcar", async function () {
      const price = ethers.parseEther("0.01");

      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });

      expect(await gallery.balanceOf(user1.address)).to.equal(1);
      expect(await soundStage.balanceOf(user1.address)).to.equal(1);
      expect(await concourse.crawlsCompleted(user1.address)).to.equal(1);
      expect(await concourse.isVIP(user1.address)).to.be.true;
    });

    it("should reject insufficient payment", async function () {
      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      await expect(
        concourse
          .connect(user1)
          .startCrawl(1, { value: ethers.parseEther("0.005") })
      ).to.be.revertedWithCustomError(concourse, "InsufficientPayment");
    });

    it("should allow same railcar to crawl multiple times", async function () {
      const price = ethers.parseEther("0.01");

      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });
      await concourse.connect(user1).startCrawl(1, { value: price });

      // Should own 2 art NFTs and 2 music NFTs
      expect(await gallery.balanceOf(user1.address)).to.equal(2);
      expect(await soundStage.balanceOf(user1.address)).to.equal(2);

      // Crawls completed should be 2
      expect(await concourse.crawlsCompleted(user1.address)).to.equal(2);

      // VIP is idempotent — still true
      expect(await concourse.isVIP(user1.address)).to.be.true;
    });

    it("should handle multiple separate railcars", async function () {
      const price = ethers.parseEther("0.01");

      // Railcar 1: user1
      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      // Railcar 2: user2
      await railcar.connect(user2).createRailcar(1);
      await railcar.connect(user2).joinRailcar(2);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);
      await mallCredit
        .connect(user2)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });
      await concourse.connect(user2).startCrawl(2, { value: price });

      // Both users should own 1 art + 1 music NFT each
      expect(await gallery.balanceOf(user1.address)).to.equal(1);
      expect(await gallery.balanceOf(user2.address)).to.equal(1);
      expect(await soundStage.balanceOf(user1.address)).to.equal(1);
      expect(await soundStage.balanceOf(user2.address)).to.equal(1);

      // Both should have completed 1 crawl
      expect(await concourse.crawlsCompleted(user1.address)).to.equal(1);
      expect(await concourse.crawlsCompleted(user2.address)).to.equal(1);
    });
  });

  describe("Hub Registry Naming", function () {
    it("should register all hubs with correct mall.* names", async function () {
      expect(await registry.addressFromName("mall.concourse")).to.equal(
        await concourse.getAddress()
      );
      expect(await registry.addressFromName("mall.gallery")).to.equal(
        await gallery.getAddress()
      );
      expect(await registry.addressFromName("mall.sound-stage")).to.equal(
        await soundStage.getAddress()
      );
      expect(await registry.addressFromName("mall.game-room")).to.equal(
        await gameRoom.getAddress()
      );
    });

    it("should have 4 total registrations", async function () {
      expect(await registry.totalRegistrations()).to.equal(4);
    });
  });

  describe("Individual Contract Checks", function () {
    it("Gallery: should mint art NFT with valid stats", async function () {
      const price = ethers.parseEther("0.01");

      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });

      // User should own exactly 1 art NFT
      expect(await gallery.balanceOf(user1.address)).to.equal(1);

      // Art stats should be valid
      const stats = await gallery.artStats(0);
      // style should be 0-3 (Abstract, Geometric, Surreal, Minimalist)
      expect(stats.style).to.be.lte(3);
      // palette should be 0-3 (Warm, Cool, Monochrome, Neon)
      expect(stats.palette).to.be.lte(3);
    });

    it("SoundStage: should mint music NFT with valid stats", async function () {
      const price = ethers.parseEther("0.01");

      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });

      // User should own exactly 1 music NFT
      expect(await soundStage.balanceOf(user1.address)).to.equal(1);

      // Music stats should be valid
      const stats = await soundStage.musicStats(0);
      // genre should be 0-3 (Electronic, Jazz, Classical, HipHop)
      expect(stats.genre).to.be.lte(3);
      // bpm should be 60-180
      expect(stats.bpm).to.be.gte(60);
      expect(stats.bpm).to.be.lte(180);
    });

    it("GameRoom: should track total games played", async function () {
      const price = ethers.parseEther("0.01");

      await railcar.connect(user1).createRailcar(5);
      await railcar.connect(user1).joinRailcar(1);
      await railcar.connect(user2).joinRailcar(1);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);
      await mallCredit
        .connect(user2)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });

      // 2 members = 2 games played
      expect(await gameRoom.totalGamesPlayed()).to.equal(2);
    });

    it("GameRoom: should award valid credit amounts", async function () {
      const price = ethers.parseEther("0.01");

      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });

      // lastCreditsWon should be one of the valid amounts (10, 25, 50, 100) * 1e18
      const creditsWon = await gameRoom.lastCreditsWon(user1.address);
      const validAmounts = [10, 25, 50, 100].map((n) =>
        ethers.parseEther(String(n))
      );
      expect(validAmounts).to.include(creditsWon);
    });

    it("Concourse: should report shopper stats", async function () {
      const price = ethers.parseEther("0.01");

      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });

      const [creditBalance, crawls, vipStatus] =
        await concourse.getShopperStats(user1.address);

      expect(creditBalance).to.be.gt(0);
      expect(crawls).to.equal(1);
      expect(vipStatus).to.be.true;
    });

    it("MallCredit: should mint initial supply correctly", async function () {
      const expectedSupply = ethers.parseEther("500000");

      // Concourse should have 500K MallCredit (before any crawls)
      const concourseBalance = await mallCredit.balanceOf(
        await concourse.getAddress()
      );
      expect(concourseBalance).to.equal(expectedSupply);

      // GameRoom should have 500K MallCredit (before any crawls)
      const gameRoomBalance = await mallCredit.balanceOf(
        await gameRoom.getAddress()
      );
      expect(gameRoomBalance).to.equal(expectedSupply);
    });
  });

  describe("Fee Withdrawal", function () {
    it("should withdraw accumulated ETH from Concourse", async function () {
      const price = ethers.parseEther("0.01");

      await railcar.connect(user1).createRailcar(1);
      await railcar.connect(user1).joinRailcar(1);

      await mallCredit
        .connect(user1)
        .approve(await soundStage.getAddress(), ethers.MaxUint256);

      await concourse.connect(user1).startCrawl(1, { value: price });

      const balanceBefore = await ethers.provider.getBalance(admin.address);
      const tx = await concourse.withdrawFees(admin.address);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(admin.address);
      expect(balanceAfter - balanceBefore + gasCost).to.equal(ethers.parseEther("0.01"));
    });
  });
});
