import Filter from '@kaetram/common/util/filter';
import {
    formatDisplayName,
    validateDisplayName,
    verifyWalletLogin,
    walletToUsername
} from '@kaetram/common/util/wallet-login';

import type World from '../game/world';
import type Player from '../game/entity/character/player/player';

export async function handleDisplayNameRequest(
    world: World | undefined,
    body: string
): Promise<{ status: number; body: string }> {
    if (!world) return { status: 503, body: JSON.stringify({ error: 'Service unavailable.' }) };

    try {
        let payload = JSON.parse(body) as {
            wallet?: string;
            message?: string;
            signature?: string;
            displayName?: string;
        };

        if (!payload.wallet || !payload.message || !payload.signature || !payload.displayName)
            return { status: 400, body: JSON.stringify({ error: 'Missing fields.' }) };

        if (!verifyWalletLogin(payload.wallet, payload.message, payload.signature))
            return { status: 400, body: JSON.stringify({ error: 'Invalid wallet signature.' }) };

        let displayName = formatDisplayName(payload.displayName),
            validationError = validateDisplayName(displayName);

        if (validationError)
            return { status: 400, body: JSON.stringify({ error: validationError }) };

        if (Filter.isProfane(displayName))
            return { status: 400, body: JSON.stringify({ error: 'Name not allowed.' }) };

        let username = walletToUsername(payload.wallet);

        await world.database.updateDisplayName(username, displayName);

        let player = findOnlinePlayer(world, payload.wallet, username);

        if (player?.ready) {
            player.setDisplayName(displayName);
            player.updateEntityList();
            player.notify('Character name updated.');
        }

        return { status: 200, body: JSON.stringify({ displayName }) };
    } catch (error) {
        return {
            status: 400,
            body: JSON.stringify({
                error: error instanceof Error ? error.message : 'Update failed.'
            })
        };
    }
}

function findOnlinePlayer(world: World, wallet: string, username: string): Player | undefined {
    let found: Player | undefined;

    world.entities.forEachPlayer((player: Player) => {
        if (player.wallet === wallet || player.username === username) found = player;
    });

    return found;
}
