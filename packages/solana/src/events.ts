import idl from './idl/chainmmo.json';
import { getProgramId, type SolanaCluster, type SolanaConfig } from './config';

import { EventParser, BorshCoder, type Idl } from '@coral-xyz/anchor';

import type { PublicKey } from '@solana/web3.js';

const CHAINMMO_IDL = idl as Idl;

export interface ListingPurchasedEvent {
    listing: PublicKey;
    seller: PublicKey;
    buyer: PublicKey;
    goldAmount: bigint;
    priceLamports: bigint;
}

export function createListingPurchasedParser(config: Pick<SolanaConfig, 'cluster' | 'programId'>) {
    let programId = getProgramId({ ...config, treasury: '' });

    return new EventParser(programId, new BorshCoder(CHAINMMO_IDL));
}

export function parseListingPurchased(
    logs: string[],
    programId: string,
    cluster: SolanaCluster = 'mainnet-beta'
): ListingPurchasedEvent[] {
    let parser = createListingPurchasedParser({
            cluster,
            programId
        }),
        events: ListingPurchasedEvent[] = [];

    for (let event of parser.parseLogs(logs)) {
        if (event.name !== 'ListingPurchased') continue;

        let data = event.data as {
            listing: PublicKey;
            seller: PublicKey;
            buyer: PublicKey;
            goldAmount: { toString(): string };
            priceLamports: { toString(): string };
        };

        events.push({
            listing: data.listing,
            seller: data.seller,
            buyer: data.buyer,
            goldAmount: BigInt(data.goldAmount.toString()),
            priceLamports: BigInt(data.priceLamports.toString())
        });
    }

    return events;
}
