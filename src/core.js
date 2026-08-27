import {
  AREA_DEFS,
  BAG_COLS,
  AFFIX_DEFS,
  BASE_BAG_ROWS,
  CLASS_DEFS,
  ENEMY_DEFS,
  ITEM_DEFS,
  HERB_IDS,
  LOOT_TABLE,
  MATERIAL_DEFS,
  ORE_SMELTING_DEFS,
  PRODUCTION_COMPANION_DEFS,
  REGION_INFO,
  TRAIT_DEFS,
  WORKER_PROFICIENCY_TIERS,
  WORLD_SIZE
} from "./data.js";
import { FRONTIER_ZONE_DEFS, LIVING_AREA_DEFS, createInitialFrontierState, createInitialMerchantState } from "./frontier.js";
import { createDefenseDeployments } from "./defense.js";
import { EQUIPMENT_DEFS, MASTERY_MAX, PLAYER_KIT_DEFS, createDefaultCommander, newUnitProgress, createEmptyEquipped, createEquipmentInstance, findEquipmentInstance, normalizedPlayerLoadout, playerBaseClassDefinition, playerCombatStats, playerKitDefinition } from "./classes.js";

export const SAVE_VERSION = 27;

// 영지 행복도(state.meta.estate.happiness)가 생산 속도에 미치는 배율.
// 기준치(70, 신규 영지의 시작값)에서는 정확히 1.0배 — 기존 저장/테스트의 기준 생산량을 그대로 유지한다.
// 행복도가 오르내릴 때마다 1점당 0.6%씩 빨라지거나 느려지며 0.55~1.3배 사이로 제한된다.
export function happinessMultiplier(happiness = 70) {
  const value = Math.max(0, Math.min(100, Number(happiness) || 0));
  return Math.max(0.55, Math.min(1.3, 1 + (value - 70) * 0.006));
}

// 분대 모병 비용 배율. 기준치(70)에서 1.0배이며, 행복도가 낮을수록 비싸지고(최대 1.4배) 높을수록 절감된다(최소 0.6배).
export function happinessRecruitCostMultiplier(happiness = 70) {
  const value = Math.max(0, Math.min(100, Number(happiness) || 0));
  return Math.max(0.6, Math.min(1.4, 1 - (value - 70) * 0.008));
}

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

export function createCraftedItem(defId, uid, random = Math.random, { qualityBonus = 0, bonusAffixChance = 0 } = {}) {
  const item = createItem(defId, uid);
  item.quality = Math.min(100, 45 + Math.floor(random() * 56) + qualityBonus);
  const affixIds = Object.keys(AFFIX_DEFS);
  const affixCount = item.quality >= 85 || random() < bonusAffixChance ? 2 : 1;
  while (item.affixes.length < affixCount) {
    const affixId = affixIds[Math.floor(random() * affixIds.length)];
    if (!item.affixes.includes(affixId)) item.affixes.push(affixId);
  }
  return item;
}

export function createInitialState() {
  const frontier = createInitialFrontierState();
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
      selectedAreaId: "estate",
      areaRecords: {
        estate: { visits: 0, victories: 0, bestSurvey: 0 },
        desert: { visits: 0, victories: 0, bestSurvey: 0 },
        snowfield: { visits: 0, victories: 0, bestSurvey: 0 }
      },
      classId: "knight",
      traitId: "duneBorn",
      skillMastery: {},
      // 장비 제작 굴림용 시드. 저장에 남아 이어지므로 되돌려 다시 굴릴 수 없다.
      // 플레이마다 다른 결과가 나오도록 시작값을 흩어둔다(테스트는 직접 지정).
      craftSeed: (Date.now() ^ 0x9e3779b9) >>> 0,
      // 마지막 저장 시각. 오프라인 정산이 이걸 기준으로 경과 시간을 잰다.
      savedAt: Date.now(),
      // 영지 명성과 주변 세력 우호도. 명성이 쌓이면 우호도가 오르고
      // 임계를 넘으면 설계도를 선물받는다(수평 컨텐츠 유입 경로).
      renown: 0,
      favor: {},
      favorClaimed: {},
      // 직접 쓰러뜨려 본 보스. 영지 기억 던전에서 다시 세울 수 있는 목록이다.
      rememberedBosses: [],
      // 지역 대응 소모품 보유량과, 흡수해 둔 지역 핵.
      regionTonics: {},
      absorbedCores: [],
      blueprints: ["frontierMantle"],
      // 선언된 재료는 **전부** 0으로 깔고 시작 보유분만 덮어쓴다.
      // 예전엔 손으로 적은 43개만 있어서 보스 부산물 30종이 통째로 빠져 있었다
      // (golemCore, frostCore, durahanSoul 등). 키가 없으면 보유량이 undefined라
      // 소모·표시 계산이 조용히 어긋난다.
      materials: {
        ...Object.fromEntries(Object.keys(MATERIAL_DEFS).map((id) => [id, 0])),
        wood: 4, food: 4, ore: 4, ingot: 2, herb: 2
      },
      estate: {
        tick: 0,
        workers: { steward: 1, lumberjack: 0, miner: 0, refiner: 1, herbalist: 0, blacksmith: 1 },
        workerProgress: {
          lumberjack: { workHours: 0, cycle: 0, yieldRemainder: 0, materialRemainders: {} },
          miner: { workHours: 0, cycle: 0, yieldRemainder: 0, materialRemainders: {} },
          refiner: { workHours: 0, cycle: 0, yieldRemainder: 0, materialRemainders: {} },
          herbalist: { workHours: 0, cycle: 0, yieldRemainder: 0, materialRemainders: {} },
          blacksmith: { workHours: 0, cycle: 0, yieldRemainder: 0, materialRemainders: {} }
        },
        productionCompanions: {},
        happiness: 70,
        // 마탑 — 북부 특수 동료(마탑 설계자)를 구조해야 지을 수 있다.
        // level 0은 아직 없는 상태다.
        mageTower: { level: 0, loadedSpellId: null, chargesUsed: 0 },
        // 창고 등급. 재료 **종류당** 상한을 정한다(총량이 아니다).
        // 오프라인으로 쌓이는 양이 여기서 잘리므로, 오래 비울수록 키울 이유가 생긴다.
        warehouseLevel: 0
      },
      merchant: createInitialMerchantState(frontier),
      villageFriendship: { north: 0, south: 0, east: 0, west: 0, central: 0 },
      villageMilestones: { north: [], south: [], east: [], west: [], central: [] },
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
    adventure: {
      selectedRegionId: "central",
      unlockedRegionIds: ["north", "south", "east", "west", "central"],
      commander: createDefaultCommander(),
      roster: ["snow_guard", "venom_tracker", "formation_officer", "oath_knight", "desert_lancer"],
      party: ["snow_guard", "oath_knight"],
      unitProgress: {
        snow_guard: newUnitProgress(),
        venom_tracker: newUnitProgress(),
        formation_officer: newUnitProgress(),
        oath_knight: newUnitProgress(),
        desert_lancer: newUnitProgress()
      },
      unlockedTechniques: ["survival", "poison", "forging", "oath", "mobility"],
      records: {
        north: { visits: 0, victories: 0, dungeonOpened: false },
        south: { visits: 0, victories: 0, dungeonOpened: false },
        east: { visits: 0, victories: 0, dungeonOpened: false },
        west: { visits: 0, victories: 0, dungeonOpened: false },
        central: { visits: 0, victories: 0, dungeonOpened: false }
      },
      run: null
    },
    estateDefense: {
      threat: 28,
      fortification: 0,
      victories: 0,
      pending: null,
      battle: null,
      result: null,
      deployments: createDefenseDeployments(),
      campaign: null
    },
    frontier,
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

export function createWorld(seed, areaId = "desert") {
  const area = AREA_DEFS[areaId] || AREA_DEFS.desert;
  const random = mulberry32(seed + 9973);
  const tiles = buildTiles(random);
  const start = { ...WORLD_LANDMARKS.start };
  const core = { ...WORLD_LANDMARKS.core };
  const beacons = WORLD_LANDMARKS.beacons.slice(0, area.beaconGoal).map((point) => ({ ...point }));
  const occupied = new Set([keyOf(start.x, start.y), ...beacons.map((point) => keyOf(point.x, point.y))]);
  if (area.bossDefId) occupied.add(keyOf(core.x, core.y));
  const enemies = [];
  for (let index = 0; index < area.enemyCount; index += 1) {
    const position = chooseOpenCell(random, tiles, occupied, 6, start);
    if (!position) continue;
    occupied.add(keyOf(position.x, position.y));
    const defId = area.enemyPool[Math.floor(random() * area.enemyPool.length)];
    const definition = ENEMY_DEFS[defId];
    enemies.push({
      id: `enemy-${area.id}-${index}`,
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
  if (area.bossDefId) {
    const boss = ENEMY_DEFS[area.bossDefId];
    enemies.push({
      id: "enemy-boss",
      defId: area.bossDefId,
      x: core.x,
      y: core.y,
      hp: boss.hp,
      maxHp: boss.hp,
      intent: "pursue",
      poison: 0,
      burn: 0,
      active: false
    });
  }
  const features = {};
  if (area.kind === "estate") {
    const estateNodes = [
      { point: WORLD_LANDMARKS.beacons[0], name: "서부 벌목장", glyph: "♣", materialId: "wood" },
      { point: WORLD_LANDMARKS.beacons[1], name: "남부 채석장", glyph: "♦", materialId: "ore" },
      { point: WORLD_LANDMARKS.beacons[2], name: "북부 감시탑", glyph: "⌖", materialId: null }
    ];
    for (const node of estateNodes) {
      occupied.add(keyOf(node.point.x, node.point.y));
      features[keyOf(node.point.x, node.point.y)] = { type: "estateNode", name: node.name, glyph: node.glyph, materialId: node.materialId, collected: false };
    }
    features[keyOf(core.x, core.y)] = { type: "estateHall", name: "개척 영주관" };
  } else {
    beacons.forEach((point, index) => {
      features[keyOf(point.x, point.y)] = { type: "beacon", id: `beacon-${index + 1}`, activated: false };
    });
    features[keyOf(core.x, core.y)] = { type: "core" };
    for (let index = 0; index < area.cacheCount; index += 1) {
      const position = chooseOpenCell(random, tiles, occupied, 4, start);
      if (!position) continue;
      occupied.add(keyOf(position.x, position.y));
      features[keyOf(position.x, position.y)] = { type: "cache", opened: false };
    }
    for (let index = 0; index < area.hazardCount; index += 1) {
      const position = chooseOpenCell(random, tiles, occupied, 2, start);
      if (!position) continue;
      occupied.add(keyOf(position.x, position.y));
      features[keyOf(position.x, position.y)] = { type: "hazard", pressureId: area.pressure?.id || "toxin" };
    }
    for (let index = 0; index < area.campCount; index += 1) {
      const position = chooseOpenCell(random, tiles, occupied, 8, start);
      if (!position) continue;
      occupied.add(keyOf(position.x, position.y));
      features[keyOf(position.x, position.y)] = { type: "camp", used: false };
    }
  }
  return {
    seed,
    areaId: area.id,
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
  return createWorld(seed, "desert");
}

export function createExpedition(state, seed = Date.now() % 2147483647, areaId = state.meta.selectedAreaId) {
  const area = AREA_DEFS[areaId] || AREA_DEFS.estate;
  const floor = createWorld(seed, area.id);
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
    areaId: area.id,
    phase: "active",
    beaconsActivated: 0,
    beaconGoal: area.beaconGoal,
    runScrap: 0,
    runEssence: 0,
    pressure: { heat: 0, toxin: 0, cold: 0, corruption: 0 },
    cargo: { materials: {}, blueprints: [] },
    lootFound: 0,
    floor
  };
  state.meta.expeditions += 1;
  state.meta.selectedAreaId = area.id;
  state.meta.areaRecords[area.id].visits += 1;
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

function ensureWorkerProgress(state, workerId) {
  const estate = state.meta.estate;
  estate.workerProgress ||= {};
  estate.workerProgress[workerId] ||= { workHours: 0, cycle: 0, yieldRemainder: 0, materialRemainders: {} };
  estate.workerProgress[workerId].materialRemainders ||= {};
  return estate.workerProgress[workerId];
}

export function workerProficiencyAt(workHours = 0) {
  const hours = Math.max(0, Number(workHours) || 0);
  return [...WORKER_PROFICIENCY_TIERS].reverse().find((tier) => hours >= tier.hours) || WORKER_PROFICIENCY_TIERS[0];
}

function recruitedProductionCompanions(state, workerId) {
  return Object.keys(state.meta.estate.productionCompanions || {})
    .filter((id) => state.meta.estate.productionCompanions[id] && PRODUCTION_COMPANION_DEFS[id]?.workerId === workerId)
    .map((id) => PRODUCTION_COMPANION_DEFS[id]);
}

export function activeWorkerCount(state, workerId) {
  const hired = state.meta.estate.workers[workerId] || 0;
  return hired + recruitedProductionCompanions(state, workerId).length;
}

export function workerProficiency(state, workerId) {
  const progress = ensureWorkerProgress(state, workerId);
  const tier = workerProficiencyAt(progress.workHours);
  const level = WORKER_PROFICIENCY_TIERS.indexOf(tier);
  const nextTier = WORKER_PROFICIENCY_TIERS[level + 1] || WORKER_PROFICIENCY_TIERS[WORKER_PROFICIENCY_TIERS.length - 1];
  const span = Math.max(1, nextTier.hours - tier.hours);
  const companions = recruitedProductionCompanions(state, workerId);
  return {
    ...tier,
    yieldBonus: tier.yieldBonus + companions.reduce((sum, c) => sum + (c.yieldBonus || 0), 0),
    speedBonus: tier.speedBonus + companions.reduce((sum, c) => sum + (c.speedBonus || 0), 0),
    materialSaving: tier.materialSaving + companions.reduce((sum, c) => sum + (c.materialSaving || 0), 0),
    companions,
    level,
    workHours: progress.workHours,
    nextHours: nextTier.hours,
    maxed: tier.id === WORKER_PROFICIENCY_TIERS[WORKER_PROFICIENCY_TIERS.length - 1].id,
    ratio: tier.id === nextTier.id ? 1 : Math.max(0, Math.min(1, (progress.workHours - tier.hours) / span))
  };
}

export function recordWorkerWork(state, workerId, hours = 1) {
  const progress = ensureWorkerProgress(state, workerId);
  const previous = workerProficiencyAt(progress.workHours);
  progress.workHours += Math.max(0, Number(hours) || 0);
  const current = workerProficiencyAt(progress.workHours);
  return { previous, current, advanced: previous.id !== current.id };
}

export function adjustedWorkerMaterialCosts(state, workerId, materials, commit = false) {
  const progress = ensureWorkerProgress(state, workerId);
  const tier = workerProficiency(state, workerId);
  const nextRemainders = { ...progress.materialRemainders };
  const costs = {};
  for (const [materialId, rawAmount] of Object.entries(materials)) {
    const amount = Math.max(0, Math.floor(rawAmount));
    if (!MATERIAL_DEFS[materialId]?.common || tier.materialSaving <= 0 || amount <= 0) {
      costs[materialId] = amount;
      continue;
    }
    const savingCredit = (nextRemainders[materialId] || 0) + amount * tier.materialSaving;
    const saved = Math.min(Math.max(0, amount - 1), Math.floor(savingCredit));
    costs[materialId] = amount - saved;
    nextRemainders[materialId] = savingCredit - saved;
  }
  if (commit) progress.materialRemainders = nextRemainders;
  return costs;
}

function workerOutputAmount(state, workerId, baseAmount, outputId = null) {
  const progress = ensureWorkerProgress(state, workerId);
  const tier = workerProficiency(state, workerId);
  if (outputId) {
    progress.yieldRemainders ||= {};
    const remainder = progress.yieldRemainders[outputId] || 0;
    const total = baseAmount * (1 + tier.yieldBonus) + remainder;
    const amount = Math.floor(total + 1e-9);
    progress.yieldRemainders[outputId] = Math.max(0, total - amount);
    return amount;
  }
  const total = baseAmount * (1 + tier.yieldBonus) + progress.yieldRemainder;
  const amount = Math.floor(total + 1e-9);
  progress.yieldRemainder = Math.max(0, total - amount);
  return amount;
}

function advanceWorkerCycle(state, workerId, interval, activeWorkers) {
  if (activeWorkers <= 0) return { cycles: 0, advanced: false, current: workerProficiency(state, workerId) };
  const progress = ensureWorkerProgress(state, workerId);
  const beforeWork = workerProficiency(state, workerId);
  // 영지 행복도가 높을수록 배경 생산(벌목·채광·제련·약초) 진행이 더 빨리 쌓인다.
  progress.cycle += (1 + beforeWork.speedBonus) * happinessMultiplier(state.meta.estate?.happiness);
  const work = recordWorkerWork(state, workerId, activeWorkers);
  const cycles = Math.floor((progress.cycle + 1e-9) / interval);
  if (cycles > 0) progress.cycle -= cycles * interval;
  return { cycles, ...work };
}

// ── 오프라인 정산 ──────────────────────────────────────────────────────────
//
// 게임을 껐다 켜면 그동안 흐른 시간만큼 영지가 돌아 있다. 다만 세 겹으로 조인다.
//
//   1) 속도    — 오프라인은 온라인보다 느리다. 안 켜는 게 이득이면 안 되기 때문이다.
//   2) 귀함    — 귀한 재료일수록 더 적게 나온다. 보스 부산물이 자면서 쌓이면
//                파밍이 무의미해진다.
//   3) 창고    — 재료마다 상한이 있고, 차면 더 안 쌓인다. 오래 비울수록
//                창고를 키울 이유가 생긴다.
//
// 재료 등급은 카테고리가 아니라 **어디서 나오는가**로 가른다. MATERIAL_DEFS의
// category는 special 하나에 약초와 보스 부산물이 섞여 있어 쓸 수가 없다.
// ENEMY_COMBATANTS의 byproducts에서 역산하면 정확히 갈린다.

// 오프라인 1시간이 온라인 몇 턴에 해당하는가. 원정 한 번이 대략 여러 턴이므로
// 자리를 비운 값이 직접 도는 것보다 항상 못하도록 낮게 잡는다.
export const OFFLINE_TURNS_PER_HOUR = 4;

// 오프라인 몇 시간이 개척 주기 하나인가. 직접 "주기 진행"을 누르는 것보다
// 훨씬 느려야 자리를 비우는 게 이득이 되지 않는다.
export const OFFLINE_HOURS_PER_CYCLE = 3;

// 축이 둘이다. 섞으면 한쪽을 조일 때 다른 쪽이 같이 움직여서 조절이 안 된다.
//
//   1) 무엇이 도는가   — 일꾼 생산은 자리를 비워도 어느 정도 돌지만,
//                        원정은 사람이 붙어야 하는 일이라 더 많이 깎인다.
//   2) 무엇이 나오는가 — 귀한 재료일수록 덜 나온다. 보스 부산물이 자면서
//                        쌓이면 파밍이 통째로 무의미해진다.
//
// 최종 수급 = 활동 배율 × 등급 배율.

// 일꾼 생산·던전 수익. 일꾼은 내가 없어도 일하므로 절반은 돈다.
export const OFFLINE_PRODUCTION_RATE = 0.5;

// 분대 원정. 기본은 낮고 마탑이 끌어올린다 — 마탑의 동사("먼 곳에 손을 뻗는다")를
// 오프라인으로 확장한 것이다. 원정은 직접 컨트롤하지 않는 대신, 미리 지어두면
// 손실이 준다는 준비 요소가 된다.
export const OFFLINE_EXPEDITION_BASE = 0.3;
export const OFFLINE_EXPEDITION_PER_TOWER_LEVEL = 0.1; // 3층이면 0.6

export function offlineExpeditionRate(towerLevel = 0) {
  return OFFLINE_EXPEDITION_BASE
    + Math.max(0, Math.min(3, towerLevel || 0)) * OFFLINE_EXPEDITION_PER_TOWER_LEVEL;
}

// 등급별 오프라인 배율. 활동 배율 위에 곱해진다.
//
// **보스 재료(전설·신화)는 오프라인에 나오지 않는다.** 자면서 쌓이면 파밍이
// 통째로 무의미해진다 — 강화 파손 수리가 보스 부산물을 요구하는 구조인데,
// 그게 자동으로 들어오면 원정을 나갈 이유가 사라진다.
//
// 희귀(2차 가공)도 막는다. 손이 두 번 가는 것을 자면서 얻으면 가공이라는
// 단계 자체가 의미를 잃는다. 고급(1차 가공)까지만 자동으로 돈다.
export const OFFLINE_YIELD_BY_RARITY = {
  normal: 1,      // 일꾼이 캐고 줍는 것
  fine: 0.6,      // 한 번 가공한 것 — 제련공이 돌리므로 조금은 나온다
  rare: 0,        // 두 번 가공한 것 — 직접 해야 한다
  legendary: 0,   // 필드 보스 부산물
  mythic: 0       // 지역 보스 부산물
};

export function offlineTierYield(rarity) {
  return OFFLINE_YIELD_BY_RARITY[rarity] ?? 1;
}

// 창고 등급별 재료 **종류당** 상한. 총량이 아니다 — 총량이면 흔한 재료가
// 귀한 재료 자리를 밀어내는데, 그게 오프라인 보상에서 일어나면 억울하다.
export const WAREHOUSE_LEVEL_CAP = [120, 240, 420, 700];
export const WAREHOUSE_MAX_LEVEL = WAREHOUSE_LEVEL_CAP.length - 1;
export const WAREHOUSE_UPGRADE_COST = [0, 40, 90, 180]; // 고철

export function warehouseCap(level = 0) {
  return WAREHOUSE_LEVEL_CAP[Math.max(0, Math.min(WAREHOUSE_MAX_LEVEL, level || 0))];
}

// 자리를 비운 시간(시간 단위). 상한은 여기서 걸지 않는다 —
// "얼마나 담기느냐"는 창고가 정하므로 시간 자체는 그대로 센다.
export function offlineHours(savedAt, now = Date.now()) {
  if (!savedAt) return 0;
  return Math.max(0, now - savedAt) / 3600000;
}

// 창고 상한을 적용해 재료를 담는다. 넘치는 만큼은 버려지고, 얼마나 버려졌는지
// 돌려준다 — 보고 화면에서 "창고가 꽉 차서 놓쳤다"를 보여줘야 창고를 키운다.
export function storeMaterial(state, materialId, amount) {
  if (amount <= 0) return { stored: 0, overflow: 0 };
  const cap = warehouseCap(state.meta.estate.warehouseLevel);
  const current = state.meta.materials[materialId] || 0;
  const room = Math.max(0, cap - current);
  const stored = Math.min(room, amount);
  state.meta.materials[materialId] = current + stored;
  return { stored, overflow: amount - stored };
}

// 오프라인 정산. 자리를 비운 동안 영지가 얼마나 돌았는지 계산해 실제로 반영하고,
// 무슨 일이 있었는지 보고서를 돌려준다.
//
// tierOf는 adventure.js의 materialRarity를 넘겨받는다 — core가 adventure를
// 임포트하면 순환 참조가 생기기 때문이다.
// dungeonIncome은 호출자가 넘긴다 — 개방 던전 목록과 보상 재료는 game.js가
// 알고 있고, core가 adventure.js를 임포트하면 순환 참조가 생긴다.
// 형태: [{ materialId, amountPerCycle, scrapPerCycle, label }]
export function settleOffline(state, tierOf, dungeonIncome = [], now = Date.now()) {
  const savedAt = state.meta.savedAt || 0;
  const hours = offlineHours(savedAt, now);
  // 너무 짧으면 정산하지 않는다. 창을 잠깐 껐다 켠 것까지 보고서를 띄우면 성가시다.
  if (hours < 0.25) return null;

  const towerLevel = state.meta.estate.mageTower?.level || 0;
  const expeditionRate = offlineExpeditionRate(towerLevel);
  const before = { ...state.meta.materials };
  const beforeScrap = state.meta.scrap;
  const turns = Math.floor(hours * OFFLINE_TURNS_PER_HOUR);
  if (turns <= 0) return null;

  // 일꾼 생산은 advanceEstate를 그대로 돌린다. 온라인과 다른 계산을 만들면
  // 둘이 어긋나기 시작한다 — 대신 결과를 배율로 깎는다.
  advanceEstate(state, turns);

  // 실제로 얼마나 늘었는지 보고, 배율과 창고 상한을 다시 적용한다.
  const gained = {};
  const overflowed = {};
  for (const [id, after] of Object.entries(state.meta.materials)) {
    const delta = after - (before[id] || 0);
    if (delta <= 0) continue;
    const tier = tierOf(id);
    const rate = OFFLINE_PRODUCTION_RATE * offlineTierYield(tier);
    const target = Math.floor(delta * rate);
    // 일단 되돌린 뒤 상한을 걸어 다시 담는다.
    state.meta.materials[id] = before[id] || 0;
    const { stored, overflow } = storeMaterial(state, id, target);
    if (stored > 0) gained[id] = stored;
    if (overflow > 0) overflowed[id] = overflow;
  }

  // 개방 던전 수익. **귀한 재료가 오프라인에 나오는 유일한 통로다** —
  // 일꾼은 보스 부산물을 캐지 못하므로, 이게 없으면 등급 배율이 한 번도
  // 발동하지 않는 죽은 코드가 된다.
  //
  // 주기당 수익이므로 오프라인 시간을 주기로 환산해 곱한다.
  const cycles = Math.floor(hours / OFFLINE_HOURS_PER_CYCLE);
  let dungeonScrap = 0;
  for (const entry of dungeonIncome) {
    if (cycles <= 0) break;
    const tier = tierOf(entry.materialId);
    const rate = expeditionRate * offlineTierYield(tier);
    const amount = Math.floor(entry.amountPerCycle * cycles * rate);
    if (amount > 0) {
      const { stored, overflow } = storeMaterial(state, entry.materialId, amount);
      if (stored > 0) gained[entry.materialId] = (gained[entry.materialId] || 0) + stored;
      if (overflow > 0) overflowed[entry.materialId] = (overflowed[entry.materialId] || 0) + overflow;
    }
    dungeonScrap += Math.floor(entry.scrapPerCycle * cycles * expeditionRate);
  }
  state.meta.scrap += dungeonScrap;

  const scrapDelta = Math.floor((state.meta.scrap - beforeScrap - dungeonScrap) * expeditionRate) + dungeonScrap;
  state.meta.scrap = beforeScrap + Math.max(0, scrapDelta);

  state.meta.savedAt = now;
  return {
    hours: Math.round(hours * 10) / 10,
    turns,
    gained,
    overflowed,
    scrap: Math.max(0, scrapDelta),
    towerLevel,
    expeditionRate,
    warehouseCap: warehouseCap(state.meta.estate.warehouseLevel)
  };
}

export function advanceEstate(state, turns = 1) {
  const estate = state.meta.estate;
  const materials = state.meta.materials;
  const events = [];
  for (let turn = 0; turn < turns; turn += 1) {
    estate.tick += 1;
    const lumberjacks = activeWorkerCount(state, "lumberjack");
    const lumberWork = advanceWorkerCycle(state, "lumberjack", 3, lumberjacks);
    if (lumberWork.advanced) events.push(`벌목꾼 직종 숙련: ${lumberWork.current.name}`);
    if (lumberWork.cycles > 0) {
      const amount = workerOutputAmount(state, "lumberjack", lumberjacks * lumberWork.cycles);
      addMaterial(materials, "wood", amount);
      events.push(`벌목꾼: 목재 +${amount}`);
    }
    const miners = activeWorkerCount(state, "miner");
    const mineWork = advanceWorkerCycle(state, "miner", 4, miners);
    if (mineWork.advanced) events.push(`광부 직종 숙련: ${mineWork.current.name}`);
    if (mineWork.cycles > 0) {
      const amount = workerOutputAmount(state, "miner", miners * mineWork.cycles);
      addMaterial(materials, "ore", amount);
      events.push(`광부: 철광석 +${amount}`);
    }
    const refiners = activeWorkerCount(state, "refiner");
    for (const [oreId, yields] of Object.entries(ORE_SMELTING_DEFS)) {
      const activeRefiners = Math.min(refiners, Math.floor((materials[oreId] || 0) / 2), materials.wood);
      const refineWork = advanceWorkerCycle(state, "refiner", 5, activeRefiners);
      if (refineWork.advanced) events.push(`제련공 직종 숙련: ${refineWork.current.name}`);
      for (let cycle = 0; cycle < refineWork.cycles; cycle += 1) {
        const batches = Math.min(refiners, Math.floor((materials[oreId] || 0) / 2), materials.wood);
        if (batches <= 0) break;
        const baseCosts = { [oreId]: batches * 2, wood: batches };
        const costs = adjustedWorkerMaterialCosts(state, "refiner", baseCosts);
        if (Object.entries(costs).some(([materialId, amount]) => (materials[materialId] || 0) < amount)) break;
        adjustedWorkerMaterialCosts(state, "refiner", baseCosts, true);
        for (const [materialId, amount] of Object.entries(costs)) materials[materialId] -= amount;
        const produced = [];
        for (const [outputId, ratio] of Object.entries(yields)) {
          const amount = workerOutputAmount(state, "refiner", batches * ratio, outputId);
          if (amount > 0) {
            addMaterial(materials, outputId, amount);
            produced.push(`${MATERIAL_DEFS[outputId].name} +${amount}`);
          }
        }
        if (produced.length) events.push(`제련공: ${produced.join(", ")}`);
      }
    }
    const herbalists = activeWorkerCount(state, "herbalist");
    for (const herbId of HERB_IDS) {
      const activeHerbalists = Math.min(herbalists, materials[herbId] || 0);
      const herbWork = advanceWorkerCycle(state, "herbalist", 4, activeHerbalists);
      if (herbWork.advanced) events.push(`약초학자 직종 숙련: ${herbWork.current.name}`);
      for (let cycle = 0; cycle < herbWork.cycles; cycle += 1) {
        const batches = Math.min(herbalists, materials[herbId] || 0);
        if (batches <= 0) break;
        const baseCosts = { [herbId]: batches };
        const costs = adjustedWorkerMaterialCosts(state, "herbalist", baseCosts);
        if (Object.entries(costs).some(([materialId, amount]) => (materials[materialId] || 0) < amount)) break;
        adjustedWorkerMaterialCosts(state, "herbalist", baseCosts, true);
        for (const [materialId, amount] of Object.entries(costs)) materials[materialId] -= amount;
        const amount = workerOutputAmount(state, "herbalist", batches);
        for (let i = 0; i < amount; i += 1) state.inventory.push(createItem("herbKit", createUid(state)));
        if (amount > 0) events.push(`약초학자: 야전 약초함 +${amount}`);
      }
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

// 레벨 → 숙련 전환(v26). 예전 저장본은 { level, xp, secondaryId }를 갖고 있다.
//
// 레벨은 스탯을 줬지만 숙련은 주지 않으므로, 환산은 "얼마나 강했나"가 아니라
// "얼마나 오래 굴렸나"를 옮기는 작업이다. level 1 = 숙련 0으로 두고 그대로 옮긴다.
// 강함이 줄어드는 건 의도된 것이다 — 그만큼이 장비 축으로 넘어갔다.
//
// 끼고 있던 보조 특성(secondaryId)은 1번 슬롯으로 옮긴다. 다만 그 슬롯은 숙련 2에서
// 열리므로, 특성을 갖고 있었다면 숙련을 최소 2로 올려준다 — 이미 쓰던 걸
// 마이그레이션이 빼앗지 않기 위해서다.
export function migrateUnitProgress(baseProgress, rawProgress) {
  const merged = { ...baseProgress, ...(rawProgress || {}) };
  return Object.fromEntries(Object.entries(merged).map(([unitId, raw]) => {
    const legacyTrait = raw?.secondaryId || null;
    const traitIds = Array.isArray(raw?.traitIds)
      ? [raw.traitIds[0] ?? legacyTrait ?? null, raw.traitIds[1] ?? null]
      : [legacyTrait, null];
    let mastery = Math.max(0, Math.min(MASTERY_MAX, raw?.mastery ?? ((raw?.level || 1) - 1)));
    if (traitIds[0] && mastery < 2) mastery = 2;
    if (traitIds[1] && mastery < 4) mastery = 4;
    return [unitId, {
      mastery,
      xp: Math.max(0, raw?.xp || 0),
      branchId: raw?.branchId || null,
      traitIds
    }];
  }));
}

export function migrateState(rawState) {
  if (!rawState || typeof rawState !== "object") return createInitialState();
  const previousVersion = Number(rawState.version || 1);
  const base = createInitialState();
  const rawMeta = rawState.meta || {};
  const rawFrontier = rawState.frontier || {};
  const rawDefense = rawState.estateDefense || {};
  const state = {
    ...base,
    ...rawState,
    meta: {
      ...base.meta,
      ...rawMeta,
      areaRecords: Object.fromEntries(Object.keys(AREA_DEFS).map((areaId) => [
        areaId,
        { ...base.meta.areaRecords[areaId], ...(rawMeta.areaRecords?.[areaId] || {}) }
      ])),
      skillMastery: { ...base.meta.skillMastery, ...(rawMeta.skillMastery || {}) },
      materials: { ...base.meta.materials, ...(rawMeta.materials || {}) },
      merchant: {
        ...base.meta.merchant,
        ...(rawMeta.merchant || {}),
        prices: { ...base.meta.merchant.prices, ...(rawMeta.merchant?.prices || {}) }
      },
      villageFriendship: { ...base.meta.villageFriendship, ...(rawMeta.villageFriendship || {}) },
      villageMilestones: Object.fromEntries(Object.keys(base.meta.villageMilestones).map((regionId) => [
        regionId,
        [...new Set([...(base.meta.villageMilestones[regionId] || []), ...(rawMeta.villageMilestones?.[regionId] || [])])]
      ])),
      estate: {
        ...base.meta.estate,
        ...(rawMeta.estate || {}),
        workers: { ...base.meta.estate.workers, ...(rawMeta.estate?.workers || {}) },
        productionCompanions: { ...base.meta.estate.productionCompanions, ...(rawMeta.estate?.productionCompanions || {}) },
        workerProgress: Object.fromEntries(Object.keys(base.meta.estate.workerProgress).map((workerId) => [
          workerId,
          {
            ...base.meta.estate.workerProgress[workerId],
            ...(rawMeta.estate?.workerProgress?.[workerId] || {}),
            materialRemainders: {
              ...base.meta.estate.workerProgress[workerId].materialRemainders,
              ...(rawMeta.estate?.workerProgress?.[workerId]?.materialRemainders || {})
            }
          }
        ]))
      }
    },
    player: { ...base.player, ...(rawState.player || {}) },
    adventure: {
      ...base.adventure,
      ...(rawState.adventure || {}),
      unlockedRegionIds: [...new Set(rawState.adventure?.unlockedRegionIds || base.adventure.unlockedRegionIds)],
      roster: [...new Set(rawState.adventure?.roster || base.adventure.roster)],
      party: [...new Set(rawState.adventure?.party || base.adventure.party)].slice(0, 2),
      unitProgress: migrateUnitProgress(base.adventure.unitProgress, rawState.adventure?.unitProgress),
      commander: {
        ...base.adventure.commander,
        ...(rawState.adventure?.commander || {}),
        // 예전 저장본의 level을 숙련도로 환산한다. 레벨은 1부터, 숙련은 0부터라
        // -1을 하고, 숙련 상한을 넘지 않게 자른다. level 키는 지워서 남은 코드가
        // 실수로 다시 읽지 않게 한다.
        mastery: Math.max(0, Math.min(MASTERY_MAX,
          rawState.adventure?.commander?.mastery ?? ((rawState.adventure?.commander?.level || 1) - 1))),
        level: undefined,
        skillLoadouts: {
          ...base.adventure.commander.skillLoadouts,
          ...(rawState.adventure?.commander?.skillLoadouts || {})
        }
      },
      unlockedTechniques: [...new Set(rawState.adventure?.unlockedTechniques || base.adventure.unlockedTechniques)],
      records: Object.fromEntries(Object.keys(base.adventure.records).map((regionId) => [
        regionId,
        { ...base.adventure.records[regionId], ...(rawState.adventure?.records?.[regionId] || {}) }
      ])),
      run: rawState.adventure?.run || null
    },
    estateDefense: {
      ...base.estateDefense,
      ...rawDefense,
      deployments: {
        ...base.estateDefense.deployments,
        ...(rawDefense.deployments || {}),
        gates: Object.fromEntries(Object.keys(base.estateDefense.deployments.gates).map((gateId) => [
          gateId,
          [...new Set(rawDefense.deployments?.gates?.[gateId] || base.estateDefense.deployments.gates[gateId])]
        ])),
        remnants: [...new Set(rawDefense.deployments?.remnants || base.estateDefense.deployments.remnants)]
      },
      campaign: rawDefense.campaign || null
    },
    frontier: {
      ...base.frontier,
      ...rawFrontier,
      population: { ...base.frontier.population, ...(rawFrontier.population || {}) },
      livingAreas: Object.fromEntries(Object.keys(base.frontier.livingAreas).map((livingAreaId) => [
        livingAreaId,
        { ...base.frontier.livingAreas[livingAreaId], ...(rawFrontier.livingAreas?.[livingAreaId] || {}) }
      ])),
      estateSatisfaction: { ...base.frontier.estateSatisfaction, ...(rawFrontier.estateSatisfaction || {}) },
      zones: Object.fromEntries(Object.keys(base.frontier.zones).map((zoneId) => [
        zoneId,
        {
          ...base.frontier.zones[zoneId],
          ...(rawFrontier.zones?.[zoneId] || {}),
          sites: [...(rawFrontier.zones?.[zoneId]?.sites || base.frontier.zones[zoneId].sites)],
          stolenCargo: { ...base.frontier.zones[zoneId].stolenCargo, ...(rawFrontier.zones?.[zoneId]?.stolenCargo || {}) }
        }
      ])),
      squads: base.frontier.squads.map((squad) => ({
        ...squad,
        ...(rawFrontier.squads?.find?.((entry) => entry.id === squad.id) || {})
      })),
      factions: Object.fromEntries(Object.keys(base.frontier.factions).map((factionId) => [
        factionId,
        { ...base.frontier.factions[factionId], ...(rawFrontier.factions?.[factionId] || {}) }
      ])),
      eventLog: [...(rawFrontier.eventLog || base.frontier.eventLog)]
    },
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
  if (previousVersion < 5 && state.expedition) {
    state.expedition = null;
    state.player.hp = state.player.maxHp;
    state.player.guard = 0;
    state.player.evasion = 0;
    state.log.unshift({ text: "실시간 부대 원정 개편으로 진행 중이던 구형 원정은 영지에서 안전하게 종료되었다.", tone: "item" });
  }
  if (previousVersion < 6) {
    const legacyRecords = rawState.adventure?.records || {};
    state.adventure = {
      ...base.adventure,
      records: {
        ...base.adventure.records,
        north: { ...base.adventure.records.north, ...(legacyRecords.snowfield || {}) },
        central: { ...base.adventure.records.central, ...(legacyRecords.desert || {}) }
      }
    };
    state.estateDefense = { ...base.estateDefense };
    state.log.unshift({ text: "다섯 지역과 5인 부대 체계가 열렸다. 진행 중이던 구형 원정은 내 영지에서 안전하게 종료되었다.", tone: "item" });
  }
  if (previousVersion < 7) {
    state.adventure.commander = { ...base.adventure.commander, ...(rawState.adventure?.commander || {}) };
    state.adventure.run = null;
    state.estateDefense.battle = null;
    state.estateDefense.result = null;
    state.log.unshift({ text: "직접 조작 개척자가 원정대에 합류했다. 진행 중이던 전투는 내 영지에서 안전하게 종료되었다.", tone: "item" });
  }
  if (previousVersion < 8) {
    state.frontier = createInitialFrontierState();
    state.frontier.squads[0].memberIds = [...state.adventure.party];
    state.log.unshift({ text: "세부 개척 지도와 원정대·개발·물류 체계가 열렸다.", tone: "item" });
  }
  if (previousVersion < 9) {
    state.estateDefense.battle = null;
    state.estateDefense.result = null;
    state.estateDefense.campaign = null;
    state.estateDefense.deployments = createDefenseDeployments();
    state.log.unshift({ text: "동·서·남·북 성문과 내부 잔당 소탕을 포함한 다단계 수성전 체계가 열렸다.", tone: "item" });
  }
  if (previousVersion < 10) {
    state.log.unshift({ text: "창고 물품을 장비·광석·특수·기타로 분류하고 지역별 금속 광맥을 등록했다.", tone: "item" });
  }
  if (previousVersion < 11) {
    state.log.unshift({ text: "영지 작업자는 실제 생산 시간에 따라 초심자에서 장인까지 숙련된다.", tone: "item" });
  }
  if (previousVersion < 12) {
    const areaByRegion = Object.values(LIVING_AREA_DEFS).reduce((result, definition) => {
      result[definition.regionId] = definition;
      return result;
    }, {});
    const workersByLivingArea = {};
    for (const [zoneId, zone] of Object.entries(state.frontier.zones)) {
      const livingArea = areaByRegion[FRONTIER_ZONE_DEFS[zoneId]?.regionId];
      if (!livingArea) continue;
      for (const site of zone.sites) {
        if (site.status !== "developed") continue;
        site.livingAreaId ||= livingArea.id;
        workersByLivingArea[livingArea.id] = (workersByLivingArea[livingArea.id] || 0) + (site.workers || 0);
      }
    }
    const legacyPopulation = Math.max(rawFrontier.population?.total || 12, Object.values(workersByLivingArea).reduce((sum, value) => sum + value, 0));
    let remoteResidents = 0;
    for (const definition of Object.values(LIVING_AREA_DEFS).filter((entry) => entry.kind !== "estate")) {
      const requiredResidents = workersByLivingArea[definition.id] || 0;
      if (!requiredResidents) continue;
      const livingArea = state.frontier.livingAreas[definition.id];
      livingArea.status = "inhabited";
      livingArea.residents = requiredResidents;
      livingArea.safety = Math.max(livingArea.safety, 48);
      livingArea.foundedAtCycle ??= state.frontier.cycle;
      livingArea.lastEvent = "기존 작업자의 생활권으로 등록됐다.";
      remoteResidents += requiredResidents;
    }
    state.frontier.livingAreas.home_estate.residents = Math.max(workersByLivingArea.home_estate || 0, legacyPopulation - remoteResidents);
    state.frontier.population.total = Object.values(state.frontier.livingAreas).reduce((sum, area) => sum + (area.residents || 0), 0);
    state.log.unshift({ text: "점령지·작업지·생활권이 분리됐다. 주민은 생활권에서 거주하며 작업지로 파견된다.", tone: "item" });
  }
  if (previousVersion < 13) {
    for (const livingArea of Object.values(state.frontier.livingAreas)) {
      if (livingArea.status === "inhabited") livingArea.discovered = true;
    }
    state.log.unshift({ text: "비점령지 불규칙 습격과 부락 진입, 점령지 토벌 기한·방치 불이익이 적용됐다.", tone: "item" });
  }
  if (previousVersion < 14) {
    const preferred = ["snow_guard", "oath_knight"];
    state.adventure.party = preferred.filter((unitId) => state.adventure.roster.includes(unitId)).slice(0, 2);
    if (!state.adventure.party.length) state.adventure.party = state.adventure.roster.slice(0, 2);
    state.adventure.commander = {
      ...createDefaultCommander(),
      ...state.adventure.commander,
      combatKitId: PLAYER_KIT_DEFS[state.adventure.commander?.combatKitId]
        ? state.adventure.commander.combatKitId
        : "spiritCrusader",
      skillLoadouts: {
        ...createDefaultCommander().skillLoadouts,
        ...(state.adventure.commander?.skillLoadouts || {})
      }
    };
    state.adventure.run = null;
    state.estateDefense.battle = null;
    state.estateDefense.result = null;
    state.estateDefense.campaign = null;
    state.log.unshift({ text: "동행 부대가 2명으로 정비되고 정령 크루세이더·중병기 네크로맨서 전승 훈련이 열렸다.", tone: "item" });
  }
  if (previousVersion < 15) {
    const activeBattles = [state.adventure.run?.battle, state.estateDefense.battle].filter(Boolean);
    for (const battle of activeBattles) {
      const kit = playerKitDefinition(battle.playerKitId || state.adventure.commander.combatKitId);
      const baseClass = playerBaseClassDefinition(kit.baseClassId);
      battle.playerBaseClassId = baseClass.id;
      battle.playerBasePassive = { ...baseClass.passive };
      battle.basePassiveState = { hitCount: 0, soulStacks: 0, soulExpiresAt: 0, harvestedEnemyIds: [], ...(battle.basePassiveState || {}) };
      const player = battle.units?.find((unit) => unit.id === battle.playerId);
      if (player) {
        player.baseClassId = baseClass.id;
        player.basePassiveId = baseClass.passive.id;
      }
    }
    state.log.unshift({ text: "기본 직업 고유 패시브가 전승 패시브와 별도로 활성화됐다.", tone: "item" });
  }
  if (previousVersion < 16) {
    const activeBattles = [state.adventure.run?.battle, state.estateDefense.battle].filter(Boolean);
    for (const battle of activeBattles) {
      const kit = playerKitDefinition(battle.playerKitId || state.adventure.commander.combatKitId);
      const baseClass = playerBaseClassDefinition(kit.baseClassId);
      battle.playerBaseClassId = baseClass.id;
      battle.playerBasePassive = { ...baseClass.passive };
      const previousPassiveState = battle.basePassiveState || {};
      battle.basePassiveState = {
        hitCount: 0,
        soulStacks: 0,
        soulExpiresAt: 0,
        harvestedEnemyIds: [],
        ...previousPassiveState
      };
      if (battle.basePassiveState.soulStacks > 0 && !battle.basePassiveState.soulExpiresAt) {
        battle.basePassiveState.soulExpiresAt = (battle.elapsed || 0) + (baseClass.passive.durationMs || 12000);
      }
    }
    state.log.unshift({ text: "크루세이더 피격 회복과 네크로맨서 영혼 유지시간 규칙이 적용됐다.", tone: "item" });
  }
  if (previousVersion < 17) {
    state.adventure.commander = {
      ...createDefaultCommander(),
      ...state.adventure.commander,
      storedBoss: state.adventure.commander?.storedBoss || null,
      itemBonuses: { ...(state.adventure.commander?.itemBonuses || {}) },
      skillLoadouts: {
        ...createDefaultCommander().skillLoadouts,
        ...(state.adventure.commander?.skillLoadouts || {})
      }
    };
    for (const kit of Object.values(PLAYER_KIT_DEFS)) {
      state.adventure.commander.skillLoadouts[kit.id] = normalizedPlayerLoadout(state.adventure.commander, kit.id);
    }
    const activeBattles = [state.adventure.run?.battle, state.estateDefense.battle].filter(Boolean);
    for (const battle of activeBattles) {
      const kit = playerKitDefinition(battle.playerKitId || state.adventure.commander.combatKitId);
      battle.playerSkillIds = normalizedPlayerLoadout(state.adventure.commander, kit.id);
      battle.groundEffects ||= [];
      battle.consumedCorpseIds ||= [];
      battle.storedBoss ||= state.adventure.commander.storedBoss ? { ...state.adventure.commander.storedBoss } : null;
      for (const actor of [...(battle.units || []), ...(battle.enemies || [])]) {
        actor.baseMaxHp ||= actor.maxHp;
        actor.baseDamage ||= actor.damage;
        actor.statuses ||= {};
        actor.positiveEffects ||= {};
        actor.regenRemainder ||= 0;
        actor.attackCount ||= 0;
        actor.statusEvery ||= 1;
      }
      const player = battle.units?.find((unit) => unit.id === battle.playerId);
      if (player) Object.assign(player, playerCombatStats(state.adventure.commander, kit.id));
    }
    state.log.unshift({ text: "신성·자연 친화도와 크루세이더 해제, 6종 상태이상, 지역별 고블린·오크·늑대·곰 변종이 적용됐다.", tone: "item" });
  }
  if (previousVersion < 18) {
    state.log.unshift({ text: "분대 병력·영지 행복도·행상인·지역 부락 친목도 체계가 열렸다.", tone: "item" });
  }
  if (previousVersion < 20) {
    // 무기 전용이던 구조를 슬롯 기반 장비(무기/방어구/장신구)로 일반화했다.
    // v19 저장에 남아 있는 무기 필드를 새 필드로 옮긴다.
    const commander = state.adventure.commander;
    commander.unlockedBlueprints = [...new Set([
      ...(commander.unlockedBlueprints || []),
      ...(commander.unlockedWeaponBlueprints || [])
    ])];
    commander.equipmentOwned = [...new Set([
      ...(commander.equipmentOwned || []),
      ...(commander.weaponsOwned || [])
    ])];
    commander.equipped = {
      weapon: commander.equipped?.weapon ?? commander.equippedWeaponId ?? null,
      armor: commander.equipped?.armor ?? null,
      accessory: commander.equipped?.accessory ?? null
    };
    delete commander.unlockedWeaponBlueprints;
    delete commander.weaponsOwned;
    delete commander.equippedWeaponId;
    state.log.unshift({ text: "장비가 무기·방어구·장신구 세 칸으로 나뉘었다.", tone: "item" });
  }
  if (previousVersion < 21) {
    // 방어구/장신구 한 칸씩이던 걸 부위별 슬롯(투구·갑옷·장갑·신발·망토 / 반지·부적)으로
    // 쪼갰다. 기존에 끼고 있던 장비는 그 아이템의 새 슬롯으로 그대로 옮겨준다.
    const commander = state.adventure.commander;
    const previous = commander.equipped || {};
    const equipped = createEmptyEquipped();
    for (const equipmentId of Object.values(previous)) {
      const definition = EQUIPMENT_DEFS[equipmentId];
      // 정의가 사라진 아이템(이름이 바뀐 경우 등)은 조용히 해제한다.
      if (definition && equipped[definition.slot] === null) equipped[definition.slot] = equipmentId;
    }
    commander.equipped = equipped;
    state.log.unshift({ text: "방어구가 투구·갑옷·장갑·신발·망토로, 장신구가 반지·부적으로 나뉘었다.", tone: "item" });
  }
  if (previousVersion < 22) {
    // 장비에 등급과 랜덤 옵션이 붙으면서, 보유 목록이 "설계도 id 배열"에서
    // "인스턴스 배열"로 바뀌었다. 같은 설계도로 만든 장비도 굴림이 제각각이라
    // id만으로는 어느 물건인지 특정할 수 없기 때문이다.
    const commander = state.adventure.commander;
    const previousOwned = commander.equipmentOwned || [];
    const previousEquipped = commander.equipped || {};
    const uidByDefId = new Map();

    commander.equipmentOwned = previousOwned
      .map((entry) => {
        // 이미 인스턴스면 그대로 둔다(중복 실행 안전).
        if (entry && typeof entry === "object") return entry;
        if (!EQUIPMENT_DEFS[entry]) return null;
        const uid = `eq${uidByDefId.size + 1}`;
        uidByDefId.set(entry, uid);
        // 기존 장비는 등급 체계가 생기기 전에 만든 것이라 일반 등급 · 옵션 없음으로
        // 둔다. 마이그레이션에서 굴림을 돌리면 저장을 열 때마다 결과가 흔들린다.
        return createEquipmentInstance(uid, entry, "common", []);
      })
      .filter(Boolean);
    commander.nextEquipmentUid = commander.equipmentOwned.length;

    const equipped = createEmptyEquipped();
    for (const [slot, value] of Object.entries(previousEquipped)) {
      if (!(slot in equipped) || !value) continue;
      // 이미 uid로 옮겨진 저장이면 그대로 둔다(중복 실행 안전).
      if (findEquipmentInstance(commander, value)) { equipped[slot] = value; continue; }
      // v21까지는 정의 id가 들어 있었다 — 대응하는 인스턴스의 uid로 바꾼다.
      if (uidByDefId.has(value)) { equipped[slot] = uidByDefId.get(value); continue; }
      // 끼고 있는데 보유 목록에 없는 경우(구버전 저장에서 종종 어긋나 있다).
      // 그냥 버리면 장비가 조용히 사라지므로 인스턴스를 만들어 살려준다.
      if (EQUIPMENT_DEFS[value]) {
        commander.nextEquipmentUid += 1;
        const uid = `eq${commander.nextEquipmentUid}`;
        commander.equipmentOwned.push(createEquipmentInstance(uid, value, "common", []));
        uidByDefId.set(value, uid);
        equipped[slot] = uid;
      }
    }
    commander.equipped = equipped;
    state.log.unshift({ text: "장비에 등급(일반~신화)과 랜덤 옵션이 붙는다. 대장장이 숙련도가 품질을 좌우한다.", tone: "item" });
  }
  if (previousVersion < 23) {
    // 장신구를 반지 1 + 부적 1에서 반지 2 + 목걸이 1로 바꿨다
    // (docs/EQUIPMENT_DESIGN.md §11 — 반지 두 개를 조합해 빌드를 만드는 방향).
    const commander = state.adventure.commander;
    const previous = commander.equipped || {};
    const equipped = createEmptyEquipped();
    for (const [slot, uid] of Object.entries(previous)) {
      if (!uid) continue;
      // ring → ring1, amulet → necklace. 나머지 부위는 이름이 그대로다.
      const moved = slot === "ring" ? "ring1" : slot === "amulet" ? "necklace" : slot;
      if (moved in equipped) equipped[moved] = uid;
    }
    commander.equipped = equipped;
    state.log.unshift({ text: "장신구가 반지 두 칸과 목걸이로 나뉘었다.", tone: "item" });
  }
  if (previousVersion < 27) {
    // 지역 패널티를 장비 밖에서도 막을 수 있게 됐다 — 대응 소모품과 핵 흡수.
    state.meta.regionTonics ||= {};
    state.meta.absorbedCores ||= [];
    state.log.unshift({ text: "지역 약재로 대응 약을 조제하고, 지역 핵을 몸에 새길 수 있게 됐다.", tone: "item" });
  }
  if (previousVersion < 25) {
    // 영지 명성·외교 우호도, 기억 던전에 남는 보스 목록이 생겼다.
    state.meta.renown ||= 0;
    state.meta.favor ||= {};
    state.meta.favorClaimed ||= {};
    state.meta.rememberedBosses ||= [];
    state.log.unshift({ text: "영지에 명성이 쌓이기 시작했다. 겪은 보스는 기억에 남아 다시 세울 수 있다.", tone: "item" });
  }
  if (previousVersion < 24) {
    // 동료도 장비를 낄 수 있게 되면서 동료별 장착표가 생겼다.
    // 보관함(equipmentOwned)은 지휘관과 공유하므로 옮길 데이터는 없다.
    state.adventure.commander.companionEquipped ||= {};
    state.log.unshift({ text: "쓰던 장비를 동료에게 물려줄 수 있게 됐다. 보스에게는 그로기가 생겼다.", tone: "item" });
  }
  state.adventure.party = state.adventure.party.slice(0, 2);
  state.adventure.commander.combatKitId = playerKitDefinition(state.adventure.commander.combatKitId).id;
  state.adventure.commander.skillLoadouts = {
    ...createDefaultCommander().skillLoadouts,
    ...(state.adventure.commander.skillLoadouts || {})
  };
  state.frontier.squads[0].memberIds = [...state.adventure.party];
  delete state.adventure.hero;
  const convertedBlueprints = (state.meta.research || []).filter((id) => ITEM_DEFS[id]);
  state.meta.blueprints = [...new Set(["frontierMantle", ...(rawMeta.blueprints || []), ...convertedBlueprints])];
  if (!AREA_DEFS[state.meta.selectedAreaId]) state.meta.selectedAreaId = "estate";
  if (!CLASS_DEFS[state.meta.classId]) state.meta.classId = "knight";
  if (!TRAIT_DEFS[state.meta.traitId]) state.meta.traitId = "duneBorn";
  if (state.expedition) {
    if (!AREA_DEFS[state.expedition.areaId]) state.expedition.areaId = "desert";
    state.expedition.floor.areaId = state.expedition.areaId;
    state.expedition.beaconGoal = AREA_DEFS[state.expedition.areaId].beaconGoal;
    state.expedition.pressure = { heat: 0, toxin: 0, cold: 0, corruption: 0, ...(state.expedition.pressure || {}) };
    state.expedition.cargo = {
      materials: { ...(state.expedition.cargo?.materials || {}) },
      blueprints: [...(state.expedition.cargo?.blueprints || [])]
    };
  }
  if (state.adventure.run) {
    const run = state.adventure.run;
    run.pendingSettlement ||= null;
    run.settlementVisit ||= null;
    run.dungeonEntered ||= Boolean(run.dungeon);
    run.fieldSteps ||= 0;
    run.irregularAmbushes ||= 0;
    run.ambushInterval ||= [7, 12];
    run.nextAmbushStep ||= run.fieldSteps + run.ambushInterval[0];
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
