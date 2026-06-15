import config from '@kaetram/common/config';
import log from '@kaetram/common/util/log';
import { getTokenGateSettings, isTokenGateActive } from '@kaetram/common/util/token-gate';
import { checkTokenGate, createConnection } from '@kaetram/solana';

import type { SolanaCluster } from '@kaetram/solana';

let connection = createConnection(config.solanaCluster as SolanaCluster);

export async function verifyWalletTokenGate(wallet: string): Promise<boolean> {
    if (!isTokenGateActive()) return true;

    let settings = getTokenGateSettings();

    try {
        let { ok, balance } = await checkTokenGate(connection, wallet, {
            mint: settings.mint,
            minAmount: settings.minAmount
        });

        if (!ok)
            log.debug(
                `Token gate rejected ${wallet}: balance ${balance}, required ${settings.minAmount}`
            );

        return ok;
    } catch (error) {
        log.error(`Token gate RPC check failed for ${wallet}:`, error);

        return false;
    }
}

export { isTokenGateActive, getTokenGateSettings } from '@kaetram/common/util/token-gate';
