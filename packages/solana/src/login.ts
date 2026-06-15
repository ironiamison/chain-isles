import bs58 from 'bs58';
import { buildWalletLoginMessage } from '@kaetram/common/util/wallet-login';

export interface SignMessageResult {
    message: string;
    signature: string;
}

export function createWalletLoginNonce(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function signWalletLogin(
    signMessage: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>,
    wallet: string
): Promise<SignMessageResult> {
    let timestamp = Date.now(),
        nonce = createWalletLoginNonce(),
        message = buildWalletLoginMessage(wallet, timestamp, nonce),
        encoded = new TextEncoder().encode(message),
        { signature } = await signMessage(encoded, 'utf8');

    return {
        message,
        signature: bs58.encode(signature)
    };
}

export { type PublicKey } from '@solana/web3.js';
