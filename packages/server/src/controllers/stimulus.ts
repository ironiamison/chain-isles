import bountyData from '../../data/stimulus-bounties.json';

import config from '@kaetram/common/config';
import log from '@kaetram/common/util/log';
import { addPlayerGold } from '@kaetram/common/util/gold';
import {
    calculateRebateGold,
    getIsleTierFromBalance,
    getStimulusSettings,
    getTotalRebateBps,
    isStimulusEnabled,
    type StimulusIsleTierDef
} from '@kaetram/common/util/stimulus';
import { createConnection, getWalletTokenBalance, type SolanaCluster } from '@kaetram/solana';

import type Player from '../game/entity/character/player/player';
import type { Connection } from '@solana/web3.js';

interface StimulusBountyCategory {
    label?: string;
    bonusBps: number;
}

interface StimulusBountyFile {
    enabled: boolean;
    categories: { [key: string]: StimulusBountyCategory };
    itemOverrides: { [key: string]: StimulusBountyCategory };
}

interface PendingStimulus {
    wallet: string;
    goldAmount: number;
    signature: string;
}

const BOUNTIES = bountyData as StimulusBountyFile;

export default class Stimulus {
    private dailyRebates = new Map<string, { day: string; amount: number }>();
    private pending: PendingStimulus[] = [];
    private connection?: Connection;

    public constructor() {
        if (!isStimulusEnabled()) return;

        try {
            this.connection = createConnection(config.solanaCluster as SolanaCluster);
            log.notice(
                `Marketplace stimulus enabled — base buyer rebate ${
                    getStimulusSettings().buyerRebateBps / 100
                }%`
            );
        } catch (error) {
            log.warning('Stimulus enabled but Solana connection failed:', error);
        }
    }

    public getPublicInfo() {
        let settings = getStimulusSettings();

        return {
            enabled: settings.enabled && !!this.connection,
            buyerRebatePercent: settings.buyerRebateBps / 100,
            minGoldPurchase: settings.minGoldPurchase,
            maxRebateGoldPerDay: settings.maxRebateGoldPerDay,
            requireIsleHold: settings.requireIsleHold,
            isleTiers: settings.isleTiers.map((tier) => ({
                id: tier.id,
                label: tier.label,
                minTokens: tier.minTokens,
                bonusPercent: tier.bonusBps / 100
            })),
            itemBountiesEnabled: BOUNTIES.enabled,
            activeCategoryBounties: Object.entries(BOUNTIES.categories)
                .filter(([, value]) => value.bonusBps > 0)
                .map(([key, value]) => ({
                    category: key,
                    label: value.label ?? key,
                    bonusPercent: value.bonusBps / 100
                }))
        };
    }

    /**
     * Buyer rebate after a gold marketplace purchase settles.
     */
    public async applyGoldPurchaseRebate(
        buyerWallet: string,
        sellerWallet: string,
        goldAmount: number,
        signature: string,
        buyer?: Player
    ): Promise<number> {
        if (!this.connection || !isStimulusEnabled()) return 0;
        if (buyerWallet === sellerWallet) return 0;

        let settings = getStimulusSettings();

        if (goldAmount < settings.minGoldPurchase) return 0;

        let isleTier = await this.fetchIsleTier(buyerWallet);

        if (settings.requireIsleHold && !isleTier) return 0;

        let categoryBonusBps = this.getCategoryBonusBps('gold'),
            totalBps = getTotalRebateBps(isleTier, categoryBonusBps),
            rebateGold = calculateRebateGold(goldAmount, totalBps);

        if (!rebateGold) return 0;

        rebateGold = this.capDailyRebate(buyerWallet, rebateGold);

        if (!rebateGold) return 0;

        this.creditRebate(buyer, buyerWallet, rebateGold, signature, isleTier, totalBps);

        return rebateGold;
    }

    /**
     * Category / item bounty for a future open item market.
     * Call this when a player buys another player's listed item.
     */
    public async applyItemPurchase(
        buyerWallet: string,
        sellerWallet: string,
        itemKey: string,
        itemType: string,
        priceGold: number,
        signature: string,
        buyer?: Player
    ): Promise<number> {
        if (!this.connection || !isStimulusEnabled() || !BOUNTIES.enabled) return 0;
        if (buyerWallet === sellerWallet) return 0;
        if (priceGold <= 0) return 0;

        let isleTier = await this.fetchIsleTier(buyerWallet),
            settings = getStimulusSettings();

        if (settings.requireIsleHold && !isleTier) return 0;

        let categoryBonusBps = this.getItemBonusBps(itemKey, itemType),
            totalBps = (isleTier?.bonusBps ?? 0) + categoryBonusBps;

        if (!totalBps) return 0;

        let rebateGold = calculateRebateGold(priceGold, totalBps);

        if (!rebateGold) return 0;

        rebateGold = this.capDailyRebate(buyerWallet, rebateGold);

        if (!rebateGold) return 0;

        this.creditRebate(buyer, buyerWallet, rebateGold, signature, isleTier, totalBps, itemKey);

        return rebateGold;
    }

    public applyPendingForPlayer(player: Player): void {
        if (!player.wallet) return;

        let remaining: PendingStimulus[] = [];

        for (let entry of this.pending) {
            if (entry.wallet !== player.wallet) {
                remaining.push(entry);
                continue;
            }

            addPlayerGold(player, entry.goldAmount);
            player.notify(
                `Stimulus check: +${entry.goldAmount.toLocaleString()} bonus gold from marketplace rebate.`
            );
        }

        this.pending = remaining;
    }

    private async fetchIsleTier(wallet: string): Promise<StimulusIsleTierDef | null> {
        let mint = config.tokenGateMint?.trim();

        if (!mint || !this.connection) return null;

        try {
            let balance = await getWalletTokenBalance(this.connection, wallet, mint);

            return getIsleTierFromBalance(balance, config.tokenGateDecimals ?? 6);
        } catch (error) {
            log.debug('ISLE balance check failed:', error);

            return null;
        }
    }

    private getCategoryBonusBps(category: string): number {
        if (!BOUNTIES.enabled) return 0;

        return BOUNTIES.categories[category]?.bonusBps ?? 0;
    }

    private getItemBonusBps(itemKey: string, itemType: string): number {
        if (!BOUNTIES.enabled) return 0;

        let override = BOUNTIES.itemOverrides[itemKey]?.bonusBps;

        if (override) return override;

        return BOUNTIES.categories[itemType]?.bonusBps ?? 0;
    }

    private capDailyRebate(wallet: string, requested: number): number {
        let settings = getStimulusSettings(),
            day = new Date().toISOString().slice(0, 10),
            entry = this.dailyRebates.get(wallet);

        if (!entry || entry.day !== day) entry = { day, amount: 0 };

        let remaining = settings.maxRebateGoldPerDay - entry.amount;

        if (remaining <= 0) return 0;

        let granted = Math.min(requested, remaining);

        entry.amount += granted;
        this.dailyRebates.set(wallet, entry);

        return granted;
    }

    private creditRebate(
        buyer: Player | undefined,
        buyerWallet: string,
        rebateGold: number,
        signature: string,
        isleTier: StimulusIsleTierDef | null,
        totalBps: number,
        itemKey?: string
    ): void {
        if (
            this.pending.some(
                (entry) => entry.signature === signature && entry.wallet === buyerWallet
            )
        )
            return;

        log.notice(
            `Stimulus rebate ${signature.slice(0, 8)}… +${rebateGold} gold → ${buyerWallet.slice(
                0,
                6
            )} (${totalBps / 100}%${isleTier ? `, ${isleTier.label}` : ''}${
                itemKey ? `, ${itemKey}` : ''
            })`
        );

        if (buyer?.ready) {
            addPlayerGold(buyer, rebateGold);
            buyer.notify(
                `Stimulus check: +${rebateGold.toLocaleString()} bonus gold (${
                    totalBps / 100
                }% rebate).`
            );
            return;
        }

        this.pending.push({ wallet: buyerWallet, goldAmount: rebateGold, signature });
    }
}
