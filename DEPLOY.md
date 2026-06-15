# Chain Isles — Deploy

2D browser MMORPG — a Kaetram Solana fork with wallet login and on-chain marketplace.

## One-click: Railway (recommended)

Game + WebSocket + static client on **one URL**.

1. Create a free account at [railway.app](https://railway.app)
2. Install CLI: `npm i -g @railway/cli`
3. Login: `railway login`
4. From this repo root:

```bash
bash scripts/deploy-railway.sh
# or: railway init && railway up && railway domain
```

5. Open the generated URL — play as guest, account, or wallet.

### Environment variables (Railway dashboard)

| Variable | Value |
|----------|-------|
| `ACCEPT_LICENSE` | `true` |
| `SKIP_DATABASE` | `true` |
| `PORT` | (auto-injected by Railway) |
| `CLIENT_DIST` | `/app/packages/client/dist` |
| `TOKEN_GATE_ENABLED` | `false` (launch — no token required to play) |
| `TOKEN_GATE_MINT` | pump.fun CA (shown on login screen) |
| `TOKEN_GATE_SYMBOL` | `ISLE` |
| `TOKEN_GATE_DECIMALS` | `6` |
| `GAME_AUTHORITY_SECRET` | JSON array from `keys/game-authority.json` |
| `SOLANA_PROGRAM_ID` | deployed program id (after `scripts/deploy-anchor.sh`) |

### Persistent characters (MongoDB)

**Production (Railway):** add a **MongoDB** plugin in the same Railway project. The game service connects over the private network:

| Variable | Value |
|----------|-------|
| `SKIP_DATABASE` | `false` |
| `MONGODB_HOST` | `mongodb.railway.internal` |
| `MONGODB_PORT` | `27017` |
| `MONGODB_USER` / `MONGODB_PASSWORD` | From the MongoDB service variables |
| `MONGODB_DATABASE` | `chainisles` |
| `MONGODB_AUTH_SOURCE` | `admin` |
| `MONGODB_TLS` | `false` |
| `MONGODB_SRV` | `false` |

Verify: `curl https://www.chainisles.xyz/api/status` → `"database":{"enabled":true,"connected":true}`

**Alternative (MongoDB Atlas):**

| Variable | Value |
|----------|-------|
| `SKIP_DATABASE` | `false` |
| `MONGODB_SRV` | `true` |
| `MONGODB_HOST` | `cluster0.xxxxx.mongodb.net` |
| `MONGODB_USER` / `MONGODB_PASSWORD` | Atlas credentials |
| `MONGODB_DATABASE` | `chainisles` |
| `MONGODB_TLS` | `true` |

Local alternative: `bash scripts/setup-local-mongo.sh` then use `MONGODB_HOST=127.0.0.1`.

## Alternative: Render

1. Push this repo to your GitHub
2. New **Web Service** → connect repo
3. Environment: **Docker**
4. Render reads `Dockerfile` automatically
5. Add env vars above in Render dashboard

## Local production test

```bash
yarn build
cd packages/server
PORT=8080 CLIENT_DIST=../client/dist node dist/main.js
# open http://localhost:8080
```

## How it works

- `Dockerfile` builds client + server
- Server serves static game files **and** WebSocket on the same port
- Browser auto-connects WebSocket to the same host (no separate client URL config)
