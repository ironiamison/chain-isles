import Item from '@kaetram/server/src/game/entity/objects/item';

import type Player from '@kaetram/server/src/game/entity/character/player/player';

export const GOLD_ITEM_KEY = 'gold';

/**
 * Total stackable gold coins in a player's inventory.
 */
export function getPlayerGold(player: Player): number {
    return player.inventory.count(GOLD_ITEM_KEY);
}

/**
 * Adds gold coins to the player's inventory.
 */
export function addPlayerGold(player: Player, amount: number): number {
    if (amount <= 0) return 0;

    return player.inventory.add(new Item(GOLD_ITEM_KEY, -1, -1, false, amount));
}

/**
 * Removes gold coins from the player's inventory.
 */
export function removePlayerGold(player: Player, amount: number): boolean {
    if (amount <= 0) return true;
    if (getPlayerGold(player) < amount) return false;

    let remaining = amount;

    for (let index = 0; index < player.inventory.size; index++) {
        if (remaining <= 0) break;

        let slot = player.inventory.get(index);

        if (!slot?.key || slot.key !== GOLD_ITEM_KEY) continue;

        let removeCount = Math.min(slot.count, remaining);

        player.inventory.remove(index, removeCount);
        remaining -= removeCount;
    }

    return remaining <= 0;
}
