import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

export type SolanaCluster = 'localnet' | 'devnet' | 'mainnet-beta';

export interface SolanaConfig {
    cluster: SolanaCluster;
    programId: string;
    treasury: string;
}

export const DEFAULT_PROGRAM_ID = 'BkP5QCG2x67bqXkngUFRBUzoGx5fNZzW5vY2nHZydjFv';

export const DEFAULT_TREASURY = '11111111111111111111111111111111';

export const DEFAULT_SOLANA_CONFIG: SolanaConfig = {
    cluster: 'mainnet-beta',
    programId: DEFAULT_PROGRAM_ID,
    treasury: DEFAULT_TREASURY
};

export function getRpcUrl(cluster: SolanaCluster): string {
    if (cluster === 'localnet') return 'http://127.0.0.1:8899';

    return clusterApiUrl(cluster);
}

export function createConnection(cluster: SolanaCluster): Connection {
    return new Connection(getRpcUrl(cluster), 'confirmed');
}

export function getProgramId(config: SolanaConfig = DEFAULT_SOLANA_CONFIG): PublicKey {
    return new PublicKey(config.programId);
}

export function shortenAddress(address: string, chars = 4): string {
    return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function lamportsToSol(lamports: number | bigint): string {
    return (Number(lamports) / 1e9).toFixed(4);
}

export function solToLamports(sol: number): number {
    return Math.floor(sol * 1e9);
}
