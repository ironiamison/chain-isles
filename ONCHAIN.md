# Chain Isles — On-chain 2D MMORPG

Browser-based island MMO — a [Kaetram](https://github.com/Kaetram/Kaetram-Open) Solana fork with wallet login and on-chain gold marketplace.

## What's included

| Layer | Path | Purpose |
|-------|------|---------|
| Game (2D MMO) | `packages/client`, `packages/server` | Skilling, combat, trading, quests, multiplayer |
| Solana client | `packages/solana` | Phantom wallet + Anchor program client |
| On-chain program | `program/chainmmo` | Player profiles, gold listings, SOL payments |

## Quick start (game only)

```bash
cp .env.defaults .env
# Set ACCEPT_LICENSE=true in .env after reading LICENSE files

yarn install
yarn dev
```

- Client: http://localhost:9000
- Server: http://localhost:9001

Requires MongoDB running locally (see Kaetram docs).

## Token-gated entry

When `TOKEN_GATE_ENABLED=true` and `TOKEN_GATE_MINT` is set, **only wallets holding the gate token can play**. Guest and username/password login are blocked.

1. Create your gate token on devnet:

```bash
solana config set --url devnet
solana airdrop 2
node scripts/create-gate-token.mjs
```

2. Paste the printed mint into `.env`:

```
TOKEN_GATE_ENABLED=true
TOKEN_GATE_MINT=<your-mint>
TOKEN_GATE_MIN_AMOUNT=1
TOKEN_GATE_SYMBOL=ISLE
TOKEN_GATE_DECIMALS=0
```

3. Rebuild and restart. Players click **PLAY WITH WALLET** — the client and server both verify SPL balance via RPC before login.

| Variable | Description |
|----------|-------------|
| `TOKEN_GATE_ENABLED` | Turn gating on/off |
| `TOKEN_GATE_MINT` | SPL token mint address |
| `TOKEN_GATE_MIN_AMOUNT` | Minimum balance (smallest units) |
| `TOKEN_GATE_SYMBOL` | Shown on login screen |
| `TOKEN_GATE_DECIMALS` | For display formatting |

## Quick start (with wallet UI)

1. Install [Phantom](https://phantom.app/)
2. Start the game (`yarn dev`)
3. On the login screen, click **CONNECT WALLET**
4. Log in and play as usual
5. In-game, click **MKT** (bottom-right HUD) to open the marketplace

> **Gold delivery:** After an on-chain purchase, the game server listens for `ListingPurchased` events and credits/debits in-game gold automatically (including pending settlements on login).

## Health check

After deploy, verify on-chain readiness:

```bash
curl https://www.chainisles.xyz/api/status
```

Expected when fully configured (program deployed + treasury + game authority):

```json
{
  "cluster": "devnet",
  "programId": "BkP5QCG2x67bqXkngUFRBUzoGx5fNZzW5vY2nHZydjFv",
  "programDeployed": true,
  "treasury": "5E1aC5fUKckpfrks1GkgEwNmspcSWX6pjWz1VJeCDq6n",
  "gameAuthority": "GTYkSZA9BzAo8mEX98dx61fPUaauoD6L3ERtS2Go9PqV",
  "gameAuthorityConfigured": true,
  "marketplaceEnabled": true
}
```

If `programDeployed` is `false`, fund the deployer wallet and run `bash scripts/deploy-anchor.sh`.

**Fund deployer (devnet):** send SOL to `5E1aC5fUKckpfrks1GkgEwNmspcSWX6pjWz1VJeCDq6n` via [faucet.solana.com](https://faucet.solana.com) (CLI airdrop is often rate-limited).

## Deploy the on-chain program

Prerequisites: [Solana CLI](https://docs.solanalabs.com/cli/install), [Anchor](https://www.anchor-lang.com/docs/installation), Rust.

```bash
# One-shot deploy (devnet airdrop + build + deploy)
# If CLI airdrop is rate-limited, fund keys/deployer.json via https://faucet.solana.com first.
bash scripts/deploy-anchor.sh

# Or manually:
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
unset CARGO_TARGET_DIR
cd program/chainmmo
cargo-build-sbf --manifest-path programs/chainmmo/Cargo.toml
solana program deploy target/deploy/chainmmo.so --program-id target/deploy/chainmmo-keypair.json
cp target/idl/chainmmo.json ../../packages/solana/src/idl/chainmmo.json
```

Set your treasury wallet and game authority in `.env`:

```
SOLANA_PROGRAM_ID=<deployed-program-id>
SOLANA_TREASURY=<your-fee-wallet-pubkey>
GAME_AUTHORITY_PUBLIC_KEY=GTYkSZA9BzAo8mEX98dx61fPUaauoD6L3ERtS2Go9PqV
GAME_AUTHORITY_KEYPAIR=../../keys/game-authority.json
# Railway/production: paste keys/game-authority.json contents into GAME_AUTHORITY_SECRET
```

## Server-attested gold sync

Players click **Sync gold** in the MKT panel. The server reads real in-game inventory gold and submits `sync_gold` signed by the **game authority** key (not the player). The on-chain program rejects player-signed syncs.

## Marketplace flow (Kintara-style)

1. **Connect wallet** on login screen
2. **Link character** — registers your username on-chain (`register_player`)
3. **Sync gold** — server attests your in-game gold on-chain (`sync_gold` via `/api/marketplace/sync-gold`)
4. **Create listing** — list gold for a SOL price (`create_listing`)
5. **Buy listing** — buyer pays SOL on-chain; seller receives 95%, treasury 5%
6. **Receive gold in-game** — server settles `ListingPurchased` events into player inventories

> Gold sync is server-attested. Marketplace purchases deliver in-game gold via the server listener.

## Marketplace stimulus (buyer rebate + ISLE tiers)

When enabled, buyers receive **bonus gold** after a gold-market purchase. ISLE holders get higher rebates. Item category bounties apply when an open item market is wired up.

### 1. Enable in `.env` / Railway

```
STIMULUS_ENABLED=true
STIMULUS_BUYER_REBATE_BPS=500          # 5% base bonus gold
STIMULUS_MIN_GOLD_PURCHASE=1000
STIMULUS_MAX_REBATE_GOLD_PER_DAY=100000
STIMULUS_REQUIRE_ISLE_HOLD=false       # true = must hold ISLE to get rebate

# ISLE tiers (human token amounts; uses TOKEN_GATE_DECIMALS=6)
STIMULUS_ISLE_TIER_BRONZE=10000
STIMULUS_ISLE_TIER_SILVER=100000
STIMULUS_ISLE_TIER_GOLD=1000000
STIMULUS_ISLE_BRONZE_BONUS_BPS=200     # +2% extra
STIMULUS_ISLE_SILVER_BONUS_BPS=500     # +5% extra
STIMULUS_ISLE_GOLD_BONUS_BPS=1000      # +10% extra
```

Check live rates: `curl https://www.chainisles.xyz/api/status` → `stimulus` object.

### 2. Item category bounties (idea #5)

Edit `packages/server/data/stimulus-bounties.json`. Set `bonusBps` on a category for a “Weapons Week” style event:

```json
"weapon": { "label": "Weapons Week", "bonusBps": 1000 }
```

When you add a player item marketplace, call `world.stimulus.applyItemPurchase(...)` on each sale — the hook is already in `packages/server/src/controllers/stimulus.ts`.

### 3. Funding

Rebates mint **in-game gold** via the server (not on-chain). No extra SOL per rebate tx. Tune `STIMULUS_MAX_REBATE_GOLD_PER_DAY` so total daily payouts match what you’re comfortable subsidizing from creator/treasury revenue.

## Architecture

```
Browser (Kaetram client)
  ├── WebSocket → Game server (real-time MMO)
  └── Phantom → Solana RPC (profiles + marketplace)

Hybrid model (recommended for MMOs):
  • Movement, combat, chat → off-chain (fast)
  • Wallet, listings, payments → on-chain (ownable value)
```

## Project structure

```
packages/
  client/     Astro + Canvas/WebGL game client (+ wallet UI)
  server/     MMO game server
  common/     Shared types and config
  solana/     Wallet adapter + Anchor client
program/
  chainmmo/   Anchor program (Rust)
```

## Commands

```bash
yarn dev          # Run client + server in dev mode
yarn build        # Production build
yarn start        # Serve built client

cd program/chainmmo && anchor test   # Program tests (after anchor build)
```

## Config

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_CLUSTER` | `devnet` | `localnet`, `devnet`, or `mainnet-beta` |
| `SOLANA_PROGRAM_ID` | (see `.env.defaults`) | Deployed program address |
| `SOLANA_TREASURY` | system program | Fee recipient for marketplace sales |
| `ACCEPT_LICENSE` | `false` | Must be `true` to run Kaetram |

## Next steps

- [x] Token-gated entry (hold gate SPL token to play)
- [x] Server webhook: deliver gold after `ListingPurchased` event
- [x] Server-attested `sync_gold`
- [ ] Session keys (gum) for gasless in-game txs
- [ ] cNFT item mints for rare drops
- [ ] PvP wilderness loot escrow

## License

Kaetram is MPL-2.0 + OPL for assets. On-chain code in `program/` and `packages/solana/` follows the same repo license unless noted otherwise.
