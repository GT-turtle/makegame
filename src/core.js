import {
  BAG_COLS,
  AFFIX_DEFS,
  BASE_BAG_ROWS,
  BEACON_GOAL,
  CLASS_DEFS,
  ENEMY_DEFS,
  ITEM_DEFS,
  LOOT_TABLE,
  REGION_INFO,
  TRAIT_DEFS,
  WORLD_SIZE
} from "./data.js";

export const SAVE_VERSION = 3;

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function keyOf(x, y) {
  return `${x},${y}`;
}

export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function rotateMask(mask, rotation = 0) {
  let result = mask.map((row) => [...row]);
  const turns = ((rotation % 4) + 4) % 4;
  for (let turn = 0; turn < turns; turn += 1) {
    result = result[0].map((_, column) => result.map((row) => row[column]).reverse());
  }
  return result;
}

export function itemCells(item) {
  if (item.x < 0 || item.y < 0) return [];
  const definition = ITEM_DEFS[item.defId];
  const mask = rotateMask(definition.mask, item.rotation);
  const cells = [];
  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[y].length; x += 1) {
      if (mask[y][x]) cells.push({ x: item.x + x, y: item.y + y });
    }
  }
  return cells;
}

export function bagOccupancy(inventory, ignoredUid = null) {
  const occupancy = new Map();
  for (const item of inventory) {
    if (item.uid === ignoredUid) continue;
    for (const cell of itemCells(item)) occupancy.set(keyOf(cell.x, cell.y), item.uid);
  }
  return occupancy;
}

export function canPlaceItem(inventory, item, x, y, rotation, rows, cols = BAG_COLS) {
  const candidate = { ...item, x, y, rotation };
  const occupancy = bagOccupancy(inventory, item.uid);
  const cells = itemCells(candidate);
  if (!cells.length) return false;
  return cells.every((cell) => (
    cell.x >= 0 && cell.y >= 0 && cell.x < cols && cell.y < rows && !occupancy.has(keyOf(cell.x, cell.y))
  ));
}

export function placeItem(inventory, uid, x, y, rotation, rows, cols = BAG_COLS) {
  const item = inventory.find((entry) => entry.uid === uid);
  if (!item || !canPlaceItem(inventory, item, x, y, rotation, rows, cols)) return false;
  item.x = x;
  item.y = y;
  item.rotation = ((rotation % 4) + 4) % 4;
  return true;
}

export function removeItem(inventory, uid) {
  const item = inventory.find((entry) => entry.uid === uid);
  if (!item) return false;
  item.x = -1;
  item.y = -1;
  return true;
}

export function adjacentItemUids(inventory, uid) {
  const item = inventory.find((entry) => entry.uid === uid);
  if (!item) return [];
  const own = new Set(itemCells(item).map((cell) => keyOf(cell.x, cell.y)));
  const adjacent = new Set();
  for (const other of inventory) {
    if (other.uid === uid || other.x < 0) continue;
    for (const cell of itemCells(other)) {
      const neighbors = [
        keyOf(cell.x + 1, cell.y),
        keyOf(cell.x - 1, cell.y),
        keyOf(cell.x, cell.y + 1),
        keyOf(cell.x, cell.y - 1)
      ];
      if (neighbors.some((neighbor) => own.has(neighbor))) {
        adjacent.add(other.uid);
        break;
      }
    }
  }
  return [...adjacent];
}

export function itemsHaveSynergy(first, second) {
  const firstDef = ITEM_DEFS[first.defId];
  const secondDef = ITEM_DEFS[second.defId];
  const pair = new Set([first.defId, second.defId]);
  const firstTags = new Set(firstDef.tags);
  const secondTags = new Set(secondDef.tags);
  if (pair.has("whetstone") && (firstTags.has("weapon") || secondTags.has("weapon"))) return true;
  if (pair.has("venom") && (firstTags.has("weapon") || secondTags.has("weapon"))) return true;
  if (pair.has("ember") && (firstTags.has("weapon") || secondTags.has("weapon"))) return true;
  if (pair.has("buckler") && (firstTags.has("crystal") || secondTags.has("crystal") || pair.has("armor"))) return true;
  if (pair.has("boots") && (firstTags.has("device") || secondTags.has("device"))) return true;
  if (pair.has("coil") && (firstTags.has("crystal") || secondTags.has("crystal") || firstTags.has("gear") || secondTags.has("gear"))) return true;
  if (pair.has("lantern") && (firstTags.has("crystal") || secondTags.has("crystal"))) return true;
  if (pair.has("herbKit") && firstTags.has("alchemy") && secondTags.has("alchemy")) return true;
  if (pair.has("scavengerCharm") && (firstTags.has("tool") || secondTags.has("tool"))) return true;
  if (pair.has("armor") && (firstTags.has("crystal") || secondTags.has("crystal") || pair.has("buckler"))) return true;
  return false;
}

export function synergyItemUids(inventory, uid) {
  const item = inventory.find((entry) => entry.uid === uid);
  if (!item) return [];
  return adjacentItemUids(inventory, uid).filter((otherUid) => {
    const other = inventory.find((entry) => entry.uid === otherUid);
    return other ? itemsHaveSynergy(item, other) : false;
  });
}

export function hasAdjacentTag(inventory, uid, tag) {
  return adjacentItemUids(inventory, uid).some((otherUid) => {
    const other = inventory.find((entry) => entry.uid === otherUid);
    return ITEM_DEFS[other.defId].tags.includes(tag);
  });
}

export function countAdjacentTag(inventory, uid, tag) {
  return adjacentItemUids(inventory, uid).filter((otherUid) => {
    const other = inventory.find((entry) => entry.uid === otherUid);
    return ITEM_DEFS[other.defId].tags.includes(tag);
  }).length;
}

export function bagFingerprint(inventory) {
  return inventory
    .map((item) => `${item.uid}:${item.x}:${item.y}:${item.rotation}`)
    .sort()
    .join("|");
}

export function createItem(defId, uid, x = -1, y = -1, rotation = 0) {
  const definition = ITEM_DEFS[defId];
  if (!definition) throw new Error(`Unknown item definition: ${defId}`);
  return {
    uid,
    defId,
    x,
    y,
    rotation,
    charges: defId === "herbKit" ? 2 : null,
    counters: {},
    readyAtTurn: 0,
    quality: 50,
    affixes: []
  };
}

export function createCraftedItem(defId, uid, random = Math.random) {
  const item = createItem(defId, uid);
  item.quality = 45 + Math.floor(random() * 56);
  const affixIds = Object.keys(AFFIX_DEFS);
  const affixCount = item.quality >= 85 ? 2 : 1;
  while (item.affixes.length < affixCount) {
    const affixId = affixIds[Math.floor(random() * affixIds.length)];
    if (!item.affixes.includes(affixId)) item.affixes.push(affixId);
  }
  return item;
}

export function createInitialState() {
  return {
    version: SAVE_VERSION,
    nextUid: 5,
    meta: {
      scrap: 4,
      essence: 0,
      clearedDepth: 0,
      bestBeacons: 0,
      bagRows: BASE_BAG_ROWS,
      research: [],
      classId: "knight",
      traitId: "duneBorn",
      skillMastery: {},
      blueprints: ["frontierMantle"],
      materials: { wood: 4, ore: 4, ingot: 2, sunShard: 0, sporeGland: 0, blackSteel: 0, watcherEye: 0 },
      estate: { tick: 0, workers: { steward: 1, lumberjack: 0, miner: 0, blacksmith: 1 } },
      expeditions: 0,
      victories: 0
    },
    player: {
      hp: 18,
      maxHp: 18,
      guard: 0,
      evasion: 0,
      classResource: 2,
      skillReadyAt: {},
      x: 1,
      y: 1,
      turn: 0
    },
    inventory: [
      createItem("blade", "item-1", 0, 0, 0),
      createItem("whetstone", "item-2", 1, 0, 0),
      createItem("buckler", "item-3", 2, 0, 0),
      createItem("boots", "item-4", 4, 0, 0)
    ],
    expedition: null,
    log: [
      { text: "공방의 문이 열렸다. 첫 원정을 준비하자.", tone: "item" }
    ],
    lastTriggered: []
  };
}

export function createUid(state) {
  const uid = `item-${state.nextUid}`;
  state.nextUid += 1;
  return uid;
}

export const WORLD_LANDMARKS = {
  start: { x: 3, y: 15 },
  beacons: [
    { x: 8, y: 6 },
    { x: 15, y: 25 },
    { x: 23, y: 6 }
  ],
  core: { x: 27, y: 15 }
};

export function regionIdAt(x, y) {
  let nearest = "fringe";
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const region of Object.values(REGION_INFO)) {
    const dx = x - region.center.x;
    const dy = y - region.center.y;
    const value = dx * dx + dy * dy;
    if (value < nearestDistance) {
      nearest = region.id;
      nearestDistance = value;
    }
  }
  return nearest;
}

function chooseOpenCell(random, tiles, occupied, minimumDistance = 0, from = WORLD_LANDMARKS.start, regionId = null) {
  const candidates = [];
  for (let y = 1; y < tiles.length - 1; y += 1) {
    for (let x = 1; x < tiles[y].length - 1; x += 1) {
      if (tiles[y][x] !== "floor") continue;
      if (occupied.has(keyOf(x, y))) continue;
      if (distance({ x, y }, from) < minimumDistance) continue;
      if (regionId && regionIdAt(x, y) !== regionId) continue;
      candidates.push({ x, y });
    }
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

export function reachableKeys(tiles, start) {
  const queue = [start];
  const visited = new Set([keyOf(start.x, start.y)]);
  while (queue.length) {
    const current = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || y < 0 || y >= tiles.length || x >= tiles[y].length) continue;
      if (tiles[y][x] !== "floor") continue;
      const key = keyOf(x, y);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x, y });
    }
  }
  return visited;
}

function clearAround(tiles, point, radius = 1) {
  for (let y = point.y - radius; y <= point.y + radius; y += 1) {
    for (let x = point.x - radius; x <= point.x + radius; x += 1) {
      if (x > 0 && y > 0 && y < tiles.length - 1 && x < tiles[y].length - 1) tiles[y][x] = "floor";
    }
  }
}

function carveRoute(tiles, from, to, horizontalFirst) {
  let x = from.x;
  let y = from.y;
  const carve = () => {
    tiles[y][x] = "floor";
    if (x > 1 && x < tiles[y].length - 2) tiles[y][x + (y % 2 ? 1 : -1)] = "floor";
  };
  const walkX = () => {
    while (x !== to.x) {
      x += Math.sign(to.x - x);
      carve();
    }
  };
  const walkY = () => {
    while (y !== to.y) {
      y += Math.sign(to.y - y);
      carve();
    }
  };
  carve();
  if (horizontalFirst) {
    walkX();
    walkY();
  } else {
    walkY();
    walkX();
  }
}

function buildTiles(random) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tiles = Array.from({ length: WORLD_SIZE }, (_, y) => (
      Array.from({ length: WORLD_SIZE }, (_, x) => (
        x === 0 || y === 0 || x === WORLD_SIZE - 1 || y === WORLD_SIZE - 1 ? "wall" : "floor"
      ))
    ));
    for (let index = 0; index < 165; index += 1) {
      const x = 1 + Math.floor(random() * (WORLD_SIZE - 2));
      const y = 1 + Math.floor(random() * (WORLD_SIZE - 2));
      tiles[y][x] = "wall";
    }
    const route = [WORLD_LANDMARKS.start, ...WORLD_LANDMARKS.beacons, WORLD_LANDMARKS.core];
    for (const point of route) clearAround(tiles, point, 1);
    for (let index = 0; index < route.length - 1; index += 1) {
      carveRoute(tiles, route[index], route[index + 1], random() >= 0.5);
    }
    carveRoute(tiles, WORLD_LANDMARKS.start, WORLD_LANDMARKS.core, random() >= 0.5);
    const reachable = reachableKeys(tiles, WORLD_LANDMARKS.start);
    const landmarksReachable = route.every((point) => reachable.has(keyOf(point.x, point.y)));
    if (landmarksReachable && reachable.size >= 620) return tiles;
  }
  throw new Error("Unable to generate connected expedition world");
}

export function createWorld(seed) {
  const random = mulberry32(seed + 9973);
  const tiles = buildTiles(random);
  const start = { ...WORLD_LANDMARKS.start };
  const core = { ...WORLD_LANDMARKS.core };
  const beacons = WORLD_LANDMARKS.beacons.map((point) => ({ ...point }));
  const occupied = new Set([keyOf(start.x, start.y), keyOf(core.x, core.y), ...beacons.map((point) => keyOf(point.x, point.y))]);
  const enemies = [];
  for (const region of Object.values(REGION_INFO)) {
    for (let index = 0; index < region.enemyCount; index += 1) {
      const position = chooseOpenCell(random, tiles, occupied, 6, start, region.id);
      if (!position) continue;
      occupied.add(keyOf(position.x, position.y));
      const defId = region.enemyPool[Math.floor(random() * region.enemyPool.length)];
      const definition = ENEMY_DEFS[defId];
      enemies.push({
        id: `enemy-${region.id}-${index}`,
        defId,
        x: position.x,
        y: position.y,
        hp: definition.hp,
        maxHp: definition.hp,
        intent: "pursue",
        poison: 0,
        burn: 0,
        active: false
      });
    }
  }
  const warden = ENEMY_DEFS.warden;
  enemies.push({
    id: "enemy-boss",
    defId: "warden",
    x: core.x,
    y: core.y,
    hp: warden.hp,
    maxHp: warden.hp,
    intent: "pursue",
    poison: 0,
    burn: 0,
    active: false
  });
  const features = {};
  beacons.forEach((point, index) => {
    features[keyOf(point.x, point.y)] = { type: "beacon", id: `beacon-${index + 1}`, activated: false };
  });
  features[keyOf(core.x, core.y)] = { type: "core" };
  for (let index = 0; index < 8; index += 1) {
    const position = chooseOpenCell(random, tiles, occupied, 4, start);
    if (!position) continue;
    occupied.add(keyOf(position.x, position.y));
    features[keyOf(position.x, position.y)] = { type: "cache", opened: false };
  }
  for (let index = 0; index < 12; index += 1) {
    const position = chooseOpenCell(random, tiles, occupied, 2, start);
    if (!position) continue;
    occupied.add(keyOf(position.x, position.y));
    features[keyOf(position.x, position.y)] = { type: "hazard" };
  }
  for (let index = 0; index < 3; index += 1) {
    const position = chooseOpenCell(random, tiles, occupied, 8, start);
    if (!position) continue;
    occupied.add(keyOf(position.x, position.y));
    features[keyOf(position.x, position.y)] = { type: "camp", used: false };
  }
  return {
    seed,
    width: WORLD_SIZE,
    height: WORLD_SIZE,
    tiles,
    enemies,
    features,
    start,
    core,
    beacons,
    seen: [],
    worldTurn: 0
  };
}

export function createFloor(seed) {
  return createWorld(seed);
}

export function createExpedition(state, seed = Date.now() % 2147483647) {
  const floor = createWorld(seed);
  state.player.hp = state.player.maxHp;
  state.player.guard = 0;
  state.player.evasion = 0;
  state.player.x = floor.start.x;
  state.player.y = floor.start.y;
  state.player.turn = 0;
  for (const item of state.inventory) {
    item.counters = {};
    item.readyAtTurn = 0;
    if (item.defId === "herbKit") item.charges = 2;
  }
  state.expedition = {
    seed,
    phase: "active",
    beaconsActivated: 0,
    beaconGoal: BEACON_GOAL,
    runScrap: 0,
    runEssence: 0,
    pressure: { heat: 0, toxin: 0, cold: 0, corruption: 0 },
    cargo: { materials: {}, blueprints: [] },
    lootFound: 0,
    floor
  };
  state.meta.expeditions += 1;
  const classDef = CLASS_DEFS[state.meta.classId] || CLASS_DEFS.knight;
  state.player.classResource = Math.min(2, classDef.resourceMax);
  state.player.skillReadyAt = {};
  return state.expedition;
}

export function masteryLevel(xp = 0) {
  return Math.min(10, Math.floor(Math.sqrt(Math.max(0, xp))));
}

export function masteryGainMultiplier(state) {
  let multiplier = 1 + (TRAIT_DEFS[state.meta.traitId]?.masteryBonus || 0);
  for (const item of activeItems(state)) {
    for (const affixId of item.affixes || []) multiplier += AFFIX_DEFS[affixId]?.masteryBonus || 0;
  }
  return multiplier;
}

export function environmentMitigation(state, pressureId) {
  let amount = 0;
  const classDef = CLASS_DEFS[state.meta.classId] || CLASS_DEFS.knight;
  const traitDef = TRAIT_DEFS[state.meta.traitId];
  amount += classDef.environment?.[pressureId] || 0;
  amount += traitDef?.environment?.[pressureId] || 0;
  for (const item of activeItems(state)) {
    const definition = ITEM_DEFS[item.defId];
    amount += definition.environment?.[pressureId] || 0;
    for (const affixId of item.affixes || []) amount += AFFIX_DEFS[affixId]?.environmentAll || 0;
  }
  return amount;
}

export function itemAffixBonus(item, field) {
  return (item.affixes || []).reduce((sum, affixId) => sum + (AFFIX_DEFS[affixId]?.[field] || 0), 0);
}

export function addMaterial(materials, materialId, amount = 1) {
  materials[materialId] = (materials[materialId] || 0) + amount;
}

export function advanceEstate(state, turns = 1) {
  const estate = state.meta.estate;
  const materials = state.meta.materials;
  const events = [];
  for (let turn = 0; turn < turns; turn += 1) {
    estate.tick += 1;
    if (estate.workers.lumberjack > 0 && estate.tick % 3 === 0) {
      addMaterial(materials, "wood", estate.workers.lumberjack);
      events.push(`벌목꾼: 목재 +${estate.workers.lumberjack}`);
    }
    if (estate.workers.miner > 0 && estate.tick % 4 === 0) {
      addMaterial(materials, "ore", estate.workers.miner);
      events.push(`광부: 철광석 +${estate.workers.miner}`);
    }
    if (estate.workers.blacksmith > 0 && estate.tick % 5 === 0 && materials.ore >= 2 && materials.wood >= 1) {
      const batches = Math.min(estate.workers.blacksmith, Math.floor(materials.ore / 2), materials.wood);
      materials.ore -= batches * 2;
      materials.wood -= batches;
      addMaterial(materials, "ingot", batches);
      events.push(`대장장이: 철괴 +${batches}`);
    }
  }
  return events;
}

export function revealFloor(state) {
  if (!state.expedition) return;
  const floor = state.expedition.floor;
  const hasLantern = state.inventory.some((item) => item.x >= 0 && item.defId === "lantern");
  const radius = hasLantern ? 4 : 3;
  const seen = new Set(floor.seen);
  for (let y = 0; y < floor.tiles.length; y += 1) {
    for (let x = 0; x < floor.tiles[y].length; x += 1) {
      if (Math.max(Math.abs(x - state.player.x), Math.abs(y - state.player.y)) <= radius) {
        seen.add(keyOf(x, y));
      }
    }
  }
  floor.seen = [...seen];
}

export function isVisible(state, x, y) {
  const hasLantern = state.inventory.some((item) => item.x >= 0 && item.defId === "lantern");
  const radius = hasLantern ? 4 : 3;
  return Math.max(Math.abs(x - state.player.x), Math.abs(y - state.player.y)) <= radius;
}

export function findPath(tiles, start, target, blockedKeys = new Set(), allowedKeys = null) {
  const queue = [start];
  const cameFrom = new Map([[keyOf(start.x, start.y), null]]);
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  while (queue.length) {
    const current = queue.shift();
    if (current.x === target.x && current.y === target.y) break;
    for (const [dx, dy] of directions) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = keyOf(next.x, next.y);
      if (next.x < 0 || next.y < 0 || next.y >= tiles.length || next.x >= tiles[next.y].length) continue;
      if (tiles[next.y][next.x] !== "floor" || cameFrom.has(key)) continue;
      if (blockedKeys.has(key) && !(next.x === target.x && next.y === target.y)) continue;
      if (allowedKeys && !allowedKeys.has(key) && !(next.x === target.x && next.y === target.y)) continue;
      cameFrom.set(key, current);
      queue.push(next);
    }
  }
  const targetKey = keyOf(target.x, target.y);
  if (!cameFrom.has(targetKey)) return [];
  const path = [];
  let current = target;
  while (current) {
    path.push(current);
    current = cameFrom.get(keyOf(current.x, current.y));
  }
  return path.reverse();
}

export function pathStepToward(tiles, start, target, blockedKeys = new Set()) {
  const path = findPath(tiles, start, target, blockedKeys);
  return path[1] || start;
}

export function activeItems(state) {
  return state.inventory
    .filter((item) => item.x >= 0)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.uid.localeCompare(b.uid));
}

export function resolveBagTrigger(state, trigger, context = {}) {
  const result = {
    damage: context.damage || 0,
    poison: context.poison || 0,
    burn: context.burn || 0,
    shock: context.shock || 0,
    block: context.block || 0,
    heal: context.heal || 0,
    bonusScrap: context.bonusScrap || 0,
    events: [],
    triggered: []
  };
  const inventory = state.inventory;
  for (const item of activeItems(state)) {
    const definition = ITEM_DEFS[item.defId];
    const adjacentWeapon = hasAdjacentTag(inventory, item.uid, "weapon");
    const adjacentCrystal = hasAdjacentTag(inventory, item.uid, "crystal");
    const adjacentDefense = hasAdjacentTag(inventory, item.uid, "defense");
    const adjacentGear = hasAdjacentTag(inventory, item.uid, "gear");
    let text = null;
    if (trigger === "attack") {
      if (item.defId === "blade") {
        result.damage += 3;
        text = "장검 +3";
      } else if (item.defId === "barbarianAxe") {
        const isolated = countAdjacentTag(inventory, item.uid, "weapon") === 0;
        result.damage += isolated ? 5 : 4;
        text = isolated ? "파쇄도끼 야성 +5" : "파쇄도끼 +4";
      } else if (item.defId === "whetstone") {
        const weapons = countAdjacentTag(inventory, item.uid, "weapon");
        if (weapons > 0) {
          const bonus = weapons + (weapons >= 2 ? 1 : 0);
          result.damage += bonus;
          text = `숫돌 +${bonus}`;
        }
      } else if (item.defId === "venom") {
        result.poison += adjacentWeapon ? 2 : 1;
        text = adjacentWeapon ? "독병 중독 2" : "독병 중독 1";
      } else if (item.defId === "ember") {
        item.counters.attacks = (item.counters.attacks || 0) + 1;
        if (item.counters.attacks % 2 === 0) {
          const amount = adjacentWeapon ? 2 : 1;
          result.burn += amount;
          text = `불씨 화상 ${amount}`;
        }
      } else if (item.defId === "coil") {
        const threshold = adjacentCrystal ? 2 : 3;
        const charge = item.counters.charge || 0;
        if (charge >= threshold) {
          result.shock += 2;
          item.counters.charge = 0;
          text = "코일 감전 2";
        }
      }
    }
    if (trigger === "move") {
      if (item.defId === "boots") {
        item.counters.steps = (item.counters.steps || 0) + 1;
        if (item.counters.steps % 3 === 0) {
          state.player.evasion = Math.max(state.player.evasion, 1);
          text = "장화 회피 충전";
        }
      } else if (item.defId === "martialWraps") {
        item.counters.steps = (item.counters.steps || 0) + 1;
        if (item.counters.steps % 3 === 0) {
          state.player.evasion = Math.max(state.player.evasion, 1);
          text = "경맥포 회피 충전";
        }
      } else if (item.defId === "coil") {
        item.counters.charge = (item.counters.charge || 0) + (adjacentGear ? 2 : 1);
        const threshold = adjacentCrystal ? 2 : 3;
        if (item.counters.charge >= threshold) text = "코일 충전 완료";
      }
    }
    if (trigger === "hurt") {
      if (item.defId === "buckler" && state.player.turn >= item.readyAtTurn) {
        const amount = adjacentCrystal ? 3 : 2;
        result.block += amount;
        const hasArmor = adjacentItemUids(inventory, item.uid).some((otherUid) => (
          inventory.find((entry) => entry.uid === otherUid)?.defId === "armor"
        ));
        item.readyAtTurn = state.player.turn + (hasArmor ? 1 : 2);
        text = `버클러 방어 ${amount}`;
      } else if (item.defId === "armor") {
        result.block += 1;
        text = "갑옷 방어 1";
      } else if (item.defId === "knightAegis") {
        result.block += 2;
        text = "대방패 방어 2";
      } else if (item.defId === "crystal" && state.player.turn >= item.readyAtTurn) {
        result.block += adjacentDefense ? 2 : 1;
        item.readyAtTurn = state.player.turn + 3;
        text = adjacentDefense ? "공명 방어 2" : "공명 방어 1";
      }
    }
    const affixAttack = trigger === "attack" ? itemAffixBonus(item, "attack") : 0;
    const affixBlock = trigger === "hurt" ? itemAffixBonus(item, "block") : 0;
    if (affixAttack) {
      result.damage += affixAttack;
      text = text ? `${text} · 옵션 +${affixAttack}` : `예리한 옵션 +${affixAttack}`;
    }
    if (affixBlock) {
      result.block += affixBlock;
      text = text ? `${text} · 옵션 방어 ${affixBlock}` : `견고한 옵션 방어 ${affixBlock}`;
    }
    if (trigger === "kill" && item.defId === "scavengerCharm") {
      result.bonusScrap += 1;
      text = "부적 고철 +1";
    }
    if (text) {
      result.events.push({ text, tone: "item", uid: item.uid, name: definition.name });
      result.triggered.push(item.uid);
    }
  }
  state.lastTriggered = result.triggered;
  return result;
}

export function useHerbKit(state, uid) {
  const item = state.inventory.find((entry) => entry.uid === uid && entry.defId === "herbKit" && entry.x >= 0);
  const pressure = state.expedition?.pressure || {};
  const highestPressure = Object.entries(pressure).sort((a, b) => b[1] - a[1])[0];
  if (!item || !item.charges || (state.player.hp >= state.player.maxHp && (!highestPressure || highestPressure[1] <= 0))) return null;
  const adjacentAlchemy = hasAdjacentTag(state.inventory, uid, "alchemy");
  const amount = adjacentAlchemy ? 8 : 6;
  const pressureAmount = adjacentAlchemy ? 6 : 4;
  item.charges -= 1;
  const healed = Math.min(amount, state.player.maxHp - state.player.hp);
  state.player.hp += healed;
  let reduced = 0;
  if (highestPressure?.[1] > 0) {
    reduced = Math.min(pressureAmount, highestPressure[1]);
    pressure[highestPressure[0]] -= reduced;
  }
  state.lastTriggered = [uid];
  const effects = [];
  if (healed) effects.push(`체력 ${healed} 회복`);
  if (reduced) effects.push(`환경 압력 ${reduced} 완화`);
  return { healed, pressureReduced: reduced, text: `${ITEM_DEFS.herbKit.name}: ${effects.join(" · ")}` };
}

export function migrateState(rawState) {
  if (!rawState || typeof rawState !== "object") return createInitialState();
  const previousVersion = Number(rawState.version || 1);
  const base = createInitialState();
  const rawMeta = rawState.meta || {};
  const state = {
    ...base,
    ...rawState,
    meta: {
      ...base.meta,
      ...rawMeta,
      skillMastery: { ...base.meta.skillMastery, ...(rawMeta.skillMastery || {}) },
      materials: { ...base.meta.materials, ...(rawMeta.materials || {}) },
      estate: {
        ...base.meta.estate,
        ...(rawMeta.estate || {}),
        workers: { ...base.meta.estate.workers, ...(rawMeta.estate?.workers || {}) }
      }
    },
    player: { ...base.player, ...(rawState.player || {}) },
    inventory: Array.isArray(rawState.inventory) ? rawState.inventory.map((item) => ({ quality: 50, affixes: [], ...item })) : base.inventory,
    log: Array.isArray(rawState.log) ? rawState.log : base.log
  };
  if (previousVersion < 2 && state.expedition) {
    state.expedition = null;
    state.player.hp = state.player.maxHp;
    state.player.guard = 0;
    state.player.evasion = 0;
    state.log.unshift({ text: "광역 지도 개편으로 진행 중이던 원정은 공방에서 안전하게 재정비되었다.", tone: "item" });
  }
  const convertedBlueprints = (state.meta.research || []).filter((id) => ITEM_DEFS[id]);
  state.meta.blueprints = [...new Set(["frontierMantle", ...(rawMeta.blueprints || []), ...convertedBlueprints])];
  if (!CLASS_DEFS[state.meta.classId]) state.meta.classId = "knight";
  if (!TRAIT_DEFS[state.meta.traitId]) state.meta.traitId = "duneBorn";
  if (state.expedition) {
    state.expedition.pressure = { heat: 0, toxin: 0, cold: 0, corruption: 0, ...(state.expedition.pressure || {}) };
    state.expedition.cargo = {
      materials: { ...(state.expedition.cargo?.materials || {}) },
      blueprints: [...(state.expedition.cargo?.blueprints || [])]
    };
  }
  state.version = SAVE_VERSION;
  return state;
}

export function availableLootDef(state, random = Math.random) {
  const ownedDefs = new Set(state.inventory.map((item) => item.defId));
  const researched = new Set(state.meta.research);
  const candidates = LOOT_TABLE.filter((defId) => researched.has(defId) || ownedDefs.has(defId) || ["crystal", "herbKit", "scavengerCharm"].includes(defId));
  return candidates[Math.floor(random() * candidates.length)] || "crystal";
}

export function floorIsConnected(floor) {
  const reachable = reachableKeys(floor.tiles, floor.start);
  return [floor.core, ...floor.beacons].every((point) => reachable.has(keyOf(point.x, point.y)));
}

export const worldIsConnected = floorIsConnected;
