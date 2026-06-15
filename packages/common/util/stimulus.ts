import config from '../config';

export type StimulusIsleTier = 'none' | 'bronze' | 'silver' | 'gold';

export interface StimulusIsleTierDef {
    id: StimulusIsleTier;
    label: string;
    minTokens: number;
    bonusBps: number;
}

export interface StimulusSettings {
    enabled: boolean;
    buyerRebateBps: number;
    minGoldPurchase: number;
    maxRebateGoldPerDay: number;
    requireIsleHold: boolean;
    isleTiers: StimulusIsleTierDef[];
}

function parseBps(value: string | number | undefined, fallback: number): number {
    let parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) return fallback;

    return Math.floor(parsed);
}

function parseIntConfig(value: string | number | undefined, fallback: number): number {
    let parsed = Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < 0) return fallback;

    return parsed;
}

export function getStimulusSettings(): StimulusSettings {
    return {
        enabled: !!config.stimulusEnabled,
        buyerRebateBps: parseBps(config.stimulusBuyerRebateBps, 500),
        minGoldPurchase: parseIntConfig(config.stimulusMinGoldPurchase, 1000),
        maxRebateGoldPerDay: parseIntConfig(config.stimulusMaxRebateGoldPerDay, 100_000),
        requireIsleHold: !!config.stimulusRequireIsleHold,
        isleTiers: [
            {
                id: 'bronze',
                label: 'Bronze',
                minTokens: parseIntConfig(config.stimulusIsleTierBronze, 10_000),
                bonusBps: parseBps(config.stimulusIsleBronzeBonusBps, 200)
            },
            {
                id: 'silver',
                label: 'Silver',
                minTokens: parseIntConfig(config.stimulusIsleTierSilver, 100_000),
                bonusBps: parseBps(config.stimulusIsleSilverBonusBps, 500)
            },
            {
                id: 'gold',
                label: 'Gold',
                minTokens: parseIntConfig(config.stimulusIsleTierGold, 1_000_000),
                bonusBps: parseBps(config.stimulusIsleGoldBonusBps, 1000)
            }
        ]
    };
}

export function isStimulusEnabled(): boolean {
    return getStimulusSettings().enabled;
}

/**
 * Maps raw SPL balance (smallest units) to the highest ISLE holder tier.
 */
export function getIsleTierFromBalance(
    balanceSmallest: bigint,
    decimals: number,
    tiers: StimulusIsleTierDef[] = getStimulusSettings().isleTiers
): StimulusIsleTierDef | null {
    let humanBalance = Number(balanceSmallest) / 10 ** decimals,
        matched: StimulusIsleTierDef | null = null;

    for (let tier of tiers) if (humanBalance >= tier.minTokens) matched = tier;

    return matched;
}

/**
 * Total buyer rebate in basis points (base + ISLE tier + optional category bounty).
 */
export function getTotalRebateBps(
    isleTier: StimulusIsleTierDef | null,
    categoryBonusBps = 0
): number {
    let settings = getStimulusSettings();

    return settings.buyerRebateBps + (isleTier?.bonusBps ?? 0) + categoryBonusBps;
}

export function calculateRebateGold(goldAmount: number, totalBps: number): number {
    if (goldAmount <= 0 || totalBps <= 0) return 0;

    return Math.floor((goldAmount * totalBps) / 10_000);
}
