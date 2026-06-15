import idl from './idl/chainmmo.json';

import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor';
import { PublicKey, Transaction } from '@solana/web3.js';
import { createConnection, getProgramId, type SolanaCluster } from '@kaetram/solana';

import type { Keypair } from '@solana/web3.js';

const CHAINMMO_IDL = idl as Idl;

export default class ChainmmoServerClient {
    private program: Program;
    private connection: ReturnType<typeof createConnection>;

    public constructor(
        private authority: Keypair,
        cluster: SolanaCluster,
        programId: string
    ) {
        this.connection = createConnection(cluster);

        let provider = new AnchorProvider(
            this.connection,
            {
                publicKey: authority.publicKey,
                signTransaction: (async (transaction) => {
                    if (transaction instanceof Transaction) transaction.partialSign(authority);

                    return transaction;
                }) as AnchorProvider['wallet']['signTransaction'],
                signAllTransactions: (async (transactions) => {
                    for (let transaction of transactions)
                        if (transaction instanceof Transaction) transaction.partialSign(authority);

                    return transactions;
                }) as AnchorProvider['wallet']['signAllTransactions']
            },
            { commitment: 'confirmed' }
        );

        this.program = new Program(CHAINMMO_IDL, provider);
        this.programId = getProgramId({ cluster, programId, treasury: '' });
    }

    private programId: PublicKey;

    public playerPda(wallet: PublicKey): PublicKey {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('player'), wallet.toBuffer()],
            this.programId
        )[0];
    }

    public async syncGold(walletAddress: string, goldBalance: number | bigint): Promise<string> {
        let playerWallet = new PublicKey(walletAddress);

        return this.program.methods
            .syncGold(new BN(goldBalance.toString()))
            .accounts({
                gameAuthority: this.authority.publicKey,
                playerWallet,
                player: this.playerPda(playerWallet)
            })
            .rpc();
    }

    public get connectionInstance() {
        return this.connection;
    }

    public get programAddress() {
        return this.programId;
    }
}
