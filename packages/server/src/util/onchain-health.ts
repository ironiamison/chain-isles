import { getGameAuthorityKeypair, getGameAuthorityPublicKey } from './game-authority';

import config from '@kaetram/common/config';

export interface OnchainHealth {
    cluster: string;
    programId: string;
    programDeployed: boolean;
    treasury: string;
    gameAuthority: string;
    gameAuthorityConfigured: boolean;
    marketplaceEnabled: boolean;
}

let cachedProgramDeployed: boolean | undefined;

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
        gameAuthority,
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
            connection = new Connection(
                cluster === 'localnet'
                    ? 'http://127.0.0.1:8899'
                    : cluster === 'mainnet-beta'
                    ? 'https://api.mainnet-beta.solana.com'
                    : 'https://api.devnet.solana.com',
                'confirmed'
            ),
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
