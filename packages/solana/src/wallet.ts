import { signWalletLogin } from './login';

import { Transaction } from '@solana/web3.js';

import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

export interface PhantomProvider {
    isPhantom?: boolean;
    publicKey: PublicKey | null;
    isConnected: boolean;
    connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
    disconnect(): Promise<void>;
    signMessage?(
        message: Uint8Array,
        display?: string
    ): Promise<{ signature: Uint8Array; publicKey: PublicKey }>;
    signTransaction(transaction: Transaction): Promise<Transaction>;
    signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
    interface Window {
        solana?: PhantomProvider;
    }
}

export type WalletChangeCallback = (publicKey: PublicKey | null) => void;

export default class Wallet {
    private provider?: PhantomProvider;
    private listeners = new Set<WalletChangeCallback>();

    public get connected(): boolean {
        return !!this.provider?.isConnected && !!this.provider.publicKey;
    }

    public get publicKey(): PublicKey | null {
        return this.provider?.publicKey ?? null;
    }

    public get address(): string | null {
        return this.publicKey?.toBase58() ?? null;
    }

    public isAvailable(): boolean {
        return !!window.solana?.isPhantom;
    }

    public async connect(): Promise<PublicKey> {
        this.provider = window.solana;

        if (!this.provider?.isPhantom) throw new Error('Phantom wallet not found.');

        let response = await this.provider.connect();
        this.notify(response.publicKey);

        return response.publicKey;
    }

    public async disconnect(): Promise<void> {
        await this.provider?.disconnect();
        this.notify(null);
    }

    public async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
        if (!this.provider?.signAllTransactions) throw new Error('Wallet not connected.');

        return this.provider.signAllTransactions(transactions);
    }

    public async signTransaction(transaction: Transaction): Promise<Transaction> {
        if (!this.provider?.signTransaction) throw new Error('Wallet not connected.');

        return this.provider.signTransaction(transaction);
    }

    public async signLogin(): Promise<{ message: string; signature: string }> {
        if (!this.provider?.signMessage) throw new Error('Wallet does not support sign-in.');

        let wallet = this.address;

        if (!wallet) throw new Error('Wallet not connected.');

        return signWalletLogin(this.provider.signMessage.bind(this.provider), wallet);
    }

    public async signAndSend(
        connection: import('@solana/web3.js').Connection,
        instructions: TransactionInstruction[],
        feePayer: PublicKey
    ): Promise<string> {
        let transaction = new Transaction().add(...instructions);

        transaction.feePayer = feePayer;

        let { blockhash } = await connection.getLatestBlockhash();

        transaction.recentBlockhash = blockhash;

        let signed = await this.signTransaction(transaction);

        return connection.sendRawTransaction(signed.serialize());
    }

    public watch(callback: WalletChangeCallback): () => void {
        this.listeners.add(callback);

        let handler = this.handleProviderChange.bind(this);

        this.provider?.on('connect', handler);
        this.provider?.on('disconnect', handler);
        this.provider?.on('accountChanged', handler);

        return () => {
            this.listeners.delete(callback);
            this.provider?.removeListener('connect', handler);
            this.provider?.removeListener('disconnect', handler);
            this.provider?.removeListener('accountChanged', handler);
        };
    }

    public tryRestore(): PublicKey | null {
        if (!this.isAvailable()) return null;

        this.provider = window.solana;

        if (this.provider?.isConnected && this.provider.publicKey) {
            this.notify(this.provider.publicKey);
            return this.provider.publicKey;
        }

        return null;
    }

    private notify(publicKey: PublicKey | null): void {
        for (let listener of this.listeners) listener(publicKey);
    }

    private handleProviderChange(): void {
        this.notify(this.provider?.publicKey ?? null);
    }
}
