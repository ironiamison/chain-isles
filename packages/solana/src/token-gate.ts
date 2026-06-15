import { PublicKey } from '@solana/web3.js';

import type { Connection } from '@solana/web3.js';

export interface TokenGateConfig {
    enabled: boolean;
    mint: string;
    minAmount: bigint;
    symbol?: string;
    decimals?: number;
}

export function isTokenGateActive(config: TokenGateConfig): boolean {
    return config.enabled && config.mint.length > 0;
}

export function parseTokenAmount(value: string | number | bigint): bigint {
    if (typeof value === 'bigint') return value;

    return BigInt(String(value));
}

export function formatTokenAmount(amount: bigint, decimals = 0, symbol = 'TOKEN'): string {
    if (decimals <= 0) return `${amount.toLocaleString()} ${symbol}`;

    let divisor = 10n ** BigInt(decimals),
        whole = amount / divisor,
        fraction = amount % divisor;

    if (fraction === 0n) return `${whole.toLocaleString()} ${symbol}`;

    let fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');

    return `${whole.toLocaleString()}.${fractionText} ${symbol}`;
}

export async function getWalletTokenBalance(
    connection: Connection,
    wallet: string,
    mint: string
): Promise<bigint> {
    let owner = new PublicKey(wallet),
        mintKey = new PublicKey(mint),
        accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey }),
        total = 0n;

    for (let { account } of accounts.value) {
        let amount = account.data.parsed?.info?.tokenAmount?.amount;

        if (amount) total += BigInt(amount);
    }

    return total;
}

export async function checkTokenGate(
    connection: Connection,
    wallet: string,
    config: Pick<TokenGateConfig, 'mint' | 'minAmount'>
): Promise<{ ok: boolean; balance: bigint }> {
    let balance = await getWalletTokenBalance(connection, wallet, config.mint);

    return {
        ok: balance >= config.minAmount,
        balance
    };
}
