import fs from 'node:fs/promises';

import dotenv from 'dotenv-extended';
import dotenvParseVariables from 'dotenv-parse-variables';

import type { DatabaseTypes } from './types/database';

export interface Config {
    name: string;
    host: string;
    port: number;
    ssl: boolean;

    serverId: number;
    accessToken: string;
    apiEnabled: boolean;
    apiPort: number;

    hubEnabled: boolean;
    hubHost: string;
    hubWsHost: string;
    hubPort: number; // API port for hub
    hubWsPort: number; // Websocket port for hub
    hubAccessToken: string;
    adminHost: string;
    adminPort: number;
    remoteServerHost: string;
    remoteApiHost: string;

    clientRemoteHost: string;
    clientRemotePort: number;

    cleanupThreshold: number;
    cleanupTime: number;

    database: DatabaseTypes;
    skipDatabase: boolean;

    mongodbHost: string;
    mongodbPort: number;
    mongodbUser: string;
    mongodbPassword: string;
    mongodbDatabase: string;
    mongodbSrv: boolean;
    mongodbTls: boolean;
    mongodbAuthSource: string;
    aggregateThreshold: number;

    tutorialEnabled: boolean;
    overrideAuth: boolean;
    disableRegister: boolean;
    maxPlayers: number;
    updateTime: number;
    gver: string;
    minor: string;
    regionCache: boolean;
    saveInterval: number;
    messageLimit: number;

    smtpHost: string;
    smtpPort: number;
    smtpUseSecure: boolean;
    smtpUser: string;
    smtpPassword: string;

    sentryOrg: string;
    sentryProject: string;
    sentryAuthToken: string;
    sentryDsn: string;

    stripeEndpoint: string;
    stripeKeyLocal: string;
    stripeSecretKey: string;

    discordEnabled: boolean;
    discordChannelId: string;
    discordBotToken: string;

    acceptLicense: boolean;

    tokenGateEnabled: boolean;
    tokenGateMint: string;
    tokenGateMinAmount: string | number;
    tokenGateSymbol: string;
    tokenGateDecimals: number;

    solanaCluster: string;
    solanaProgramId: string;
    solanaTreasury: string;
    gameAuthorityKeypair: string;
    gameAuthorityPublicKey: string;
    gameAuthoritySecret: string;

    stimulusEnabled: boolean;
    stimulusBuyerRebateBps: string | number;
    stimulusMinGoldPurchase: string | number;
    stimulusMaxRebateGoldPerDay: string | number;
    stimulusRequireIsleHold: boolean;
    stimulusIsleTierBronze: string | number;
    stimulusIsleTierSilver: string | number;
    stimulusIsleTierGold: string | number;
    stimulusIsleBronzeBonusBps: string | number;
    stimulusIsleSilverBonusBps: string | number;
    stimulusIsleGoldBonusBps: string | number;

    debugging: boolean;
    debugLevel: 'all';
    fsDebugging: boolean;
}

console.debug(`Loading env values from [.env] with fallback to [.env.defaults]`);

function camelCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/([_-][a-z])/g, (group) => group.toUpperCase().replace('-', '').replace('_', ''));
}

let { NODE_ENV } = process.env,
    env = dotenv.load({ path: `../../.env`, defaults: '../../.env.defaults' }),
    nodeEnvConfig = `../../.env.${NODE_ENV}`,
    nodeEnvConfigExists = await fs.stat(nodeEnvConfig).catch(() => false);

if (NODE_ENV && nodeEnvConfigExists) {
    console.debug(`Loading additional env values from [.env.${NODE_ENV}]`);

    Object.assign(env, dotenv.load({ path: nodeEnvConfig }));
}

let envConfig = dotenvParseVariables(env),
    config = {} as Config;

for (let key in envConfig) {
    let camelCaseKey = camelCase(key) as keyof Config;

    config[camelCaseKey] = envConfig[key] as never;
}

// Hosting platforms inject PORT; keep that over .env defaults.
let { PORT, HOST } = process.env;

if (PORT) config.port = Number(PORT);
if (HOST) config.host = HOST;

// Railway / Docker inject secrets directly — merge into config.
const processEnvKeys = [
    'GAME_AUTHORITY_SECRET',
    'GAME_AUTHORITY_KEYPAIR',
    'GAME_AUTHORITY_PUBLIC_KEY',
    'TOKEN_GATE_MINT',
    'TOKEN_GATE_ENABLED',
    'TOKEN_GATE_MIN_AMOUNT',
    'TOKEN_GATE_SYMBOL',
    'TOKEN_GATE_DECIMALS',
    'SKIP_DATABASE',
    'MONGODB_HOST',
    'MONGODB_PORT',
    'MONGODB_USER',
    'MONGODB_PASSWORD',
    'MONGODB_DATABASE',
    'MONGODB_TLS',
    'MONGODB_SRV',
    'MONGODB_AUTH_SOURCE',
    'SOLANA_PROGRAM_ID',
    'SOLANA_CLUSTER',
    'SOLANA_TREASURY',
    'STIMULUS_ENABLED',
    'STIMULUS_BUYER_REBATE_BPS',
    'STIMULUS_MIN_GOLD_PURCHASE',
    'STIMULUS_MAX_REBATE_GOLD_PER_DAY',
    'STIMULUS_REQUIRE_ISLE_HOLD',
    'STIMULUS_ISLE_TIER_BRONZE',
    'STIMULUS_ISLE_TIER_SILVER',
    'STIMULUS_ISLE_TIER_GOLD',
    'STIMULUS_ISLE_BRONZE_BONUS_BPS',
    'STIMULUS_ISLE_SILVER_BONUS_BPS',
    'STIMULUS_ISLE_GOLD_BONUS_BPS',
    'CLIENT_DIST',
    'ACCEPT_LICENSE'
] as const;

for (let key of processEnvKeys) {
    let value = process.env[key];

    if (value === undefined) continue;

    config[camelCase(key) as keyof Config] = dotenvParseVariables({ [key]: value })[key] as never;
}

config.hubHost ||= config.host;
config.hubWsHost ||= config.hubHost;
config.adminHost ||= config.hubHost;
config.remoteServerHost ||= config.host;

if (NODE_ENV === 'e2e' && !config.mongodbDatabase.includes('e2e')) {
    console.error(
        `Something is wrong with your configuration, your NODE_ENV is set to 'e2e' and your database name does not include 'e2e'.
        This might cause you to mess up [${config.mongodbDatabase}] via the e2e tests. Stopping the server.`
    );

    throw new Error(
        `NODE_ENV and database name mismatch [NODE_ENV=${NODE_ENV},mongodbDatabase=${config.mongodbDatabase}]`
    );
}

export function exposedConfig<T extends keyof Config>(...keys: T[]) {
    let exposed = {} as Pick<Config, T>;

    for (let key of keys) exposed[key] = config[key];

    return exposed;
}

export default config;
