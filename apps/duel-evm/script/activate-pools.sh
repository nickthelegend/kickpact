#!/bin/bash
# One-command go-live for KickpactPools once the deployer has Sepolia gas.
#   DEPLOYER_PRIVATE_KEY=0x… ./script/activate-pools.sh
# Deploys, patches deployed.json + the app's chain.ts (address + live:true),
# then prints the follow-ups (APK rebuild + keeper).
set -euo pipefail
cd "$(dirname "$0")/.."

RPC="${RPC:-https://ethereum-sepolia-rpc.publicnode.com}"
[ -n "${DEPLOYER_PRIVATE_KEY:-}" ] || { echo "set DEPLOYER_PRIVATE_KEY"; exit 1; }

echo "── deploying KickpactPools to Sepolia…"
OUT=$(forge script script/DeployPools.s.sol --rpc-url "$RPC" --broadcast 2>&1)
ADDR=$(echo "$OUT" | grep -oE "KickpactPools deployed at: +0x[a-fA-F0-9]{40}" | grep -oE "0x[a-fA-F0-9]{40}" | head -1)
[ -n "$ADDR" ] || { echo "$OUT" | tail -20; echo "deploy failed — no address parsed"; exit 1; }
echo "   KickpactPools: $ADDR"

echo "── patching deployed.json…"
python3 - "$ADDR" <<'EOF'
import json, sys
addr = sys.argv[1]
p = json.load(open("deployed.json"))
p["contracts"]["KickpactPools"] = addr
json.dump(p, open("deployed.json", "w"), indent=2)
print("   deployed.json ✓")
EOF

echo "── patching apps/mobile/src/chain.ts (POOLS.address + live:true)…"
python3 - "$ADDR" <<'EOF'
import re, sys
addr = sys.argv[1]
path = "../mobile/src/chain.ts"
s = open(path).read()
s = re.sub(r'(export const POOLS = \{\n  address: ")0x[0-9a-fA-F]{40}(")', rf'\g<1>{addr}\g<2>', s)
s = s.replace("live: false,", "live: true,")
open(path, "w").write(s)
print("   chain.ts ✓")
EOF

echo ""
echo "DONE. Next:"
echo "  1. cd ../mobile && bun test src && npm run test:integration"
echo "  2. rebuild the APK (android/gradlew assembleRelease)"
echo "  3. run the keeper: KEEPER_PRIVATE_KEY=\$DEPLOYER_PRIVATE_KEY bun scripts/kickpact-settle-keeper.ts"
