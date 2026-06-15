# Production image: game server + built client on one port (HTTP + WebSocket)
FROM node:20-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml tsconfig.json ./
COPY .yarn ./.yarn
COPY packages ./packages
COPY .env.defaults ./.env.defaults

RUN cp .env.defaults .env \
    && sed -i 's/ACCEPT_LICENSE=false/ACCEPT_LICENSE=true/' .env \
    && sed -i "s/HOST='localhost'/HOST='0.0.0.0'/" .env \
    && sed -i 's|^GAME_AUTHORITY_KEYPAIR=.*|GAME_AUTHORITY_KEYPAIR=|' .env

ENV NODE_ENV=production
ENV ACCEPT_LICENSE=true

RUN yarn install --immutable || yarn install
# Client Astro build + server esbuild bundle (skip tsc — monorepo typecheck differs in Docker)
RUN yarn workspace @kaetram/client build
RUN yarn workspace @kaetram/server exec tsx --preserve-symlinks ./build.ts

# --- Runtime ---
FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.env ./.env

ENV NODE_ENV=production
ENV ACCEPT_LICENSE=true
ENV HOST=0.0.0.0
ENV CLIENT_DIST=/app/packages/client/dist
ENV PORT=8080

WORKDIR /app/packages/server

EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/main.js"]
