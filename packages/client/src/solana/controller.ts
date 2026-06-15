import { walletToUsername } from '@kaetram/common/util/wallet-login';
import {
    Wallet,
    ChainmmoClient,
    shortenAddress,
    lamportsToSol,
    checkTokenGate,
    createConnection,
    formatTokenAmount,
    parseTokenAmount,
    type SolanaConfig,
    type MarketplaceListingAccount
} from '@kaetram/solana';

import type App from '../app';
import type Game from '../game';

export default class SolanaController {
    public wallet = new Wallet();
    public client?: ChainmmoClient;

    private connectButton: HTMLButtonElement | null = null;
    private addressLabel: HTMLElement | null = null;
    private statusLabel: HTMLElement | null = null;
    private marketplacePanel: HTMLElement | null = null;
    private listingsContainer: HTMLElement | null = null;
    private marketplaceStatus: HTMLElement | null = null;
    private goldInput: HTMLInputElement | null = null;
    private priceInput: HTMLInputElement | null = null;

    public constructor(
        private app: App,
        private game?: Game
    ) {
        this.bindElements();
        this.wallet.watch(() => this.refreshUi());
        this.wallet.tryRestore();
    }

    public attachGame(game: Game): void {
        this.game = game;
    }

    private bindElements(): void {
        this.connectButton = document.querySelector('#connect-wallet');
        this.addressLabel = document.querySelector('#wallet-address');
        this.statusLabel = document.querySelector('#wallet-status');
        this.marketplacePanel = document.querySelector('#marketplace');
        this.listingsContainer = document.querySelector('#marketplace-listings');
        this.marketplaceStatus = document.querySelector('#marketplace-status');
        this.goldInput = document.querySelector('#marketplace-gold-input');
        this.priceInput = document.querySelector('#marketplace-price-input');

        this.connectButton?.addEventListener('click', () => this.toggleWallet());
        document
            .querySelector('#login-with-wallet')
            ?.addEventListener('click', () => this.loginWithWallet());
        document
            .querySelector('#open-marketplace')
            ?.addEventListener('click', () => this.openMarketplace());
        document
            .querySelector('#close-marketplace')
            ?.addEventListener('click', () => this.closeMarketplace());
        document
            .querySelector('#marketplace-create-listing')
            ?.addEventListener('click', () => this.createListing());
        document
            .querySelector('#marketplace-register')
            ?.addEventListener('click', () => this.registerPlayer());
        document
            .querySelector('#marketplace-sync-gold')
            ?.addEventListener('click', () => this.syncGold());
    }

    private getSolanaConfig(): SolanaConfig {
        return {
            cluster: globalConfig.solanaCluster,
            programId: globalConfig.solanaProgramId,
            treasury: globalConfig.solanaTreasury
        };
    }

    private async toggleWallet(): Promise<void> {
        try {
            if (this.wallet.connected) {
                await this.wallet.disconnect();
                this.client = undefined;
            } else {
                await this.wallet.connect();
                this.client = new ChainmmoClient(this.wallet, this.getSolanaConfig());
            }

            this.refreshUi();
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : 'Wallet error');
        }
    }

    private refreshUi(): void {
        let { wallet } = this,
            { connected, address } = wallet,
            { connectButton, addressLabel } = this;

        if (connectButton)
            connectButton.textContent = connected ? 'DISCONNECT WALLET' : 'CONNECT WALLET';

        if (addressLabel)
            if (connected && address) {
                addressLabel.hidden = false;
                addressLabel.textContent = shortenAddress(address, 6);
            } else {
                addressLabel.hidden = true;
                addressLabel.textContent = '';
            }

        if (connected && !wallet.isAvailable())
            this.setStatus('Install Phantom to trade on-chain.', false);
        else if (connected)
            this.setStatus('Wallet connected. Play with wallet or use the marketplace.', false);
        else this.setStatus('', false);
    }

    public async loginWithWallet(): Promise<void> {
        if (this.app.isMenuHidden()) return;

        try {
            if (!this.wallet.isAvailable())
                return this.setStatus('Install Phantom to sign in with your wallet.');

            if (!this.wallet.connected) {
                await this.wallet.connect();
                this.client = new ChainmmoClient(this.wallet, this.getSolanaConfig());
            }

            let wallet = this.wallet.address;

            if (!wallet) throw new Error('Wallet not connected.');

            if (this.app.isTokenGateActive()) {
                this.setStatus('Checking token balance…');

                let { cluster } = this.getSolanaConfig(),
                    connection = createConnection(cluster),
                    { ok, balance } = await checkTokenGate(connection, wallet, {
                        mint: globalConfig.tokenGateMint,
                        minAmount: parseTokenAmount(globalConfig.tokenGateMinAmount)
                    });

                if (!ok) {
                    let { tokenGateDecimals, tokenGateSymbol } = globalConfig;

                    return this.setStatus(
                        `${this.app.getTokenGateError()} You have ${formatTokenAmount(
                            balance,
                            tokenGateDecimals,
                            tokenGateSymbol
                        )}.`
                    );
                }
            }

            this.setStatus('Sign the message in Phantom…');

            let { message, signature } = await this.wallet.signLogin();

            this.app.setWalletAuth({ wallet, message, signature });
            this.setStatus('Wallet verified. Entering game…');
            this.app.beginWalletLogin();
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : 'Wallet login failed.');
        }
    }

    private resolveUsername(): string {
        let username = this.app.getUsername().trim();

        if (username) return username;

        if (this.wallet.address) return walletToUsername(this.wallet.address);

        return '';
    }

    private async ensureClient(): Promise<boolean> {
        if (!this.wallet.connected) {
            this.setStatus('Connect your wallet first.');
            return false;
        }

        if (!this.client) this.client = new ChainmmoClient(this.wallet, this.getSolanaConfig());

        return true;
    }

    public async registerPlayer(): Promise<void> {
        if (!(await this.ensureClient())) return;

        let username = this.resolveUsername();

        if (!username) return this.setStatus('Connect your wallet first.');

        try {
            this.setStatus('Registering on-chain profile…');
            await this.client!.registerPlayer(username);
            this.setStatus('On-chain profile linked.');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : 'Registration failed.');
        }
    }

    public async syncGold(): Promise<void> {
        if (!this.wallet.connected || !this.wallet.address)
            return this.setStatus('Connect your wallet first.');

        try {
            this.setStatus('Requesting server gold attestation…');

            let { message, signature } = await this.wallet.signLogin(),
                response = await fetch('/api/marketplace/sync-gold', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wallet: this.wallet.address,
                        message,
                        signature
                    })
                }),
                payload = (await response.json()) as {
                    error?: string;
                    gold?: number;
                    signature?: string;
                };

            if (!response.ok) throw new Error(payload.error || 'Gold sync failed.');

            this.setStatus(`Synced ${payload.gold?.toLocaleString() ?? 0} gold on-chain.`);
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : 'Gold sync failed.');
        }
    }

    public async createListing(): Promise<void> {
        if (!(await this.ensureClient())) return;

        let gold = Number(this.goldInput?.value || 0),
            price = Number(this.priceInput?.value || 0);

        if (!gold || !price) return this.setStatus('Enter gold amount and SOL price.');

        try {
            this.setStatus('Creating listing…');
            await this.client!.createListing(gold, price);
            this.setStatus('Listing created.');
            await this.loadListings();
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : 'Listing failed.');
        }
    }

    public async loadListings(): Promise<void> {
        if (!this.client || !this.listingsContainer) return;

        this.listingsContainer.innerHTML = '<li>Loading listings…</li>';

        try {
            let listings = await this.client.fetchActiveListings();

            if (listings.length === 0) {
                this.listingsContainer.innerHTML = '<li>No active listings yet.</li>';
                return;
            }

            this.listingsContainer.innerHTML = '';

            for (let listing of listings) this.renderListing(listing);
        } catch (error) {
            this.listingsContainer.innerHTML = `<li>${
                error instanceof Error ? error.message : 'Failed to load listings.'
            }</li>`;
        }
    }

    private renderListing(listing: MarketplaceListingAccount): void {
        if (!this.listingsContainer) return;

        let item = document.createElement('li'),
            isOwn = this.wallet.publicKey?.equals(listing.seller);

        item.innerHTML = `
            <span>${listing.goldAmount.toLocaleString()} gold</span>
            <span>${lamportsToSol(listing.priceLamports)} SOL</span>
            <span>${shortenAddress(listing.seller.toBase58(), 4)}</span>
        `;

        if (!isOwn) {
            let button = document.createElement('button');

            button.className = 'stroke slice-button marketplace-buy';
            button.textContent = 'BUY';
            button.addEventListener('click', () => this.buyListing(listing));
            item.append(button);
        }

        this.listingsContainer.append(item);
    }

    private async buyListing(listing: MarketplaceListingAccount): Promise<void> {
        if (!this.client) return this.setStatus('Connect your wallet first.');

        try {
            this.setStatus('Purchasing listing…');
            await this.client.buyListing(listing.publicKey, listing.seller);
            this.setStatus('Purchase complete. Gold delivery is handled by the game server.');
            await this.loadListings();
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : 'Purchase failed.');
        }
    }

    public async openMarketplace(): Promise<void> {
        this.marketplacePanel?.classList.add('visible');

        void this.loadStimulusInfo();

        if (await this.ensureClient()) {
            let profile = await this.client!.fetchPlayer();

            if (!profile) await this.registerPlayer();
        }

        await this.loadListings();
    }

    private async loadStimulusInfo(): Promise<void> {
        let copy = document.querySelector('#marketplace-stimulus-copy');

        if (!copy) return;

        try {
            let response = await fetch('/api/status');

            if (!response.ok) return;

            let payload = (await response.json()) as {
                    stimulus?: {
                        enabled?: boolean;
                        buyerRebatePercent?: number;
                        isleTiers?: Array<{
                            label: string;
                            minTokens: number;
                            bonusPercent: number;
                        }>;
                        activeCategoryBounties?: Array<{ label: string; bonusPercent: number }>;
                    };
                },
                { stimulus } = payload;

            if (!stimulus?.enabled) {
                copy.textContent = '';
                return;
            }

            let parts = [`Stimulus: +${stimulus.buyerRebatePercent ?? 0}% bonus gold on buys.`];

            if (stimulus.isleTiers?.length)
                parts.push(
                    `ISLE holders earn more (${stimulus.isleTiers
                        .map((t) => `${t.label} +${t.bonusPercent}%`)
                        .join(', ')}).`
                );

            if (stimulus.activeCategoryBounties?.length)
                parts.push(
                    `Hot bounties: ${stimulus.activeCategoryBounties
                        .map((b) => `${b.label} +${b.bonusPercent}%`)
                        .join(', ')}.`
                );

            copy.textContent = parts.join(' ');
        } catch {
            copy.textContent = '';
        }
    }

    public closeMarketplace(): void {
        this.marketplacePanel?.classList.remove('visible');
    }

    private setStatus(message: string, notifyInGame = true): void {
        if (this.statusLabel) this.statusLabel.textContent = message;
        if (this.marketplaceStatus) this.marketplaceStatus.textContent = message;

        if (!message || !notifyInGame || !this.game?.input?.chatHandler) return;

        this.game.input.chatHandler.add('', `[Marketplace] ${message}`, '#f5d76e', true);
    }
}
