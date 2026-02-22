import { expect } from "chai";
import { ethers } from "hardhat";
import {
  HubRegistry,
  LootRoll,
  Forge,
  Arena,
  TicketBooth,
  GoldToken,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deployRegistry } from "../helpers";

describe("Gaming Loot Box Integration", function () {
  let registry: HubRegistry;
  let lootRoll: LootRoll;
  let forge: Forge;
  let arena: Arena;
  let ticketBooth: TicketBooth;
  let goldToken: GoldToken;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    // Deploy registry (with linked ValidCharacters library)
    registry = await deployRegistry(admin.address);

    // 1. Deploy LootRoll (hub 1) - registers as "loot.roll"
    const LootRoll = await ethers.getContractFactory("LootRoll");
    lootRoll = await LootRoll.deploy(
      await registry.getAddress(),
      admin.address
    );

    // 2. Deploy Forge (hub 2) - registers as "loot.forge"
    const ForgeFactory = await ethers.getContractFactory("Forge");
    forge = await ForgeFactory.deploy(
      await lootRoll.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // 3. Deploy Arena (hub 3) - registers as "loot.arena"
    const ArenaFactory = await ethers.getContractFactory("Arena");
    arena = await ArenaFactory.deploy(
      await forge.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // 4. Deploy TicketBooth (hub 4) - registers as "loot.ticket-booth"
    const TicketBoothFactory = await ethers.getContractFactory("TicketBooth");
    ticketBooth = await TicketBoothFactory.deploy(
      await forge.getAddress(),
      await registry.getAddress(),
      admin.address
    );

    // 5. Deploy GoldToken (mints 1M to TicketBooth)
    const GoldTokenFactory = await ethers.getContractFactory("GoldToken");
    goldToken = await GoldTokenFactory.deploy(await ticketBooth.getAddress());

    // 6. Set gold token on TicketBooth
    await ticketBooth.setGoldTokenAddress(await goldToken.getAddress());

    // Set up hub connections: TicketBooth → LootRoll → Forge → Arena → TicketBooth
    await lootRoll.setAllowAllInputs(true);
    await forge.setAllowAllInputs(true);
    await arena.setAllowAllInputs(true);
    await ticketBooth.setAllowAllInputs(true);

    const lootRollId = await registry.idFromAddress(
      await lootRoll.getAddress()
    );
    const forgeId = await registry.idFromAddress(await forge.getAddress());
    const arenaId = await registry.idFromAddress(await arena.getAddress());
    const ticketBoothId = await registry.idFromAddress(
      await ticketBooth.getAddress()
    );

    // TicketBooth outputs to LootRoll
    await ticketBooth.addHubConnections([lootRollId]);
    // LootRoll outputs to Forge
    await lootRoll.addHubConnections([forgeId]);
    // Forge outputs to Arena
    await forge.addHubConnections([arenaId]);
    // Arena outputs to TicketBooth
    await arena.addHubConnections([ticketBoothId]);
  });

  describe("Full Transit Flow", function () {
    it("should complete the full buyLootBox flow", async function () {
      const price = ethers.parseEther("0.05");

      await ticketBooth.connect(user1).buyLootBox({ value: price });

      // Verify: User should have 100 GOLD tokens
      expect(await goldToken.balanceOf(user1.address)).to.equal(
        ethers.parseEther("100")
      );

      // Verify: User should have a roll result
      const roll = await lootRoll.getRollResult(user1.address);
      expect(roll.rolled).to.be.true;
      expect(roll.powerLevel).to.be.gte(1);
      expect(roll.powerLevel).to.be.lte(100);

      // Verify: User should own a LootItem NFT
      expect(await forge.balanceOf(user1.address)).to.equal(1);

      // Verify: User should have an equipped item
      expect(await forge.hasEquippedItem(user1.address)).to.be.true;

      // Verify: User should be registered in the Arena
      expect(await arena.isRegistered(user1.address)).to.be.true;

      // Verify: User should be an arena participant in TicketBooth
      expect(await ticketBooth.isArenaParticipant(user1.address)).to.be.true;
      const participants = await ticketBooth.getArenaParticipants();
      expect(participants.length).to.equal(1);
      expect(participants[0]).to.equal(user1.address);
    });

    it("should handle multiple users completing the flow", async function () {
      const price = ethers.parseEther("0.05");

      await ticketBooth.connect(user1).buyLootBox({ value: price });
      await ticketBooth.connect(user2).buyLootBox({ value: price });

      // Both should have gold
      expect(await goldToken.balanceOf(user1.address)).to.equal(
        ethers.parseEther("100")
      );
      expect(await goldToken.balanceOf(user2.address)).to.equal(
        ethers.parseEther("100")
      );

      // Both should own NFTs
      expect(await forge.balanceOf(user1.address)).to.equal(1);
      expect(await forge.balanceOf(user2.address)).to.equal(1);

      // Both should be arena participants
      const participants = await ticketBooth.getArenaParticipants();
      expect(participants.length).to.equal(2);
      expect(await arena.isRegistered(user1.address)).to.be.true;
      expect(await arena.isRegistered(user2.address)).to.be.true;
    });

    it("should reject insufficient payment", async function () {
      await expect(
        ticketBooth
          .connect(user1)
          .buyLootBox({ value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(ticketBooth, "InsufficientPayment");
    });

    it("should allow same user to buy multiple loot boxes", async function () {
      const price = ethers.parseEther("0.05");

      await ticketBooth.connect(user1).buyLootBox({ value: price });
      await ticketBooth.connect(user1).buyLootBox({ value: price });

      // Should have 200 GOLD (100 per box)
      expect(await goldToken.balanceOf(user1.address)).to.equal(
        ethers.parseEther("200")
      );

      // Should own 2 NFTs
      expect(await forge.balanceOf(user1.address)).to.equal(2);

      // Counter should be 2
      expect(await ticketBooth.lootBoxesBought(user1.address)).to.equal(2);

      // Arena registration is idempotent — still 1 participant
      const participants = await ticketBooth.getArenaParticipants();
      expect(participants.length).to.equal(1);
    });
  });

  describe("Hub Registry Naming", function () {
    it("should register all hubs with correct loot.* names", async function () {
      expect(await registry.addressFromName("loot.roll")).to.equal(
        await lootRoll.getAddress()
      );
      expect(await registry.addressFromName("loot.forge")).to.equal(
        await forge.getAddress()
      );
      expect(await registry.addressFromName("loot.arena")).to.equal(
        await arena.getAddress()
      );
      expect(await registry.addressFromName("loot.ticket-booth")).to.equal(
        await ticketBooth.getAddress()
      );
    });

    it("should have 4 total registrations", async function () {
      expect(await registry.totalRegistrations()).to.equal(4);
    });
  });

  describe("Individual Contract Checks", function () {
    it("LootRoll: should revert getRollResult for un-rolled user", async function () {
      await expect(
        lootRoll.getRollResult(user1.address)
      ).to.be.revertedWithCustomError(lootRoll, "NotRolled");
    });

    it("Forge: should track item stats per token", async function () {
      const price = ethers.parseEther("0.05");
      await ticketBooth.connect(user1).buyLootBox({ value: price });

      const stats = await forge.itemStats(0);
      // itemType should be 0, 1, or 2
      expect(stats.itemType).to.be.lte(2);
      // powerLevel should be 1–100
      expect(stats.powerLevel).to.be.gte(1);
      expect(stats.powerLevel).to.be.lte(100);
    });

    it("Forge: should report equipped item stats", async function () {
      const price = ethers.parseEther("0.05");
      await ticketBooth.connect(user1).buyLootBox({ value: price });

      const equipped = await forge.getEquippedStats(user1.address);
      expect(equipped.itemType).to.be.lte(2);
      expect(equipped.powerLevel).to.be.gte(1);
      expect(equipped.powerLevel).to.be.lte(100);
    });

    it("Arena: should track total registered players", async function () {
      const price = ethers.parseEther("0.05");
      await ticketBooth.connect(user1).buyLootBox({ value: price });
      await ticketBooth.connect(user2).buyLootBox({ value: price });

      expect(await arena.totalRegisteredPlayers()).to.equal(2);
      const players = await arena.getRegisteredPlayers();
      expect(players).to.include(user1.address);
      expect(players).to.include(user2.address);
    });

    it("TicketBooth: should report player stats", async function () {
      const price = ethers.parseEther("0.05");
      await ticketBooth.connect(user1).buyLootBox({ value: price });

      const [goldBalance, boxesBought, hasItem, inArena] =
        await ticketBooth.getPlayerStats(user1.address);

      expect(goldBalance).to.equal(ethers.parseEther("100"));
      expect(boxesBought).to.equal(1);
      expect(hasItem).to.be.true;
      expect(inArena).to.be.true;
    });

    it("GoldToken: should mint initial supply to TicketBooth", async function () {
      const expectedSupply = ethers.parseEther("1000000");
      const ticketBoothBalance = await goldToken.balanceOf(
        await ticketBooth.getAddress()
      );
      // TicketBooth gave 100 GOLD in beforeEach? No — no buyLootBox in beforeEach
      // So full supply should be at TicketBooth
      expect(ticketBoothBalance).to.equal(expectedSupply);
    });
  });

  describe("Fee Withdrawal", function () {
    it("should withdraw accumulated ETH from TicketBooth", async function () {
      const price = ethers.parseEther("0.05");
      await ticketBooth.connect(user1).buyLootBox({ value: price });
      await ticketBooth.connect(user2).buyLootBox({ value: price });

      // TicketBooth should hold 0.1 ETH
      const balanceBefore = await ethers.provider.getBalance(admin.address);
      const tx = await ticketBooth.withdrawFees(admin.address);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(admin.address);
      expect(balanceAfter - balanceBefore + gasCost).to.equal(ethers.parseEther("0.1"));
    });
  });
});
