import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.33",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
  },
  networks: {
    hardhat: {},
    ...(process.env.RPC_URL
      ? {
          live: {
            url: process.env.RPC_URL,
            accounts: process.env.DEPLOYER_KEY
              ? [process.env.DEPLOYER_KEY]
              : [],
          },
        }
      : {}),
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY ?? "",
  },
};

export default config;
