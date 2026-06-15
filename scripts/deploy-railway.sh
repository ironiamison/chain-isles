#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v railway >/dev/null 2>&1; then
  echo "Installing Railway CLI…"
  npm install -g @railway/cli
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Log in first: railway login"
  exit 1
fi

if [ ! -f railway.toml ] && [ ! -f railway.json ]; then
  cat > railway.toml <<'EOF'
[build]
builder = "dockerfile"

[deploy]
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
EOF
fi

railway up --detach
railway domain || true

echo "Set these in the Railway dashboard:"
echo "  ACCEPT_LICENSE=true"
echo "  SKIP_DATABASE=false  (with MongoDB Atlas vars) or true for ephemeral"
echo "  TOKEN_GATE_MINT=<your gate token mint>"
echo "  GAME_AUTHORITY_SECRET=<contents of keys/game-authority.json>"
echo "  SOLANA_PROGRAM_ID=<deployed program id>"
