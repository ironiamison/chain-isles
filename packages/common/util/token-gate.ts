import config from '../config';

export interface TokenGateSettings {
    enabled: boolean;
    mint: string;
    minAmount: bigint;
    symbol: string;
    decimals: number;
}

export function getTokenGateSettings(): TokenGateSettings {
    return {
        enabled: config.tokenGateEnabled,
        mint: config.tokenGateMint?.trim() ?? '',
        minAmount: BigInt(String(config.tokenGateMinAmount ?? 1)),
        symbol: config.tokenGateSymbol || 'TOKEN',
        decimals: config.tokenGateDecimals ?? 0
    };
}

export function isTokenGateActive(): boolean {
    let settings = getTokenGateSettings();

    return settings.enabled && settings.mint.length > 0;
}
