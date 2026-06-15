#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.cargo/bin:${HOME}/.local/share/solana/install/active_release/bin:$PATH"

echo "Starting local MongoDB (docker compose)…"
docker compose up -d mongo

cat <<'EOF'

Local MongoDB running on mongodb://127.0.0.1:27017

Add to .env for persistent wallet characters:

SKIP_DATABASE=false
MONGODB_HOST=127.0.0.1
MONGODB_PORT=27017
MONGODB_DATABASE=chainisles
MONGODB_TLS=false
MONGODB_SRV=false

Then: yarn build && cd packages/server && PORT=8080 CLIENT_DIST=../client/dist node dist/main.js

EOF
