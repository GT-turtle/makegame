import test from "node:test";
import assert from "node:assert/strict";

import {
  SAVE_VERSION,
  advanceEstate,
  adjacentItemUids,
  bagFingerprint,
  canPlaceItem,
  createFloor,
  createInitialState,
  createItem,
  environmentMitigation,
  findPath,
  floorIsConnected,
  itemCells,
  keyOf,
  masteryLevel,
  migrateState,
  placeItem,
  resolveBagTrigger,
  rotateMask,
  synergyItemUids,
  workerProficiency
} from "../src/core.js";
import { ITEM_DEFS, MATERIAL_DEFS } from "../src/data.js";
import { GameEngine, SAVE_KEY } from "../src/game.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test("L자 아이템 회전은 점유 칸을 정확히 바꾼다", () => {
  const mask = [[1, 1], [0, 1]];
  assert.deepEqual(rotateMask(mask, 1), [[0, 1], [1, 1]]);
  const coil = createItem("coil", "coil", 1, 1, 1);
  assert.deepEqual(itemCells(coil), [
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 }
  ]);
});

test("가방은 겹치는 배치와 경계 밖 배치를 거부한다", () => {
  const blade = createItem("blade", "blade", 0, 0, 0);
  const boots = createItem("boots", "boots");
  const inventory = [blade, boots];
  assert.equal(canPlaceItem(inventory, boots, 0, 0, 0, 4), false);
  assert.equal(canPlaceItem(inventory, boots, 4, 3, 0, 4), false);
  assert.equal(placeItem(inventory, "boots", 2, 0, 0, 4), true);
  assert.equal(bagFingerprint(inventory).includes("boots:2:0:0"), true);
});

test("인접한 검과 숫돌은 하나의 공격 연쇄를 만든다", () => {
  const state = createInitialState();
  const links = adjacentItemUids(state.inventory, "item-2");
  assert.equal(links.includes("item-1"), true);
  const result = resolveBagTrigger(state, "attack", { damage: 1 });
  assert.equal(result.damage, 5);
  assert.equal(result.triggered.includes("item-1"), true);
  assert.equal(result.triggered.includes("item-2"), true);
  assert.deepEqual(synergyItemUids(state.inventory, "item-2"), ["item-1"]);
});

test("생성되는 대형 필드는 시작점·측량탑·심장이 모두 연결된다", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const world = createFloor(seed * 919);
    assert.equal(world.tiles.length, 31);
    assert.equal(world.tiles[0].length, 31);
    assert.equal(world.beacons.length, 3);
    assert.equal(floorIsConnected(world), true, `seed ${seed}`);
  }
});

test("터치 이동 경로는 벽·적·미확인 칸을 우회한다", () => {
  const tiles = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => (
    x === 0 || y === 0 || x === 4 || y === 4 ? "wall" : "floor"
  )));
  const start = { x: 1, y: 1 };
  const target = { x: 3, y: 1 };
  const detour = findPath(tiles, start, target, new Set([keyOf(2, 1)]));
  assert.equal(detour.length, 5);
  assert.equal(detour.some((point) => point.x === 2 && point.y === 1), false);

  const knownCorridor = new Set([keyOf(1, 1), keyOf(2, 1), keyOf(3, 1)]);
  assert.equal(findPath(tiles, start, target, new Set(), knownCorridor).length, 3);
  assert.deepEqual(findPath(tiles, start, target, new Set(), new Set([keyOf(1, 1), keyOf(3, 1)])), []);
});

test("연구와 가방 확장은 저장 후에도 유지된다", () => {
  const storage = new MemoryStorage();
  const first = new GameEngine(storage);
  first.state.meta.scrap = 30;
  assert.equal(first.purchaseResearch("venom"), true);
  assert.equal(first.purchaseResearch("bag_row"), true);
  assert.equal(first.state.meta.bagRows, 5);
  assert.ok(storage.getItem(SAVE_KEY));

  const restored = new GameEngine(storage);
  assert.equal(restored.state.meta.research.includes("venom"), true);
  assert.equal(restored.state.meta.bagRows, 5);
  assert.equal(restored.state.meta.blueprints.includes("venom"), true);
  assert.equal(restored.state.inventory.some((item) => item.defId === "venom"), false);
});

test("직업과 출신을 조합하고 고유 기술 숙련도를 올린다", () => {
  const engine = new GameEngine(new MemoryStorage());
  assert.equal(engine.selectClass("martial"), true);
  assert.equal(engine.selectTrait("disciplined"), true);
  engine.startExpedition(8128);
  engine.state.player.hp = 10;
  engine.state.expedition.pressure.toxin = 8;
  engine.state.player.classResource = 4;
  assert.equal(engine.useClassSkill(), true);
  assert.ok(engine.state.player.hp > 10);
  assert.ok(engine.state.expedition.pressure.toxin < 8);
  assert.ok(engine.state.meta.skillMastery.meridianFlow >= 1.25);
  assert.equal(masteryLevel(engine.state.meta.skillMastery.meridianFlow), 1);
});

test("직업·출신·가방 장비의 환경 대응이 모두 합산된다", () => {
  const state = createInitialState();
  state.meta.classId = "knight";
  state.meta.traitId = "winterBlood";
  state.inventory.push(createItem("frontierMantle", "mantle", 0, 2, 0));
  assert.equal(environmentMitigation(state, "cold"), 3);
  assert.equal(environmentMitigation(state, "corruption"), 1);
});

test("영지 일꾼은 원정 턴에 생산하고 대장간은 설계도로 변동 장비를 만든다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 10;
  assert.equal(engine.hireWorker("lumberjack"), true);
  const beforeWood = engine.state.meta.materials.wood;
  advanceEstate(engine.state, 3);
  assert.equal(engine.state.meta.materials.wood, beforeWood + 1);
  const beforeSmithHours = engine.state.meta.estate.workerProgress.blacksmith.workHours;
  const crafted = engine.craftRecipe("frontierMantle", () => 0);
  assert.ok(crafted);
  assert.equal(crafted.defId, "frontierMantle");
  assert.equal(crafted.quality, 45);
  assert.equal(crafted.affixes.length, 1);
  assert.equal(engine.state.meta.estate.workerProgress.blacksmith.workHours, beforeSmithHours + 4);
});

test("생산 동료는 일꾼 없이도 해당 직종을 채우고, 명장 대장장이는 전용 설계도와 품질 보너스를 준다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 40;

  // 벌목꾼을 고용하지 않아도 동료가 그 자리를 채운다.
  assert.equal(engine.state.meta.estate.workers.lumberjack, 0);
  assert.equal(engine.recruitProductionCompanion("veteranWoodcutter"), true);
  const beforeWood = engine.state.meta.materials.wood;
  advanceEstate(engine.state, 3);
  assert.ok(engine.state.meta.materials.wood > beforeWood);

  // 대장장이 없이는 전용 설계도가 제작 목록에 없고, 제작도 거부된다.
  assert.equal(engine.state.meta.blueprints.includes("masterworkBlade"), false);
  engine.state.meta.materials.ingot = 10;
  engine.state.meta.materials.blackSteel = 5;
  assert.equal(engine.craftRecipe("masterworkBlade", () => 0), false);

  // 명장 대장장이를 영입하면 전용 설계도가 즉시 해금되고 제작 시 품질·부가옵션이 강화된다.
  assert.equal(engine.recruitProductionCompanion("masterSmith"), true);
  assert.equal(engine.state.meta.blueprints.includes("masterworkBlade"), true);
  const sequence = [0, 0, 0, 0.5];
  let call = 0;
  const queuedRandom = () => sequence[Math.min(call++, sequence.length - 1)];
  const crafted = engine.craftRecipe("masterworkBlade", queuedRandom);
  assert.ok(crafted);
  assert.equal(crafted.quality, 55);
  assert.equal(crafted.affixes.length, 2);

  // 같은 동료를 중복 영입할 수 없다.
  assert.equal(engine.recruitProductionCompanion("masterSmith"), false);
});

test("제련공은 대장장이 대신 철괴를 만들고, 약초학자는 약초로 야전 약초함을 만든다", () => {
  const engine = new GameEngine(new MemoryStorage());
  // 기본 상태에서도 제련공 1명이 배정돼 있어 광석·목재가 있으면 철괴가 자동 생산된다.
  const beforeIngot = engine.state.meta.materials.ingot;
  const beforeBlacksmithHours = engine.state.meta.estate.workerProgress.blacksmith.workHours;
  advanceEstate(engine.state, 5);
  assert.ok(engine.state.meta.materials.ingot > beforeIngot);
  assert.ok(engine.state.meta.estate.workerProgress.refiner.workHours > 0);
  assert.equal(engine.state.meta.estate.workerProgress.blacksmith.workHours, beforeBlacksmithHours);

  engine.state.meta.scrap = 20;
  engine.state.meta.materials.herb = 10;
  assert.equal(engine.hireWorker("herbalist"), true);
  const beforeHerbKits = engine.state.inventory.filter((item) => item.defId === "herbKit").length;
  advanceEstate(engine.state, 4);
  const afterHerbKits = engine.state.inventory.filter((item) => item.defId === "herbKit").length;
  assert.ok(afterHerbKits > beforeHerbKits);
  assert.ok(engine.state.meta.materials.herb < 10);
});

test("제련공은 지역 원광도 정제 원소로 만들고, 복합 광석은 여러 원소를 동시에 낸다", () => {
  const single = createInitialState();
  single.meta.estate.workers.refiner = 1;
  single.meta.materials.bauxite = 10;
  single.meta.materials.wood = 10;
  const beforeAluminum = single.meta.materials.aluminum;
  advanceEstate(single, 5);
  assert.ok(single.meta.materials.aluminum > beforeAluminum);

  const compound = createInitialState();
  compound.meta.estate.workers.refiner = 1;
  compound.meta.materials.stannite = 40;
  compound.meta.materials.wood = 40;
  advanceEstate(compound, 15); // stannite yields copper/ingot at 0.5x per batch, so needs 2+ cycles to round up
  assert.ok(compound.meta.materials.tin > 0);
  assert.ok(compound.meta.materials.copper > 0);
  assert.ok(compound.meta.materials.ingot > 2); // 초기값 2에서 추가로 늘어나야 함
});

test("연금술사는 연금 계열 설계도에만 품질·부가옵션 보너스를 준다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 40;
  engine.state.meta.blueprints.push("venom", "knightAegis");
  engine.state.meta.materials.wood = 5;
  engine.state.meta.materials.sporeGland = 5;
  engine.state.meta.materials.ingot = 10;
  engine.state.meta.materials.blackSteel = 5;
  assert.equal(engine.recruitProductionCompanion("alchemist"), true);

  const sequence = [0, 0, 0, 0.5];
  let call = 0;
  const queuedRandom = () => sequence[Math.min(call++, sequence.length - 1)];
  const potion = engine.craftRecipe("venom", queuedRandom); // tags: ["alchemy"]
  assert.ok(potion);
  assert.equal(potion.quality, 55);
  assert.equal(potion.affixes.length, 2);

  call = 0;
  const shield = engine.craftRecipe("knightAegis", queuedRandom); // tags: ["defense", "rune"], not alchemy
  assert.ok(shield);
  assert.equal(shield.quality, 45);
  assert.equal(shield.affixes.length, 1);
});

test("룬은 고철로 획득하고 한 번에 하나만 장착할 수 있다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 15;
  const commander = engine.state.adventure.commander;

  assert.equal(engine.equipRune("greenRune"), false); // 아직 미보유
  assert.equal(engine.purchaseRune("greenRune"), true);
  assert.equal(engine.state.meta.scrap, 5);
  assert.equal(commander.runesOwned.includes("greenRune"), true);
  assert.equal(engine.purchaseRune("greenRune"), false); // 중복 획득 불가

  assert.equal(engine.equipRune("greenRune"), true);
  assert.equal(commander.equippedRuneId, "greenRune");

  // 소지금이 부족해도 이미 보유한 룬은 다시 장착/해제할 수 있다.
  engine.state.meta.scrap = 0;
  assert.equal(engine.equipRune(null), true);
  assert.equal(commander.equippedRuneId, null);
});

test("작업자는 실제로 생산한 시간만 쌓아 초심자에서 장인까지 숙련된다", () => {
  const state = createInitialState();
  state.meta.estate.workers.lumberjack = 1;
  state.meta.materials.ore = 0;
  state.meta.materials.wood = 0;
  advanceEstate(state, 20);
  assert.equal(workerProficiency(state, "lumberjack").name, "숙련자");
  assert.equal(workerProficiency(state, "lumberjack").workHours, 20);
  assert.equal(workerProficiency(state, "blacksmith").workHours, 0);
  advanceEstate(state, 130);
  assert.equal(workerProficiency(state, "lumberjack").name, "장인");
  assert.ok(state.meta.materials.wood > 50);
});

test("v2 저장은 직업·영지·설계도 기본값을 안전하게 보강한다", () => {
  const legacy = createInitialState();
  legacy.version = 2;
  delete legacy.meta.classId;
  delete legacy.meta.estate;
  delete legacy.meta.materials;
  delete legacy.meta.blueprints;
  const migrated = migrateState(legacy);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.meta.classId, "knight");
  assert.equal(migrated.meta.estate.workers.steward, 1);
  assert.equal(migrated.meta.blueprints.includes("frontierMantle"), true);
  assert.equal(migrated.meta.selectedAreaId, "estate");
  assert.equal(migrated.meta.materials.malachite, 0);
  assert.equal(migrated.meta.materials.runeFragment, 0);
  assert.equal(migrated.meta.estate.workerProgress.blacksmith.workHours, 0);
});

test("모든 물품은 장비·광석·특수·기타 중 하나로 분류된다", () => {
  assert.equal(Object.values(ITEM_DEFS).every((item) => item.category === "equipment"), true);
  assert.equal(Object.values(MATERIAL_DEFS).every((material) => ["ore", "special", "other"].includes(material.category)), true);
  assert.deepEqual(["malachite", "ore", "bauxite", "cassiterite", "rutile", "sphalerite"].map((id) => MATERIAL_DEFS[id].symbol), ["Cu", "Fe", "Al", "Sn", "Ti", "Zn"]);
});

test("내 영지·사막·설산은 같은 탐험 규약으로 서로 다른 지도를 만든다", () => {
  const estate = new GameEngine(new MemoryStorage());
  estate.startExpedition("estate", 101);
  assert.equal(estate.state.expedition.areaId, "estate");
  assert.equal(estate.state.expedition.beaconGoal, 0);
  assert.equal(estate.state.expedition.floor.enemies.length, 0);
  assert.equal(estate.getEnvironmentStatus().pressure, null);
  const nodeEntry = Object.entries(estate.state.expedition.floor.features).find(([, feature]) => feature.type === "estateNode" && feature.materialId === "wood");
  const beforeWood = estate.state.meta.materials.wood;
  const [x, y] = nodeEntry[0].split(",").map(Number);
  estate.resolveFeature(x, y);
  assert.equal(estate.state.meta.materials.wood, beforeWood + 1);

  const snow = new GameEngine(new MemoryStorage());
  snow.startExpedition("snowfield", 202);
  assert.equal(snow.state.expedition.areaId, "snowfield");
  assert.equal(snow.getEnvironmentStatus().pressure.id, "cold");
  assert.equal(snow.state.expedition.floor.enemies.some((enemy) => enemy.defId === "frostColossus"), true);
});

test("적은 인접 첫 턴에 예고하고 다음 턴에 공격한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.startExpedition(1234);
  const floor = engine.state.expedition.floor;
  floor.tiles = Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => (
    x === 0 || y === 0 || x === 8 || y === 8 ? "wall" : "floor"
  )));
  engine.state.player.x = 3;
  engine.state.player.y = 3;
  floor.enemies = [{
    id: "test-enemy",
    defId: "gnawer",
    x: 4,
    y: 3,
    hp: 5,
    maxHp: 5,
    intent: "pursue",
    poison: 0,
    burn: 0
  }];
  const before = engine.state.player.hp;
  engine.wait();
  assert.equal(engine.state.player.hp, before);
  assert.equal(floor.enemies[0].intent, "strike");
  engine.wait();
  assert.ok(engine.state.player.hp <= before);
  assert.equal(floor.enemies[0].intent, "recover");
});

test("플레이어가 먼저 공격해도 추격 중인 적은 즉시 반격하지 않는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.startExpedition(4321);
  const floor = engine.state.expedition.floor;
  floor.tiles = Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => (
    x === 0 || y === 0 || x === 8 || y === 8 ? "wall" : "floor"
  )));
  engine.state.player.x = 3;
  engine.state.player.y = 3;
  floor.enemies = [{
    id: "test-enemy",
    defId: "raider",
    x: 4,
    y: 3,
    hp: 12,
    maxHp: 12,
    intent: "pursue",
    poison: 0,
    burn: 0
  }];
  const before = engine.state.player.hp;
  engine.playerAct(1, 0);
  assert.equal(engine.state.player.hp, before);
  assert.equal(floor.enemies[0].intent, "strike");
});

test("사막 측량 거점과 보스 처치 보상은 공방에 영구 반영된다", () => {
  const storage = new MemoryStorage();
  const engine = new GameEngine(storage);
  engine.startExpedition("desert", 777);
  const floor = engine.state.expedition.floor;
  floor.enemies = floor.enemies.filter((enemy) => enemy.id === "enemy-boss");
  for (const beacon of floor.beacons) engine.resolveFeature(beacon.x, beacon.y);
  assert.equal(engine.state.expedition.beaconsActivated, 3);

  const boss = floor.enemies[0];
  boss.hp = 1;
  const approach = [
    { x: boss.x - 1, y: boss.y },
    { x: boss.x + 1, y: boss.y },
    { x: boss.x, y: boss.y - 1 },
    { x: boss.x, y: boss.y + 1 }
  ].find((point) => floor.tiles[point.y][point.x] === "floor");
  engine.state.player.x = approach.x;
  engine.state.player.y = approach.y;
  engine.playerAct(boss.x - approach.x, boss.y - approach.y);
  assert.equal(engine.state.expedition.phase, "victory");
  engine.returnToHub("victory");
  assert.equal(engine.state.meta.bestBeacons, 3);
  assert.equal(engine.state.meta.victories, 1);
  assert.equal(engine.state.meta.essence, 1);
  assert.equal(engine.state.meta.materials.sunShard, 1);
  assert.equal(engine.state.meta.blueprints.includes("mechanicRig"), true);
  assert.equal(engine.state.meta.areaRecords.desert.victories, 1);
  assert.equal(engine.state.inventory.some((item) => item.defId === "scavengerCharm"), true);

  const restored = new GameEngine(storage);
  assert.equal(restored.state.meta.bestBeacons, 3);
  assert.equal(restored.state.meta.victories, 1);
});

test("구형 층제 원정 저장은 영구 성장만 보존하고 안전하게 공방으로 복귀한다", () => {
  const storage = new MemoryStorage();
  const oldState = createInitialState();
  oldState.version = 1;
  oldState.meta.scrap = 19;
  oldState.expedition = { depth: 2, phase: "active", floor: { tiles: [] } };
  storage.setItem(SAVE_KEY, JSON.stringify(oldState));

  const migrated = new GameEngine(storage);
  assert.equal(migrated.state.expedition, null);
  assert.equal(migrated.state.meta.scrap, 19);
  assert.match(migrated.state.log[0].text, /직접 조작|다섯 지역|광역 지도 개편|세부 개척 지도|다단계 수성전|장비·광석·특수·기타|실제 생산 시간|생활권|불규칙 습격|토벌|동행 부대|기본 직업 고유 패시브|피격 회복|신성·자연 친화도|분대 병력/);
});
