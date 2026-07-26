import test from "node:test";
import assert from "node:assert/strict";

import {
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
  synergyItemUids
} from "../src/core.js";
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
  const crafted = engine.craftRecipe("frontierMantle", () => 0);
  assert.ok(crafted);
  assert.equal(crafted.defId, "frontierMantle");
  assert.equal(crafted.quality, 45);
  assert.equal(crafted.affixes.length, 1);
});

test("v2 저장은 직업·영지·설계도 기본값을 안전하게 보강한다", () => {
  const legacy = createInitialState();
  legacy.version = 2;
  delete legacy.meta.classId;
  delete legacy.meta.estate;
  delete legacy.meta.materials;
  delete legacy.meta.blueprints;
  const migrated = migrateState(legacy);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.meta.classId, "knight");
  assert.equal(migrated.meta.estate.workers.steward, 1);
  assert.equal(migrated.meta.blueprints.includes("frontierMantle"), true);
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

test("세 측량탑과 감시자 처치 보상은 공방에 영구 반영된다", () => {
  const storage = new MemoryStorage();
  const engine = new GameEngine(storage);
  engine.startExpedition(777);
  const floor = engine.state.expedition.floor;
  floor.enemies = floor.enemies.filter((enemy) => enemy.defId === "warden");
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
  assert.equal(engine.state.meta.materials.watcherEye, 1);
  assert.equal(engine.state.meta.blueprints.includes("wardenLens"), true);
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
  assert.match(migrated.state.log[0].text, /광역 지도 개편/);
});
