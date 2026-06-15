import { getGameAuthorityKeypair, getGameAuthorityPublicKey } from './game-authority';

import config from '@kaetram/common/config';

export interface OnchainHealth {
    cluster: string;
    programId: string;
    programDeployed: boolean;
    treasury: string;
    treasuryBalanceSol?: number;
    gameAuthority: string;
    gameAuthorityBalanceSol?: number;
    gameAuthorityConfigured: boolean;
    marketplaceEnabled: boolean;
}

let cachedProgramDeployed: boolean | undefined,
    cachedTreasuryBalanceSol: number | undefined,
    cachedGameAuthorityBalanceSol: number | undefined,
    balanceRefreshPromise: Promise<void> | undefined;

function getRpcUrl(cluster: string): string {
    if (cluster === 'localnet') return 'http://127.0.0.1:8899';
    if (cluster === 'mainnet-beta') return 'https://api.mainnet-beta.solana.com';

    return 'https://api.devnet.solana.com';
}

export async function refreshWalletBalances(): Promise<void> {
    let treasury = config.solanaTreasury,
        gameAuthority = getGameAuthorityPublicKey(),
        cluster = config.solanaCluster || 'devnet';

    if (!treasury && !gameAuthority) return;

    try {
        let { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js'),
            connection = new Connection(getRpcUrl(cluster), 'confirmed'),
            addresses = [treasury, gameAuthority].filter(Boolean),
            pubkeys = addresses.map((address) => new PublicKey(address)),
            balances = await Promise.race([
                connection.getMultipleAccountsInfo(pubkeys),
                new Promise<null>((resolve) => {
                    setTimeout(() => resolve(null), 4000);
                })
            ]);

        if (!balances) return;

        if (treasury && balances[0])
            cachedTreasuryBalanceSol = balances[0].lamports / LAMPORTS_PER_SOL;

        let authorityIndex = treasury ? 1 : 0;

        if (gameAuthority && balances[authorityIndex])
            cachedGameAuthorityBalanceSol = balances[authorityIndex]!.lamports / LAMPORTS_PER_SOL;
    } catch {
        // Keep last cached balances on RPC errors.
    }
}

function scheduleWalletBalanceRefresh(): void {
    balanceRefreshPromise = refreshWalletBalances().finally(() => {
        balanceRefreshPromise = undefined;
    });
}

export function startWalletBalanceRefresh(): void {
    scheduleWalletBalanceRefresh();
    setInterval(scheduleWalletBalanceRefresh, 60_000);
}

export async function ensureWalletBalances(): Promise<void> {
    if (balanceRefreshPromise) return balanceRefreshPromise;

    if (cachedTreasuryBalanceSol !== undefined && cachedGameAuthorityBalanceSol !== undefined)
        return;

    balanceRefreshPromise = refreshWalletBalances().finally(() => {
        balanceRefreshPromise = undefined;
    });

    return balanceRefreshPromise;
}

export function setProgramDeployed(deployed: boolean): void {
    cachedProgramDeployed = deployed;
}

export function getOnchainHealth(): OnchainHealth {
    let programId = config.solanaProgramId || '',
        cluster = config.solanaCluster || 'devnet',
        treasury = config.solanaTreasury || '',
        gameAuthority = getGameAuthorityPublicKey(),
        gameAuthorityConfigured = !!getGameAuthorityKeypair(),
        programDeployed = cachedProgramDeployed ?? false,
        marketplaceEnabled =
            programDeployed &&
            gameAuthorityConfigured &&
            !!programId &&
            treasury !== '11111111111111111111111111111111';

    return {
        cluster,
        programId,
        programDeployed,
        treasury,
        treasuryBalanceSol: cachedTreasuryBalanceSol,
        gameAuthority,
        gameAuthorityBalanceSol: cachedGameAuthorityBalanceSol,
        gameAuthorityConfigured,
        marketplaceEnabled
    };
}

export async function refreshProgramDeployment(): Promise<boolean> {
    if (!config.solanaProgramId) {
        cachedProgramDeployed = false;
        return false;
    }

    try {
        let { Connection, PublicKey } = await import('@solana/web3.js'),
            cluster = config.solanaCluster || 'devnet',
            connection = new Connection(getRpcUrl(cluster), 'confirmed'),
            account = await Promise.race([
                connection.getAccountInfo(new PublicKey(config.solanaProgramId)),
                new Promise<null>((resolve) => {
                    setTimeout(() => resolve(null), 4000);
                })
            ]);

        cachedProgramDeployed = !!account?.executable;
    } catch {
        cachedProgramDeployed = false;
    }

    return cachedProgramDeployed;
}
