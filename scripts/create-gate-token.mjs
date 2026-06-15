#!/usr/bin/env node
/**
 * Creates the Chain Isles gate token on devnet and mints a supply to your wallet.
 *
 * Prerequisites:
 *   solana config set --url devnet
 *   solana airdrop 2   (if needed)
 *
 * Usage:
 *   node scripts/create-gate-token.mjs
 *   node scripts/create-gate-token.mjs --amount 1000000
 *
 * Then set in .env:
 *   TOKEN_GATE_MINT=<printed mint address>
 *   TOKEN_GATE_MIN_AMOUNT=1
 *   TOKEN_GATE_SYMBOL=ISLE
 */

import { execSync } from 'node:child_process';

let amount = '1000000';

for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--amount' && process.argv[i + 1]) amount = process.argv[++i];
}

let wallet = execSync('solana address', { encoding: 'utf8' }).trim();

console.log(`Wallet: ${wallet}`);
console.log('Creating SPL token mint (decimals=0)…');

let mint = execSync('spl-token create-token --decimals 0', { encoding: 'utf8' })
    .match(/Creating token ([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1];

if (!mint) {
    console.error('Could not parse mint address. Install spl-token: solana-install init');
    process.exit(1);
}

console.log(`Mint: ${mint}`);
console.log(`Minting ${amount} tokens to ${wallet}…`);

execSync(`spl-token create-account ${mint}`, { stdio: 'inherit' });
execSync(`spl-token mint ${mint} ${amount} ${wallet}`, { stdio: 'inherit' });

console.log('\nAdd to .env:\n');
console.log(`TOKEN_GATE_ENABLED=true`);
console.log(`TOKEN_GATE_MINT=${mint}`);
console.log(`TOKEN_GATE_MIN_AMOUNT=1`);
console.log(`TOKEN_GATE_SYMBOL=ISLE`);
console.log(`TOKEN_GATE_DECIMALS=0`);
