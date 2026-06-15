/// <reference types="astro/client" />
/// <reference types="vite-plugin-pwa/client" />

import type { env } from './astro.config';

declare global {
    let globalConfig: typeof env & {
        version: string;
        minor: string;
        port: number;
        hub: string | false;
        sentryDsn: string;
        acceptLicense: boolean;
        solanaCluster: 'localnet' | 'devnet' | 'mainnet-beta';
        solanaProgramId: string;
        solanaTreasury: string;
        tokenGateEnabled: boolean;
        tokenGateMint: string;
        tokenGateMinAmount: string | number;
        tokenGateSymbol: string;
        tokenGateDecimals: number;
        tokenGateActive: boolean;
    };

    declare module '*.vert' {
        let src: string;
        export default src;
    }

    declare module '*.frag' {
        let src: string;
        export default src;
    }
}

export {};
