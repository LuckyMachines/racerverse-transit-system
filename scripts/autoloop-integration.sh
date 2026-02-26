#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Transit + AutoLoop Integration Test
#
# Deploys AutoLoop core, deploys Transit Depot flow, registers
# Depot with AutoLoop, runs worker, and verifies dispatch.
# ============================================================

DEPLOYER_KEY="${DEPLOYER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
CONTROLLER_KEY="${CONTROLLER_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
USER1_KEY="${USER1_KEY:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}"
USER2_KEY="${USER2_KEY:-0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6}"

USER1_ADDR="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
USER2_ADDR="0x90F79bf6EB2c4f870365E785982E1f101E93b906"
CONTROLLER_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

RPC_URL="${RPC_URL:-http://localhost:8555}"
ANVIL_PORT="${ANVIL_PORT:-8555}"
DEPOT_INTERVAL="${DEPOT_INTERVAL:-2}"
WORKER_EXPIRATION="${WORKER_EXPIRATION:-8}"
WORKER_TIMEOUT="${WORKER_TIMEOUT:-45}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRANSIT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AUTOLOOP_DIR="${AUTOLOOP_DIR:-$TRANSIT_DIR/../AUTOLOOP_STUFF/autoloop}"
WORKER_DIR="${WORKER_DIR:-$TRANSIT_DIR/../AUTOLOOP_STUFF/autoloop-worker}"

ANVIL_PID=""
CREATED_FILES=()
PASS_COUNT=0
FAIL_COUNT=0

log()  { printf "  [%-8s] %-46s" "$1" "$2"; }
ok()   { echo "OK"; }
pass() { echo "PASS"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL - $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

normalize_uint() {
  local raw
  raw="$(echo "$1" | tr -d ' \r\n')"
  node -e "const s=process.argv[1]; console.log(BigInt(s).toString());" "$raw"
}

backup_or_track() {
  local file="$1"
  if [ -f "$file" ]; then
    cp "$file" "${file}.transit.bak"
  else
    CREATED_FILES+=("$file")
  fi
}

cleanup() {
  echo ""
  log "CLEANUP" "Restoring processes and worker config..."
  if [ -n "$ANVIL_PID" ]; then
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
  taskkill //F //IM anvil.exe > /dev/null 2>&1 || true

  for f in "$WORKER_DIR/controller.config.json" \
           "$WORKER_DIR/.env" \
           "$WORKER_DIR/deployments.json"; do
    if [ -f "${f}.transit.bak" ]; then
      mv "${f}.transit.bak" "$f"
    fi
  done
  for f in ${CREATED_FILES[@]+"${CREATED_FILES[@]}"}; do
    rm -f "$f" 2>/dev/null || true
  done
  rm -f /tmp/transit-autoloop-worker.log 2>/dev/null || true
  ok

  local total=$((PASS_COUNT + FAIL_COUNT))
  echo ""
  echo "  === RESULT: ${PASS_COUNT}/${total} assertions passed ==="
  echo ""
  if [ "$FAIL_COUNT" -eq 0 ] && [ "$total" -gt 0 ]; then
    exit 0
  fi
  exit 1
}
trap cleanup EXIT

echo ""
echo "  === Transit + AutoLoop Integration ==="
echo ""

log "PHASE 1" "Killing stale anvil processes..."
taskkill //F //IM anvil.exe > /dev/null 2>&1 || true
sleep 1
ok

log "PHASE 1" "Starting anvil on port ${ANVIL_PORT}..."
anvil --block-time 2 --port "$ANVIL_PORT" > /dev/null 2>&1 &
ANVIL_PID=$!
for _i in $(seq 1 15); do
  if curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    "$RPC_URL" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
ok

log "PHASE 1" "Deploying AutoLoop core contracts..."
DEPLOY_OUTPUT=$(cd "$AUTOLOOP_DIR" && PRIVATE_KEY="$DEPLOYER_KEY" \
  forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast 2>&1)

AUTOLOOP=$(echo "$DEPLOY_OUTPUT" | grep "AutoLoop:" | grep -v "Registry\|Registrar" | awk '{print $2}')
REGISTRY=$(echo "$DEPLOY_OUTPUT" | grep "AutoLoopRegistry:" | awk '{print $2}')
REGISTRAR=$(echo "$DEPLOY_OUTPUT" | grep "AutoLoopRegistrar:" | awk '{print $2}')
if [ -z "$AUTOLOOP" ] || [ -z "$REGISTRY" ] || [ -z "$REGISTRAR" ]; then
  echo "Could not parse AutoLoop deployments:"
  echo "$DEPLOY_OUTPUT" | tail -20
  exit 1
fi
ok

log "PHASE 2" "Deploying Transit Depot flow..."
TRANSIT_DEPLOY_OUTPUT=$(cd "$TRANSIT_DIR" && RPC_URL="$RPC_URL" DEPLOYER_KEY="$DEPLOYER_KEY" \
  DEPOT_INTERVAL="$DEPOT_INTERVAL" npx hardhat run scripts/deploy-depot-stack.ts --network live 2>&1)
DEPLOY_JSON=$(echo "$TRANSIT_DEPLOY_OUTPUT" | grep "DEPLOYMENT_JSON::" | tail -1 | sed 's/^.*DEPLOYMENT_JSON:://')
if [ -z "$DEPLOY_JSON" ]; then
  echo "Could not parse transit deployment output:"
  echo "$TRANSIT_DEPLOY_OUTPUT"
  exit 1
fi
readarray -t TRANSIT_VALS < <(node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.depot); console.log(d.stampStation);" <<<"$DEPLOY_JSON")
DEPOT="${TRANSIT_VALS[0]}"
STAMP_STATION="${TRANSIT_VALS[1]}"
ok

log "PHASE 2" "Configuring worker for anvil..."
backup_or_track "$WORKER_DIR/controller.config.json"
backup_or_track "$WORKER_DIR/.env"
backup_or_track "$WORKER_DIR/deployments.json"

cat > "$WORKER_DIR/controller.config.json" << 'CONFIGEOF'
{
  "network": "anvil",
  "allowList": [],
  "blockList": [],
  "test": { "network": "anvil", "allowList": [], "blockList": [] },
  "main": { "network": "anvil", "allowList": [], "blockList": [] },
  "testMode": true
}
CONFIGEOF

cat > "$WORKER_DIR/.env" << ENVEOF
PRIVATE_KEY=$CONTROLLER_KEY
RPC_URL=$RPC_URL
PRIVATE_KEY_ANVIL=$CONTROLLER_KEY
RPC_URL_ANVIL=$RPC_URL
PRIVATE_KEY_TESTNET=$CONTROLLER_KEY
RPC_URL_TESTNET=$RPC_URL
ENVEOF

(cd "$WORKER_DIR" && node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('deployments.json', 'utf8'));
d.anvil = {
  AUTO_LOOP: '${AUTOLOOP}',
  AUTO_LOOP_REGISTRY: '${REGISTRY}',
  AUTO_LOOP_REGISTRAR: '${REGISTRAR}'
};
fs.writeFileSync('deployments.json', JSON.stringify(d, null, 2) + '\\n');
")
ok

log "PHASE 3" "Registering worker controller..."
REG_OUTPUT=$(cd "$WORKER_DIR" && node scripts/register-controller.js 2>&1 || true)
IS_CTRL=$(cast call "$REGISTRY" "isRegisteredController(address)(bool)" "$CONTROLLER_ADDR" --rpc-url "$RPC_URL" 2>&1 || true)
if echo "$IS_CTRL" | grep -qi "true"; then
  pass
else
  fail "controller registration failed ($REG_OUTPUT)"
fi

log "PHASE 3" "Registering Depot with AutoLoop..."
cast send "$REGISTRAR" "registerAutoLoopFor(address,uint256)" "$DEPOT" 500000 \
  --value 1ether --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
IS_DEPOT_REG=$(cast call "$REGISTRY" "isRegisteredAutoLoop(address)(bool)" "$DEPOT" --rpc-url "$RPC_URL" 2>&1 || true)
if echo "$IS_DEPOT_REG" | grep -qi "true"; then
  pass
else
  fail "depot registration not visible in registry"
fi

log "PHASE 4" "Queueing transit users..."
cast send "$DEPOT" "enterQueue()" --value 0.005ether --rpc-url "$RPC_URL" --private-key "$USER1_KEY" > /dev/null
cast send "$DEPOT" "enterQueue()" --value 0.005ether --rpc-url "$RPC_URL" --private-key "$USER2_KEY" > /dev/null
ok

log "PHASE 4" "Starting worker and waiting for dispatch..."
sleep $((DEPOT_INTERVAL + 2))
(cd "$WORKER_DIR" && node scripts/worker.js 1 "$WORKER_EXPIRATION") > /tmp/transit-autoloop-worker.log 2>&1 &
WORKER_PID=$!
ELAPSED=0
while [ "$ELAPSED" -lt "$WORKER_TIMEOUT" ]; do
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    break
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done
kill "$WORKER_PID" 2>/dev/null || true
wait "$WORKER_PID" 2>/dev/null || true
ok

log "PHASE 4" "Verifying Depot trips + StampStation stamps..."
TRIPS1_RAW=$(cast call "$DEPOT" "tripsCompleted(address)(uint256)" "$USER1_ADDR" --rpc-url "$RPC_URL")
TRIPS2_RAW=$(cast call "$DEPOT" "tripsCompleted(address)(uint256)" "$USER2_ADDR" --rpc-url "$RPC_URL")
STAMPS1_RAW=$(cast call "$STAMP_STATION" "stamps(address)(uint256)" "$USER1_ADDR" --rpc-url "$RPC_URL")
STAMPS2_RAW=$(cast call "$STAMP_STATION" "stamps(address)(uint256)" "$USER2_ADDR" --rpc-url "$RPC_URL")

TRIPS1=$(normalize_uint "$TRIPS1_RAW")
TRIPS2=$(normalize_uint "$TRIPS2_RAW")
STAMPS1=$(normalize_uint "$STAMPS1_RAW")
STAMPS2=$(normalize_uint "$STAMPS2_RAW")

if [ "$TRIPS1" -ge 1 ] && [ "$TRIPS2" -ge 1 ] && [ "$STAMPS1" -ge 1 ] && [ "$STAMPS2" -ge 1 ]; then
  pass
else
  fail "unexpected values: trips=[$TRIPS1,$TRIPS2], stamps=[$STAMPS1,$STAMPS2]"
  echo "Worker log (tail):"
  tail -20 /tmp/transit-autoloop-worker.log || true
fi

echo ""
echo "  Deployed:"
echo "    AutoLoop:      $AUTOLOOP"
echo "    Registry:      $REGISTRY"
echo "    Registrar:     $REGISTRAR"
echo "    Depot:         $DEPOT"
echo "    StampStation:  $STAMP_STATION"
echo ""
