import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Keypair } from '@solana/web3.js';
import config from '@kaetram/common/config';
import log from '@kaetram/common/util/log';

let cached: Keypair | null | undefined;

export function getGameAuthorityKeypair(): Keypair | null {
    if (cached !== undefined) return cached;

    let secret = process.env.GAME_AUTHORITY_SECRET?.trim() || config.gameAuthoritySecret?.trim(),
        keypairPath =
            process.env.GAME_AUTHORITY_KEYPAIR?.trim() || config.gameAuthorityKeypair?.trim();

    try {
        if (secret) cached = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));
        else if (keypairPath) {
            let path = resolve(keypairPath);

            if (existsSync(path)) {
                let bytes = JSON.parse(readFileSync(path, 'utf8')) as number[];

                cached = Keypair.fromSecretKey(Uint8Array.from(bytes));
            } else cached = null;
        } else cached = null;
    } catch (error) {
        log.error('Failed to load game authority keypair:', error);
        cached = null;
    }

    return cached;
}

export function getGameAuthorityPublicKey(): string {
    return config.gameAuthorityPublicKey || getGameAuthorityKeypair()?.publicKey.toBase58() || '';
}
