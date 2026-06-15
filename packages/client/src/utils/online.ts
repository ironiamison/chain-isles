export interface OnlineStatus {
    playerCount: number;
    maxPlayers: number;
}

const POLL_INTERVAL_MS = 15_000;

let pollTimer: number | undefined;

/**
 * Fetches the current player count from the game server.
 */
export async function fetchOnlineStatus(): Promise<OnlineStatus | null> {
    try {
        let response = await fetch('/api/status', { cache: 'no-store' });

        if (!response.ok) return null;

        let data = await response.json();

        return {
            playerCount: data.playerCount ?? 0,
            maxPlayers: data.maxPlayers ?? 0
        };
    } catch {
        return null;
    }
}

export function formatOnlineStatus(status: OnlineStatus | null): string {
    if (!status) return 'Players online: —';

    return `${status.playerCount} player${status.playerCount === 1 ? '' : 's'} online`;
}

/**
 * Polls `/api/status` and updates every matching element on the page.
 */
export function startOnlineCountPolling(selectors = ['#online-count', '#online-count-game']): void {
    let elements = selectors
        .map((selector) => document.querySelector<HTMLElement>(selector))
        .filter((element): element is HTMLElement => !!element);

    if (elements.length === 0) return;

    let update = async (): Promise<void> => {
        let status = await fetchOnlineStatus(),
            text = formatOnlineStatus(status);

        for (let element of elements) element.textContent = text;
    };

    if (pollTimer) window.clearInterval(pollTimer);

    update();
    pollTimer = window.setInterval(update, POLL_INTERVAL_MS);
}

export function stopOnlineCountPolling(): void {
    if (!pollTimer) return;

    window.clearInterval(pollTimer);
    pollTimer = undefined;
}
