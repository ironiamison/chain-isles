import bs58 from 'bs58';
import nacl from 'tweetnacl';

export const WALLET_LOGIN_DOMAIN = 'Chain Isles login';
export const WALLET_LOGIN_MAX_AGE_MS = 5 * 60 * 1000;

export interface ParsedWalletLoginMessage {
    wallet: string;
    timestamp: number;
    nonce: string;
}

/**
 * Builds the message the player signs with their Solana wallet.
 */
export function buildWalletLoginMessage(wallet: string, timestamp: number, nonce: string): string {
    return `${WALLET_LOGIN_DOMAIN}\nWallet: ${wallet}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
}

/**
 * Derives a stable in-game username from a wallet address.
 */
export function walletToUsername(wallet: string): string {
    return `w_${wallet.slice(0, 29).toLowerCase()}`;
}

const DISPLAY_NAME_PATTERN = /^\w{3,16}$/;

/**
 * Default short name shown for wallet players (e.g. Isle_a3f2b1).
 */
export function walletDefaultDisplayName(wallet: string): string {
    return `Isle_${wallet.slice(-6).toLowerCase()}`;
}

export function isDefaultWalletDisplayName(name: string, wallet: string): boolean {
    return name.toLowerCase() === walletDefaultDisplayName(wallet).toLowerCase();
}

/**
 * Validates a player-chosen display name.
 */
export function validateDisplayName(name: string): string | null {
    let trimmed = name.trim();

    if (trimmed.length < 3) return 'Name must be at least 3 characters.';
    if (trimmed.length > 16) return 'Name must be 16 characters or fewer.';
    if (!DISPLAY_NAME_PATTERN.test(trimmed)) return 'Use letters, numbers, and underscores only.';

    return null;
}

export function formatDisplayName(name: string): string {
    return name.trim().slice(0, 16);
}

/**
 * Parses and validates the structure of a signed login message.
 */
export function parseWalletLoginMessage(message: string): ParsedWalletLoginMessage | null {
    let lines = message.split('\n');

    if (lines.length !== 4) return null;
    if (lines[0] !== WALLET_LOGIN_DOMAIN) return null;
    if (!lines[1]?.startsWith('Wallet: ')) return null;
    if (!lines[2]?.startsWith('Timestamp: ')) return null;
    if (!lines[3]?.startsWith('Nonce: ')) return null;

    let wallet = lines[1].slice('Wallet: '.length).trim(),
        timestamp = Number.parseInt(lines[2].slice('Timestamp: '.length).trim(), 10),
        nonce = lines[3].slice('Nonce: '.length).trim();

    if (!wallet || !Number.isFinite(timestamp) || !nonce) return null;

    return { wallet, timestamp, nonce };
}

/**
 * Verifies a wallet login signature and message freshness.
 */
export function verifyWalletLogin(wallet: string, message: string, signature: string): boolean {
    let parsed = parseWalletLoginMessage(message);

    if (!parsed) return false;
    if (parsed.wallet !== wallet) return false;

    let age = Math.abs(Date.now() - parsed.timestamp);

    if (age > WALLET_LOGIN_MAX_AGE_MS) return false;

    try {
        let publicKey = bs58.decode(wallet),
            signatureBytes = bs58.decode(signature),
            messageBytes = new TextEncoder().encode(message);

        if (publicKey.length !== nacl.sign.publicKeyLength) return false;
        if (signatureBytes.length !== nacl.sign.signatureLength) return false;

        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
    } catch {
        return false;
    }
}
