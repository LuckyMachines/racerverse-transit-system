#!/usr/bin/env node
/**
 * Deploy RCS Transit System core contracts using GCP Cloud KMS signer.
 *
 * Deploys: ValidCharacters (library), HubRegistry, Railcar
 *
 * Prerequisites:
 *   1. gcloud CLI authenticated: gcloud auth application-default login
 *   2. Compiled artifacts: npx hardhat compile
 *   3. KMS key created and funded (see autoloop-worker/scripts/setup-kms-mainnet.js)
 *
 * Usage:
 *   # Deploy to mainnet (chain ID 1)
 *   node scripts/deploy-core-kms.cjs --network mainnet
 *
 *   # Deploy to sepolia (chain ID 11155111)
 *   node scripts/deploy-core-kms.cjs --network sepolia
 *
 *   # Dry run (estimate gas, don't send transactions)
 *   node scripts/deploy-core-kms.cjs --network mainnet --dry-run
 *
 *   # Use a different KMS key
 *   KMS_KEY_ARN=projects/.../cryptoKeyVersions/1 node scripts/deploy-core-kms.cjs --network mainnet
 *
 * Environment:
 *   KMS_KEY_ARN     — Full GCP key version path (default: autoloop-deployer in racerverse-custody)
 *   RPC_URL         — Override RPC endpoint
 *   DEPLOY_OUT      — Output file for deployment JSON (default: deployments.json)
 */

const { ethers } = require("ethers");
const { GcpKmsSigner } = require("./gcp-kms-signer.cjs");
const fs = require("node:fs");
const path = require("node:path");

// ── Configuration ──

const GCP_PROJECT = "racerverse-custody";
const GCP_LOCATION = "us-east1";
const GCP_KEYRING = "ethereum-keys";
const DEFAULT_KEY_NAME = "autoloop-deployer";

const DEFAULT_KMS_KEY =
  `projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/keyRings/${GCP_KEYRING}/cryptoKeys/${DEFAULT_KEY_NAME}/cryptoKeyVersions/1`;

const NETWORKS = {
  mainnet: { chainId: 1, rpc: "https://eth.drpc.org" },
  sepolia: { chainId: 11155111, rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
};

// ── Parse args ──

const args = process.argv.slice(2);
const networkIdx = args.indexOf("--network");
const networkName = networkIdx >= 0 ? args[networkIdx + 1] : "mainnet";
const dryRun = args.includes("--dry-run");

if (!NETWORKS[networkName]) {
  console.error(`Unknown network: ${networkName}. Use: ${Object.keys(NETWORKS).join(", ")}`);
  process.exit(1);
}

const network = NETWORKS[networkName];
const kmsKeyArn = process.env.KMS_KEY_ARN || DEFAULT_KMS_KEY;
const rpcUrl = process.env.RPC_URL || network.rpc;
const deployOutFile = process.env.DEPLOY_OUT || path.join(__dirname, "..", "deployments.json");

// ── Artifact loading ──

const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts", "contracts");

function loadArtifact(contractPath, contractName) {
  const artifactPath = path.join(ARTIFACTS_DIR, contractPath, `${contractName}.json`);
  const raw = fs.readFileSync(artifactPath, "utf8");
  return JSON.parse(raw);
}

/**
 * Link library references in bytecode.
 * Replaces __$<hash>$__ placeholders with the deployed library address.
 */
function linkBytecode(bytecode, linkReferences, libraries) {
  let linked = bytecode;
  for (const [sourcePath, refs] of Object.entries(linkReferences)) {
    for (const [libName, positions] of Object.entries(refs)) {
      const libAddress = libraries[libName];
      if (!libAddress) {
        throw new Error(`Missing library address for ${libName}`);
      }
      const addr = libAddress.toLowerCase().replace("0x", "");
      for (const { start, length } of positions) {
        // Each byte = 2 hex chars, +2 for "0x" prefix
        const hexStart = 2 + start * 2;
        const hexLen = length * 2;
        linked = linked.slice(0, hexStart) + addr + linked.slice(hexStart + hexLen);
      }
    }
  }
  return linked;
}

// ── Deployment helpers ──

async function deployContract(signer, abi, bytecode, constructorArgs, name) {
  console.log(`\nDeploying ${name}...`);

  const factory = new ethers.ContractFactory(abi, bytecode, signer);

  if (dryRun) {
    const deployTx = await factory.getDeployTransaction(...constructorArgs);
    const gasEstimate = await signer.provider.estimateGas(deployTx);
    const feeData = await signer.provider.getFeeData();
    const gasCost = gasEstimate * (feeData.maxFeePerGas || feeData.gasPrice || 0n);
    console.log(`  [DRY RUN] ${name}:`);
    console.log(`    Gas estimate: ${gasEstimate.toString()}`);
    console.log(`    Est. cost: ${ethers.formatEther(gasCost)} ETH`);
    return null;
  }

  const contract = await factory.deploy(...constructorArgs);
  const tx = contract.deploymentTransaction();
  console.log(`  tx: ${tx.hash}`);
  console.log(`  Waiting for confirmation...`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await tx.wait(1);
  console.log(`  ${name} deployed at: ${address}`);
  console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
  return address;
}

// ── Main ──

async function main() {
  console.log("=== RCS Transit System Core Deployment ===");
  console.log(`  Network:  ${networkName} (chain ${network.chainId})`);
  console.log(`  RPC:      ${rpcUrl}`);
  console.log(`  KMS key:  .../${DEFAULT_KEY_NAME}/cryptoKeyVersions/1`);
  console.log(`  Dry run:  ${dryRun}`);
  console.log();

  // Connect provider and signer
  const provider = new ethers.JsonRpcProvider(rpcUrl, network.chainId);
  const actualNetwork = await provider.getNetwork();
  if (actualNetwork.chainId !== BigInt(network.chainId)) {
    throw new Error(`Chain ID mismatch: expected ${network.chainId}, got ${actualNetwork.chainId}`);
  }

  const signer = new GcpKmsSigner(kmsKeyArn, provider);
  const deployerAddress = await signer.getAddress();
  const balance = await provider.getBalance(deployerAddress);

  console.log(`  Deployer: ${deployerAddress}`);
  console.log(`  Balance:  ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error("Deployer has zero balance — fund the KMS wallet first");
  }

  // Load artifacts
  const validCharsArtifact = loadArtifact("ValidCharacters.sol", "ValidCharacters");
  const hubRegistryArtifact = loadArtifact("HubRegistry.sol", "HubRegistry");
  const railcarArtifact = loadArtifact("Railcar.sol", "Railcar");

  // 1. Deploy ValidCharacters (library — no constructor args)
  const validCharsAddr = await deployContract(
    signer,
    validCharsArtifact.abi,
    validCharsArtifact.bytecode,
    [],
    "ValidCharacters"
  );

  // 2. Deploy HubRegistry (linked with ValidCharacters, admin as constructor arg)
  // In dry run, use a dummy address for linking so ethers can parse the bytecode
  const linkAddr = validCharsAddr || "0x0000000000000000000000000000000000000001";
  const hubRegistryBytecode = linkBytecode(
    hubRegistryArtifact.bytecode,
    hubRegistryArtifact.linkReferences,
    { ValidCharacters: linkAddr }
  );

  const hubRegistryAddr = await deployContract(
    signer,
    hubRegistryArtifact.abi,
    hubRegistryBytecode,
    [deployerAddress],
    "HubRegistry"
  );

  // 3. Deploy Railcar (admin as constructor arg)
  const railcarAddr = await deployContract(
    signer,
    railcarArtifact.abi,
    railcarArtifact.bytecode,
    [deployerAddress],
    "Railcar"
  );

  if (dryRun) {
    console.log("\n=== DRY RUN COMPLETE — no transactions sent ===");
    return;
  }

  // Write deployments
  const deployment = {
    network: networkName,
    chainId: network.chainId,
    deployer: deployerAddress,
    deployedAt: new Date().toISOString(),
    contracts: {
      ValidCharacters: validCharsAddr,
      HubRegistry: hubRegistryAddr,
      Railcar: railcarAddr,
    },
  };

  // Load existing deployments or create new
  let deployments = {};
  if (fs.existsSync(deployOutFile)) {
    try {
      deployments = JSON.parse(fs.readFileSync(deployOutFile, "utf8"));
    } catch {
      deployments = {};
    }
  }

  deployments[networkName] = deployment;
  fs.writeFileSync(deployOutFile, JSON.stringify(deployments, null, 2) + "\n");

  console.log(`\n=== Deployment Complete ===`);
  console.log(`  ValidCharacters: ${validCharsAddr}`);
  console.log(`  HubRegistry:     ${hubRegistryAddr}`);
  console.log(`  Railcar:         ${railcarAddr}`);
  console.log(`\n  Saved to: ${deployOutFile}`);
  console.log(`\n  DEPLOYMENT_JSON::${JSON.stringify(deployment)}`);
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
