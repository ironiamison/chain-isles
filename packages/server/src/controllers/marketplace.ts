import { getGameAuthorityKeypair } from '../util/game-authority';
import { refreshProgramDeployment } from '../util/onchain-health';

import config from '@kaetram/common/config';
import log from '@kaetram/common/util/log';
import { getPlayerGold, addPlayerGold, removePlayerGold } from '@kaetram/common/util/gold';
import { verifyWalletLogin, walletToUsername } from '@kaetram/common/util/wallet-login';
import { parseListingPurchased, ChainmmoServerClient } from '@kaetram/solana';

import type World from '../game/world';
import type Player from '../game/entity/character/player/player';
import type { SolanaCluster } from '@kaetram/solana';

interface PendingSettlement {
    type: 'credit' | 'debit';
    wallet: string;
    goldAmount: number;
    signature: string;
}

export default class Marketplace {
    private processed = new Set<string>();
    private pending: PendingSettlement[] = [];
    private client?: ChainmmoServerClient;
    private pollTimer?: ReturnType<typeof setInterval>;

    public constructor(private world: World) {
        let authority = getGameAuthorityKeypair();

        if (!authority) {
            log.warning('Game authority keypair missing — marketplace attestation disabled.');
            return;
        }

        if (!config.solanaProgramId) {
            log.warning('SOLANA_PROGRAM_ID missing — marketplace listener disabled.');
            return;
        }

        this.client = new ChainmmoServerClient(
            authority,
            config.solanaCluster as SolanaCluster,
            config.solanaProgramId
        );

        this.pollTimer = setInterval(() => this.pollEvents(), 12_000);

        void refreshProgramDeployment();

        log.notice('Marketplace listener started (ListingPurchased + server-attested sync).');
    }

    public stop(): void {
        if (this.pollTimer) clearInterval(this.pollTimer);
    }

    /**
     * Server-attested gold sync for a verified wallet holder.
     */
    public async syncGold(
        wallet: string,
        message: string,
        signature: string
    ): Promise<{ gold: number; signature: string }> {
        if (!this.client) throw new Error('Marketplace service unavailable.');

        if (!verifyWalletLogin(wallet, message, signature))
            throw new Error('Invalid wallet signature.');

        let player = this.findPlayerByWallet(wallet);

        if (!player?.ready) throw new Error('Log in with this wallet before syncing gold.');

        let gold = getPlayerGold(player),
            tx = await this.client.syncGold(wallet, gold);

        log.debug(`Synced ${gold} gold on-chain for ${wallet} (${tx}).`);

        return { gold, signature: tx };
    }

    /**
     * Apply pending marketplace settlements when a wallet player logs in.
     */

    public applyPendingForPlayer(player: Player): void {
        if (!player.wallet) return;

        let remaining: PendingSettlement[] = [];

        for (let settlement of this.pending) {
            if (settlement.wallet !== player.wallet) {
                remaining.push(settlement);
                continue;
            }

            if (settlement.type === 'credit') {
                addPlayerGold(player, settlement.goldAmount);
                player.notify(
                    `Marketplace: received ${settlement.goldAmount.toLocaleString()} gold.`
                );
                continue;
            }

            if (removePlayerGold(player, settlement.goldAmount))
                player.notify(
                    `Marketplace: sent ${settlement.goldAmount.toLocaleString()} gold to buyer.`
                );
            else remaining.push(settlement);
        }

        this.pending = remaining;
    }

    private async pollEvents(): Promise<void> {
        if (!this.client) return;

        try {
            let connection = this.client.connectionInstance,
                signatures = await connection.getSignaturesForAddress(this.client.programAddress, {
                    limit: 25
                });

            for (let { signature } of signatures) {
                if (this.processed.has(signature)) continue;

                let transaction = await connection.getTransaction(signature, {
                    commitment: 'confirmed',
                    maxSupportedTransactionVersion: 0
                });

                if (!transaction?.meta?.logMessages) continue;

                let purchases = parseListingPurchased(
                    transaction.meta.logMessages,
                    config.solanaProgramId,
                    config.solanaCluster as 'localnet' | 'devnet' | 'mainnet-beta'
                );

                for (let purchase of purchases) await this.settlePurchase(purchase, signature);

                this.processed.add(signature);
            }
        } catch (error) {
            log.debug('Marketplace poll error:', error);
        }
    }

    private async settlePurchase(
        purchase: {
            seller: { toBase58(): string };
            buyer: { toBase58(): string };
            goldAmount: bigint;
        },
        signature: string
    ): Promise<void> {
        let sellerWallet = purchase.seller.toBase58(),
            buyerWallet = purchase.buyer.toBase58(),
            goldAmount = Number(purchase.goldAmount);

        if (!goldAmount) return;

        log.notice(
            `Marketplace purchase ${signature.slice(0, 8)}… ${goldAmount} gold ${sellerWallet.slice(
                0,
                6
            )} → ${buyerWallet.slice(0, 6)}`
        );

        let buyer = this.findPlayerByWallet(buyerWallet),
            seller = this.findPlayerByWallet(sellerWallet);

        if (buyer?.ready) addPlayerGold(buyer, goldAmount);
        else this.queuePending('credit', buyerWallet, goldAmount, signature);

        if (seller?.ready) {
            if (!removePlayerGold(seller, goldAmount))
                log.warning(`Seller ${sellerWallet} lacks ${goldAmount} gold for settlement.`);
        } else this.queuePending('debit', sellerWallet, goldAmount, signature);

        await this.world.stimulus.applyGoldPurchaseRebate(
            buyerWallet,
            sellerWallet,
            goldAmount,
            signature,
            buyer
        );
    }

    private queuePending(
        type: PendingSettlement['type'],
        wallet: string,
        goldAmount: number,
        signature: string
    ): void {
        if (this.pending.some((entry) => entry.signature === signature && entry.wallet === wallet))
            return;

        this.pending.push({ type, wallet, goldAmount, signature });
    }

    private findPlayerByWallet(wallet: string): Player | undefined {
        let username = walletToUsername(wallet),
            found: Player | undefined;

        this.world.entities.forEachPlayer((player: Player) => {
            if (player.wallet === wallet || player.username === username) found = player;
        });

        return found;
    }
}

export async function handleMarketplaceRequest(
    marketplace: Marketplace | undefined,
    url: string,
    body: string
): Promise<{ status: number; body: string }> {
    if (url !== '/api/marketplace/sync-gold')
        return { status: 404, body: JSON.stringify({ error: 'Not found' }) };

    if (!marketplace)
        return { status: 503, body: JSON.stringify({ error: 'Marketplace unavailable' }) };

    try {
        let payload = JSON.parse(body) as {
            wallet?: string;
            message?: string;
            signature?: string;
        };

        if (!payload.wallet || !payload.message || !payload.signature)
            return { status: 400, body: JSON.stringify({ error: 'Missing wallet auth fields.' }) };

        let result = await marketplace.syncGold(payload.wallet, payload.message, payload.signature);

        return { status: 200, body: JSON.stringify(result) };
    } catch (error) {
        return {
            status: 400,
            body: JSON.stringify({
                error: error instanceof Error ? error.message : 'Sync failed.'
            })
        };
    }
}
