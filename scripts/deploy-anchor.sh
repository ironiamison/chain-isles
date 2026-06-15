#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/program/chainmmo"

export PATH="$HOME/.cargo/bin:${HOME}/.local/share/solana/install/active_release/bin:$PATH"
unset CARGO_TARGET_DIR

CLUSTER="${SOLANA_CLUSTER:-mainnet-beta}"
KEYPAIR="${SOLANA_KEYPAIR:-$ROOT/keys/deployer.json}"

if [ ! -f "$KEYPAIR" ]; then
  solana-keygen new -o "$KEYPAIR" --no-bip39-passphrase --force
fi

case "$CLUSTER" in
  mainnet-beta) RPC="mainnet-beta" ;;
  devnet) RPC="devnet" ;;
  localnet) RPC="localhost" ;;
  *) echo "Unknown SOLANA_CLUSTER: $CLUSTER"; exit 1 ;;
esac

solana config set --url "$RPC" --keypair "$KEYPAIR"
echo "Cluster: $CLUSTER"
echo "Deployer: $(solana address)"
echo "Balance: $(solana balance)"

if [ "$RPC" = "devnet" ]; then
  echo "Requesting devnet airdrop (may rate-limit)…"
  solana airdrop 2 || true
fi

if [ "$RPC" = "mainnet-beta" ]; then
  echo ""
  echo "Mainnet deploy — you need real SOL in the deployer wallet (~2–3 SOL for program rent)."
  echo "No airdrop on mainnet. Fund: $(solana address)"
  BAL=$(solana balance | awk '{print $1}')
  if awk "BEGIN { exit !($BAL < 2) }"; then
    echo "Balance too low ($BAL SOL). Fund deployer and re-run."
    exit 1
  fi
fi

anchor build || cargo-build-sbf --manifest-path programs/chainmmo/Cargo.toml
solana program deploy target/deploy/chainmmo.so \
  --program-id target/deploy/chainmmo-keypair.json \
  --url "$RPC" \
  --keypair "$KEYPAIR"

PROGRAM_ID=$(solana address -k target/deploy/chainmmo-keypair.json)
echo ""
echo "Deployed program: $PROGRAM_ID"
echo "Update .env: SOLANA_PROGRAM_ID=$PROGRAM_ID SOLANA_CLUSTER=$CLUSTER"
echo "Copy IDL: cp program/chainmmo/target/idl/chainmmo.json packages/solana/src/idl/chainmmo.json"

AUTH="$ROOT/keys/game-authority.json"
if [ -f "$AUTH" ]; then
  FUND="${GAME_AUTHORITY_FUND:-0.1}"
  echo "Funding game authority with $FUND SOL for sync_gold txs…"
  solana transfer "$(solana address -k "$AUTH")" "$FUND" --allow-unfunded-recipient || true
fi
