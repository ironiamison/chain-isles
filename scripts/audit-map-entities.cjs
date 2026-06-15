#!/usr/bin/env node
/**
 * Audits world.json entity placements and interactive tile consistency.
 * Usage: node scripts/audit-map-entities.cjs
 */
const path = require('path');

const root = path.join(__dirname, '..');
const map = require(path.join(root, 'packages/server/data/map/world.json'));
const treeData = require(path.join(root, 'packages/server/data/trees.json'));
const mobData = require(path.join(root, 'packages/server/data/mobs.json'));
const npcData = require(path.join(root, 'packages/server/data/npcs.json'));
const rockData = require(path.join(root, 'packages/server/data/rocks.json'));
const fishSpotData = require(path.join(root, 'packages/server/data/fishing.json'));
const foragingData = require(path.join(root, 'packages/server/data/foraging.json'));
const itemData = require(path.join(root, 'packages/server/data/items.json'));

function getEntityType(key) {
    if (key in itemData) return 'item';
    if (key in npcData) return 'npc';
    if (key in mobData) return 'mob';
    if (key in treeData) return 'tree';
    if (key in rockData) return 'rock';
    if (key in fishSpotData) return 'fish';
    if (key in foragingData) return 'forage';
    return 'unknown';
}

const w = map.width;
const tiles = map.data;
const collisions = new Set(map.collisions || []);
const objects = new Set(map.objects || []);
const cursors = map.cursors || {};
const WATER_TILES = new Set([607, 415, 306, 1650, 1714]);
const CRAFTING = new Set(['cooking', 'smithing', 'smelting', 'crafting', 'alchemy']);

function tileIds(x, y) {
    const t = tiles[y * w + x];
    if (!t) return [0];
    return (Array.isArray(t) ? t : [t]).map((id) => id & 0x1fffffff);
}

function isWater(x, y) {
    return tileIds(x, y).some((id) => WATER_TILES.has(id));
}

function isColliding(x, y) {
    return tileIds(x, y).some((id) => collisions.has(id));
}

const entities = map.entities || {};
const issues = {
    onWater: [],
    onCollision: [],
    missingDef: [],
    cursorWithoutObject: [],
    bogusCursorKeys: [],
    treeBlocksCrafting: []
};

for (const [idx, key] of Object.entries(entities)) {
    if (!key) continue;

    const i = +idx;
    const x = i % w;
    const y = Math.floor(i / w);
    const type = getEntityType(key);

    if (type === 'unknown') issues.missingDef.push({ x, y, key });

    if (['tree', 'rock', 'forage', 'mob', 'npc', 'item'].includes(type) && isWater(x, y))
        issues.onWater.push({ x, y, key, type });
    else if (['tree', 'rock', 'forage', 'mob', 'npc'].includes(type) && isColliding(x, y))
        issues.onCollision.push({ x, y, key, type });
}

// Cursor tile types used on the map should be in objects[] (legacy map data check).
const usedCursorTiles = new Set();
for (let i = 0; i < tiles.length; i++) {
    for (const id of tileIds(i % w, Math.floor(i / w))) {
        if (cursors[id]) usedCursorTiles.add(id);
    }
}

for (const id of usedCursorTiles) {
    if (!objects.has(id))
        issues.cursorWithoutObject.push({ tileId: id, cursor: cursors[id] });
}

for (const key of Object.keys(cursors)) {
    const id = +key;
    if (id > 100000) issues.bogusCursorKeys.push({ key: id, cursor: cursors[key] });
}

// Trees adjacent to crafting stations block clicks.
for (let i = 0; i < tiles.length; i++) {
    const x = i % w,
        y = Math.floor(i / w);
    const cur = tileIds(x, y).map((id) => cursors[id]).find((c) => c && CRAFTING.has(c));
    if (!cur) continue;

    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx,
                ny = y + dy,
                ent = entities[ny * w + nx];
            if (ent && getEntityType(ent) === 'tree')
                issues.treeBlocksCrafting.push({ x, y, cursor: cur, nx, ny, tree: ent });
        }
}

console.log('=== MAP ENTITY AUDIT ===');
console.log(`Entities: ${Object.keys(entities).length}`);
console.log(`Missing definitions: ${issues.missingDef.length}`);
console.log(`On water (non-fish): ${issues.onWater.length}`);
console.log(`On collision: ${issues.onCollision.length}`);
console.log(`Cursor tiles missing from objects[]: ${issues.cursorWithoutObject.length}`);
console.log(`Bogus cursor keys (grid indices): ${issues.bogusCursorKeys.length}`);
console.log(`Trees blocking crafting tiles: ${issues.treeBlocksCrafting.length}`);

function print(title, list, fmt) {
    if (!list.length) return;
    console.log(`\n${title}:`);
    list.forEach((e) => console.log(`  ${fmt(e)}`));
}

print('Missing definitions', issues.missingDef, (e) => `${e.x},${e.y} ${e.key}`);
print('On water', issues.onWater, (e) => `${e.x},${e.y} ${e.key} (${e.type})`);
print('On collision', issues.onCollision, (e) => `${e.x},${e.y} ${e.key} (${e.type})`);
print(
    'Cursor without object (fixed at runtime if cursor set)',
    issues.cursorWithoutObject,
    (e) => `tile ${e.tileId} cursor=${e.cursor}`
);
print('Bogus cursor keys', issues.bogusCursorKeys, (e) => `${e.key} cursor=${e.cursor}`);
print(
    'Trees blocking crafting',
    issues.treeBlocksCrafting,
    (e) => `${e.cursor} at ${e.x},${e.y} blocked by ${e.tree} at ${e.nx},${e.ny}`
);

process.exit(
    issues.missingDef.length || issues.bogusCursorKeys.length || issues.treeBlocksCrafting.length
        ? 1
        : 0
);
