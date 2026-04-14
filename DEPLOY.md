# Deploying RCS Transit System

This guide covers deploying the core contracts (ValidCharacters, HubRegistry, Railcar) to Ethereum mainnet and Sepolia using a GCP Cloud KMS signer.

## Prerequisites

1. **GCP CLI authenticated:**
   ```bash
   gcloud auth application-default login
   ```

2. **IAM permissions** on the GCP project/keyring that holds your KMS key:
   - `cloudkms.cryptoKeyVersions.useToSign`
   - `cloudkms.cryptoKeyVersions.viewPublicKey`

3. **Funded KMS wallet** — the Ethereum address derived from your KMS key needs ETH on the target network. Mainnet deployment costs ~0.00017 ETH total (~3M gas across 3 contracts).

4. **Compiled contracts:**
   ```bash
   npx hardhat compile
   ```

5. **Dependencies installed:**
   ```bash
   npm install
   ```

## Deploying with KMS

### Dry run (estimate gas, no transactions)

```bash
# Mainnet
npm run deploy:core:mainnet:dry

# Sepolia
npm run deploy:core:sepolia:dry
```

### Deploy for real

```bash
# Mainnet
npm run deploy:core:mainnet

# Sepolia
npm run deploy:core:sepolia
```

### Using a custom KMS key

By default, the script uses `autoloop-deployer` in the `ethereum-keys` keyring. Override with:

```bash
KMS_KEY_ARN=projects/YOUR_PROJECT/locations/YOUR_LOCATION/keyRings/YOUR_KEYRING/cryptoKeys/YOUR_KEY/cryptoKeyVersions/1 \
  node scripts/deploy-core-kms.cjs --network mainnet
```

### Using a custom RPC

```bash
RPC_URL=https://your-rpc-endpoint.com node scripts/deploy-core-kms.cjs --network mainnet
```

## What gets deployed

| Order | Contract | Purpose | Constructor Args |
|-------|----------|---------|-----------------|
| 1 | ValidCharacters | Library for hub name validation | (none) |
| 2 | HubRegistry | Central registry for all hubs (linked to ValidCharacters) | `admin` address |
| 3 | Railcar | Group transit management | `admin` address |

The `admin` address is automatically set to the KMS deployer's derived Ethereum address.

## Output

Deployment addresses are written to `deployments.json` in the project root:

```json
{
  "mainnet": {
    "network": "mainnet",
    "chainId": 1,
    "deployer": "0x...",
    "deployedAt": "2026-03-16T01:04:03.202Z",
    "contracts": {
      "ValidCharacters": "0x...",
      "HubRegistry": "0x...",
      "Railcar": "0x..."
    }
  }
}
```

Running the script for a second network merges into the same file.

## Deploying without KMS (private key)

For local/test deployments using a raw private key, use the Hardhat-based flow:

```bash
# Set env vars
export RPC_URL=http://localhost:8545
export DEPLOYER_KEY=your_private_key_without_0x

# Deploy via Hardhat Ignition (core only)
npx hardhat ignition deploy ignition/modules/TransitSystem.ts --network live

# Or deploy Depot example stack
npm run deploy:depot:live
```

## Publishing to Verdaccio

After deployment, bump the version and publish so other packages get the new `deployments.json`:

```bash
# Bump version in package.json, then:
npm run registry:prod        # point at production Verdaccio
npm run publish:registry     # publish
```

## Creating a new KMS key

If you need a fresh deployer key, see the setup script in `autoloop-worker/scripts/setup-kms-mainnet.js` for reference. The process:

1. Create an `EC_SIGN_SECP256K1_SHA256` key with HSM protection in your GCP KMS keyring
2. Derive the Ethereum address from the public key
3. Fund the address with ETH on the target network
4. Set `KMS_KEY_ARN` to the full key version path and run the deploy script
