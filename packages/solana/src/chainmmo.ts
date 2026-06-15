import idl from './idl/chainmmo.json';
import { createConnection, DEFAULT_SOLANA_CONFIG, getProgramId, type SolanaConfig } from './config';

import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, type Connection , Transaction} from '@solana/web3.js';

import type Wallet from './wallet';

export interface PlayerProfile {
    authority: PublicKey;
    characterName: string;
    goldBalance: bigint;
    listedGold: bigint;
    totalListings: bigint;
}

export interface MarketplaceListingAccount {
    publicKey: PublicKey;
    seller: PublicKey;
    listingId: bigint;
    goldAmount: bigint;
    priceLamports: bigint;
    active: boolean;
    buyer: PublicKey;
}

const CHAINMMO_IDL = idl as Idl;

export default class ChainmmoClient {
    private program: Program;
    private connection: Connection;
    private config: SolanaConfig;

    public constructor(
        private wallet: Wallet,
        config: SolanaConfig = DEFAULT_SOLANA_CONFIG
    ) {
        this.config = config;
        this.connection = createConnection(this.config.cluster);

        let provider = new AnchorProvider(
            this.connection,
            {
                publicKey: wallet.publicKey ?? PublicKey.default,
                signTransaction: ((transaction: Transaction) =>
                    wallet.signTransaction(
                        transaction
                    )) as AnchorProvider['wallet']['signTransaction'],
                signAllTransactions: ((transactions: Transaction[]) =>
                    wallet.signAllTransactions(
                        transactions
                    )) as AnchorProvider['wallet']['signAllTransactions']
            },
            { commitment: 'confirmed' }
        );

        this.program = new Program(CHAINMMO_IDL, provider);
    }

    public get connectionInstance(): Connection {
        return this.connection;
    }

    public playerPda(authority: PublicKey = this.requireWallet()): PublicKey {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('player'), authority.toBuffer()],
            getProgramId(this.config)
        )[0];
    }

    public listingPda(seller: PublicKey, listingId: bigint | number): PublicKey {
        let id = typeof listingId === 'bigint' ? listingId : BigInt(listingId);

        return PublicKey.findProgramAddressSync(
            [Buffer.from('listing'), seller.toBuffer(), u64ToBuffer(id)],
            getProgramId(this.config)
        )[0];
    }

    public async fetchPlayer(authority?: PublicKey): Promise<PlayerProfile | null> {
        try {
            let account = await (
                this.program.account as {
                    [key: string]: { fetch(key: PublicKey): Promise<{ [key: string]: unknown }> };
                }
            ).playerProfile.fetch(this.playerPda(authority ?? this.requireWallet()));

            return mapPlayer(account);
        } catch {
            return null;
        }
    }

    public async registerPlayer(characterName: string): Promise<string> {
        let authority = this.requireWallet();

        return this.program.methods
            .registerPlayer(characterName)
            .accounts({
                authority,
                player: this.playerPda(authority),
                systemProgram: SystemProgram.programId
            })
            .rpc();
    }

    public async syncGold(_goldBalance: number | bigint): Promise<string> {
        throw new Error(
            'Use the in-game marketplace Sync button — gold is attested by the game server.'
        );
    }

    public async createListing(goldAmount: number | bigint, priceSol: number): Promise<string> {
        let authority = this.requireWallet(),
            player = await this.fetchPlayer(authority),
            listingId = player?.totalListings ?? 0n;

        return this.program.methods
            .createListing(new BN(goldAmount.toString()), new BN(Math.floor(priceSol * 1e9)))
            .accounts({
                authority,
                player: this.playerPda(authority),
                listing: this.listingPda(authority, listingId),
                systemProgram: SystemProgram.programId
            })
            .rpc();
    }

    public async cancelListing(listingId: number | bigint): Promise<string> {
        let authority = this.requireWallet();

        return this.program.methods
            .cancelListing()
            .accounts({
                authority,
                player: this.playerPda(authority),
                listing: this.listingPda(authority, listingId)
            })
            .rpc();
    }

    public async buyListing(
        listing: PublicKey,
        seller: PublicKey,
        treasury?: PublicKey
    ): Promise<string> {
        let buyer = this.requireWallet();

        return this.program.methods
            .buyListing()
            .accounts({
                buyer,
                seller,
                sellerPlayer: this.playerPda(seller),
                listing,
                treasury: treasury ?? new PublicKey(this.config.treasury),
                systemProgram: SystemProgram.programId
            })
            .rpc();
    }

    public async fetchActiveListings(limit = 32): Promise<MarketplaceListingAccount[]> {
        let accounts = await (
            this.program.account as {
                [key: string]: {
                    all(): Promise<
                        Array<{ publicKey: PublicKey; account: { [key: string]: unknown } }>
                    >;
                };
            }
        ).marketplaceListing.all();

        return accounts
            .filter(({ account }) => account.active === true)
            .slice(0, limit)
            .map(({ publicKey, account }) => mapListing(publicKey, account));
    }

    private requireWallet(): PublicKey {
        if (!this.wallet.publicKey) throw new Error('Connect your wallet first.');

        return this.wallet.publicKey;
    }
}

function mapPlayer(account: { [key: string]: unknown }): PlayerProfile {
    return {
        authority: account.authority as PublicKey,
        characterName: account.characterName as string,
        goldBalance: BigInt((account.goldBalance as BN).toString()),
        listedGold: BigInt((account.listedGold as BN).toString()),
        totalListings: BigInt((account.totalListings as BN).toString())
    };
}

function mapListing(
    publicKey: PublicKey,
    account: { [key: string]: unknown }
): MarketplaceListingAccount {
    return {
        publicKey,
        seller: account.seller as PublicKey,
        listingId: BigInt((account.listingId as BN).toString()),
        goldAmount: BigInt((account.goldAmount as BN).toString()),
        priceLamports: BigInt((account.priceLamports as BN).toString()),
        active: account.active as boolean,
        buyer: account.buyer as PublicKey
    };
}

function u64ToBuffer(value: bigint): Buffer {
    let buffer = Buffer.alloc(8);

    buffer.writeBigUInt64LE(value);

    return buffer;
}
