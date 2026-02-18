import { expect } from "chai";
import { ethers } from "hardhat";

describe("ValidCharacters", function () {
  let validChars: any;

  before(async function () {
    // Deploy the library via a wrapper since libraries with public functions
    // are deployed as standalone contracts by Hardhat
    const ValidCharacters = await ethers.getContractFactory("ValidCharacters");
    validChars = await ValidCharacters.deploy();
  });

  describe("matches()", function () {
    it("should accept lowercase letters", async function () {
      expect(await validChars.matches("abcdefghijklmnopqrstuvwxyz")).to.be.true;
    });

    it("should accept digits", async function () {
      expect(await validChars.matches("0123456789")).to.be.true;
    });

    it("should accept dots", async function () {
      expect(await validChars.matches("sample.dex")).to.be.true;
    });

    it("should accept hyphens", async function () {
      expect(await validChars.matches("my-hub")).to.be.true;
    });

    it("should accept underscores", async function () {
      expect(await validChars.matches("my_hub")).to.be.true;
    });

    it("should accept mixed valid characters", async function () {
      expect(await validChars.matches("hub-1.test_name")).to.be.true;
    });

    it("should reject uppercase letters", async function () {
      expect(await validChars.matches("MyHub")).to.be.false;
    });

    it("should reject spaces", async function () {
      expect(await validChars.matches("my hub")).to.be.false;
    });

    it("should reject special characters", async function () {
      expect(await validChars.matches("hub@name")).to.be.false;
      expect(await validChars.matches("hub!name")).to.be.false;
      expect(await validChars.matches("hub#name")).to.be.false;
    });

    it("should reject empty string", async function () {
      expect(await validChars.matches("")).to.be.false;
    });

    it("should accept single valid character", async function () {
      // The state machine: s1 → s2(accepts) on first valid char
      expect(await validChars.matches("a")).to.be.true;
    });

    it("should accept two character string", async function () {
      expect(await validChars.matches("ab")).to.be.true;
    });

    it("should reject string that starts valid but has invalid char", async function () {
      expect(await validChars.matches("abc DEF")).to.be.false;
    });
  });
});
