import test from "node:test";
import assert from "node:assert/strict";

import { GameEngine } from "../src/game.js";
import { advanceEstate, createInitialState, happinessMultiplier, happinessRecruitCostMultiplier } from "../src/core.js";
import { PLAYER_BASE_CLASS_DEFS } from "../src/classes.js";
import {
  FRONTIER_ZONE_DEFS,
  TROOP_TYPE_DEFS,
  squadTroopTotal,
  troopCapForLeaderLevel,
  villageTradeableMaterials
} from "../src/frontier.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, value); }
}

function unlockWardensWithLeader(engine, leaderId = "winter_berserker", level = 5) {
  const frontier = engine.state.frontier;
  const wardens = frontier.squads.find((squad) => squad.id === "wardens");
  wardens.unlocked = true;
  engine.state.adventure.roster.push(leaderId);
  engine.state.adventure.unitProgress[leaderId] = { level, xp: 0, secondaryId: null };
  assert.equal(engine.assignUnitToFrontierSquad(leaderId, "wardens"), true);
  return wardens;
}

// ==========================
// A. 분대 병력 시스템
// ==========================

test("분대는 대장 레벨에 비례한 상한 안에서 영지 인구·고철로 병력을 직접 모병한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const wardens = unlockWardensWithLeader(engine, "winter_berserker", 3);
  engine.state.meta.scrap = 100;
  const cap = troopCapForLeaderLevel(3);
  assert.equal(cap, 22);

  const beforeResidents = engine.state.frontier.livingAreas.home_estate.residents;
  const beforeScrap = engine.state.meta.scrap;
  assert.equal(engine.recruitTroops("wardens", "infantry", 5), true);
  assert.equal(wardens.troops.infantry, 5);
  assert.equal(engine.state.frontier.livingAreas.home_estate.residents, beforeResidents - 5);
  assert.equal(engine.state.meta.scrap, beforeScrap - 5 * 2);

  // 상한을 넘는 모병은 거부된다 (인구도 충분히 남겨 상한 자체를 검증).
  engine.state.frontier.livingAreas.home_estate.residents = 999;
  assert.equal(squadTroopTotal(wardens), 5);
  assert.equal(engine.recruitTroops("wardens", "cavalry", cap), false);
  assert.equal(engine.recruitTroops("wardens", "cavalry", cap - 5), true);
  assert.equal(squadTroopTotal(wardens), cap);
  assert.equal(engine.recruitTroops("wardens", "archer", 1), false);

  // vanguard(선봉대)는 모병 대상에서 제외된다.
  assert.equal(engine.recruitTroops("vanguard", "infantry", 1), false);
});

test("인구가 부족하면 가장 여유가 적은 다른 생활권에서 병력 모병 인구를 충당한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  const wardens = unlockWardensWithLeader(engine);
  engine.state.meta.scrap = 100;
  engine.state.meta.materials.wood = 20;
  engine.state.meta.materials.food = 20;
  frontier.zones.north_fir.status = "occupied";
  frontier.livingAreas.north_hamlet.discovered = true;
  assert.equal(engine.establishLivingArea("north_hamlet"), true);
  frontier.livingAreas.home_estate.residents = 0;

  const northBefore = frontier.livingAreas.north_hamlet.residents;
  assert.equal(engine.recruitTroops("wardens", "infantry", 2), true);
  assert.equal(frontier.livingAreas.north_hamlet.residents, northBefore - 2);
  assert.equal(wardens.troops.infantry, 2);
});

test("세부 점령지는 주기마다 낮은 확률로 소속(또는 본대) 분대에 병력을 자동 보급한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  const zone = frontier.zones.central_oasis;
  zone.status = "occupied";
  zone.stability = 90;
  zone.routeLevel = 3;
  const site = {
    id: "central_oasis-site-test", typeId: "caravan", quality: 3, status: "developed",
    workers: 0, livingAreaId: "home_estate", escortUnitId: "desert_lancer", delivered: 0, lastEvent: ""
  };
  zone.sites.push(site);
  engine.state.adventure.unitProgress.desert_lancer = { level: 10, xp: 0, secondaryId: null };
  const wardens = frontier.squads.find((squad) => squad.id === "wardens");
  wardens.unlocked = true;
  assert.equal(frontier.homeSquadId, "wardens");

  for (let cycle = 0; cycle < 9; cycle += 1) engine.advanceFrontierCycle();
  assert.equal(squadTroopTotal(wardens), 1);
  assert.equal(wardens.troops.cavalry, 1, "대상단 중계소(caravan)는 기병을 보급한다");
});

test("원정 미션은 성공할 수도 실패할 수도 있으며, 성공 시 대장 전투력과 병력 전투력이 함께 작용한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  frontier.zones.north_fir.status = "occupied";
  const wardens = unlockWardensWithLeader(engine, "winter_berserker", 5);
  wardens.troops.cavalry = 5;

  assert.equal(engine.dispatchFrontierMission("wardens", "north_fir", "suppress"), true);
  assert.equal(engine.advanceFrontierCycle(), true);
  assert.equal(wardens.mission, null);
  assert.equal(frontier.zones.north_fir.threat, 0);
  assert.equal(wardens.troops.cavalry, 5, "성공하면 병력 손실이 없다");
  assert.equal(Object.keys(frontier.woundedUnits).length, 0);
});

test("실패한 미션은 병력을 중상 또는 사망시키고 대장은 중상만 당하며 영구 사망하지 않는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  const zone = frontier.zones.south_canopy;
  zone.status = "occupied";
  zone.threat = 100;
  const rangers = frontier.squads.find((squad) => squad.id === "rangers");
  rangers.unlocked = true;
  engine.state.adventure.roster.push("winter_berserker");
  engine.state.adventure.unitProgress.winter_berserker = { level: 1, xp: 0, secondaryId: null };
  assert.equal(engine.assignUnitToFrontierSquad("winter_berserker", "rangers"), true);
  rangers.troops = { infantry: 1, archer: 1, cavalry: 1 };

  assert.equal(engine.dispatchFrontierMission("rangers", "south_canopy", "suppress"), true);
  for (let cycle = 0; cycle < 3; cycle += 1) engine.advanceFrontierCycle();

  assert.equal(rangers.mission, null);
  // 이 결정론적 시나리오에서는 궁병·보병이 중상, 기병이 전사한다.
  assert.deepEqual(rangers.troops, { infantry: 0, archer: 0, cavalry: 0 });
  assert.equal(rangers.woundedTroops.infantry, 1);
  assert.equal(rangers.woundedTroops.archer, 1);
  assert.equal(rangers.woundedTroops.cavalry, 0, "기병 1명은 부상이 아니라 영구 전사했다");
  assert.ok(rangers.woundedTroops.recoverAt > frontier.cycle);

  // 대장(동료)은 중상만 당했을 뿐 로스터에서 사라지지 않는다 (영구 사망 없음).
  assert.ok(engine.state.adventure.roster.includes("winter_berserker"));
  assert.ok(engine.frontierUnitWounded("winter_berserker"));
  assert.equal(engine.dispatchFrontierMission("rangers", "south_canopy", "suppress"), false, "중상당한 대장으로는 재파견할 수 없다");

  // 회복 주기가 지나면 병력과 대장 모두 원상 복귀한다 (병력 회복이 대장 회복보다 늦다).
  const recoverAt = Math.max(frontier.woundedUnits.winter_berserker, rangers.woundedTroops.recoverAt);
  while (frontier.cycle < recoverAt) engine.advanceFrontierCycle();
  assert.equal(engine.frontierUnitWounded("winter_berserker"), false);
  assert.deepEqual(rangers.troops, { infantry: 1, archer: 1, cavalry: 0 });
  assert.equal(rangers.woundedTroops.infantry, 0);
  assert.equal(rangers.woundedTroops.recoverAt, null);
});

test("미션 손실 판정은 사망·중상 병력 수만큼 영지 행복도를 깎는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  frontier.cycle = 3;
  const zone = frontier.zones.south_canopy;
  zone.status = "occupied";
  zone.threat = 100;
  const rangers = frontier.squads.find((squad) => squad.id === "rangers");
  engine.state.adventure.roster.push("winter_berserker");
  engine.state.adventure.unitProgress.winter_berserker = { level: 1, xp: 0, secondaryId: null };
  rangers.memberIds = ["winter_berserker"];
  rangers.troops = { infantry: 1, archer: 1, cavalry: 1 };

  const before = engine.state.meta.estate.happiness;
  const losses = engine.applyMissionLosses(rangers, FRONTIER_ZONE_DEFS.south_canopy, zone);
  assert.equal(losses.deadTotal, 1);
  assert.equal(losses.woundedTotal, 2);
  assert.equal(losses.leaderWounded, true);
  assert.equal(engine.state.meta.estate.happiness, before - (losses.deadTotal * 1 + 3));
});

// ==========================
// B. 영지 행복도·수평 컨텐츠
// ==========================

test("영지 행복도는 배경 생산 속도에 배율로 작용한다 (기준치 70에서는 1.0배)", () => {
  assert.equal(happinessMultiplier(70), 1);
  assert.ok(happinessMultiplier(100) > happinessMultiplier(70));
  assert.ok(happinessMultiplier(0) < happinessMultiplier(70));

  const high = createInitialState();
  high.meta.estate.workers.lumberjack = 3;
  high.meta.estate.happiness = 100;
  advanceEstate(high, 3);

  const low = createInitialState();
  low.meta.estate.workers.lumberjack = 3;
  low.meta.estate.happiness = 0;
  advanceEstate(low, 3);

  assert.ok(high.meta.materials.wood > low.meta.materials.wood);
});

test("영지 행복도가 낮을수록 분대 모병 비용이 늘고, 높을수록 절감된다", () => {
  assert.equal(happinessRecruitCostMultiplier(70), 1);

  const engine = new GameEngine(new MemoryStorage());
  unlockWardensWithLeader(engine);
  engine.state.meta.scrap = 100;
  engine.state.meta.estate.happiness = 0;
  const scrapBeforeLow = engine.state.meta.scrap;
  engine.recruitTroops("wardens", "infantry", 4);
  const costLow = scrapBeforeLow - engine.state.meta.scrap;

  const engine2 = new GameEngine(new MemoryStorage());
  unlockWardensWithLeader(engine2);
  engine2.state.meta.scrap = 100;
  engine2.state.meta.estate.happiness = 100;
  const scrapBeforeHigh = engine2.state.meta.scrap;
  engine2.recruitTroops("wardens", "infantry", 4);
  const costHigh = scrapBeforeHigh - engine2.state.meta.scrap;

  assert.ok(costLow > costHigh);
});

test("영지 축제는 자원을 소모해 행복도를 즉시 올리는 수동 이벤트다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 10;
  engine.state.meta.materials.food = 10;
  engine.state.meta.estate.happiness = 70;
  assert.equal(engine.holdEstateFestival(), true);
  assert.equal(engine.state.meta.estate.happiness, 78);
  assert.equal(engine.state.meta.materials.food, 6);
  assert.equal(engine.state.meta.scrap, 7);
});

test("수성전 승리는 행복도를 올리고, 개척 주기는 점령지 수·수평 컨텐츠 충족도에 따라 행복도를 갱신한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.frontier.zones.central_oasis.status = "occupied";
  const before = engine.state.meta.estate.happiness;
  assert.equal(engine.advanceFrontierCycle(), true);
  assert.ok(typeof engine.state.meta.estate.happiness === "number");
  assert.ok(engine.state.meta.estate.happiness >= 0 && engine.state.meta.estate.happiness <= 100);
  assert.notEqual(engine.state.meta.estate.happiness, undefined);
  assert.ok(before >= 0);
});

// ==========================
// C. 행상인
// ==========================

test("행상인은 미정복 지역의 재료를 취급하며 고철과 맞바꿔 사고팔 수 있다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 200;
  const merchant = engine.state.meta.merchant;
  assert.ok(merchant.stock.length > 0);
  const materialId = merchant.stock[0];
  const price = merchant.prices[materialId];

  const beforeScrap = engine.state.meta.scrap;
  const beforeMaterial = engine.state.meta.materials[materialId] || 0;
  assert.equal(engine.tradeWithMerchant(materialId, 3, "buy"), true);
  assert.equal(engine.state.meta.materials[materialId], beforeMaterial + 3);
  assert.equal(engine.state.meta.scrap, beforeScrap - price * 3);

  assert.equal(engine.tradeWithMerchant(materialId, 2, "sell"), true);
  assert.equal(engine.state.meta.materials[materialId], beforeMaterial + 1);
  assert.equal(engine.state.meta.scrap, beforeScrap - price * 3 + price * 2);

  assert.equal(engine.tradeWithMerchant("not-in-stock", 1, "buy"), false);
  assert.equal(engine.tradeWithMerchant(materialId, 999, "sell"), false);
});

test("행상인의 가격은 개척 주기마다 좁은 범위 안에서 변동한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const merchant = engine.state.meta.merchant;
  const before = { ...merchant.prices };
  assert.equal(engine.advanceFrontierCycle(), true);
  for (const [materialId, price] of Object.entries(before)) {
    if (merchant.prices[materialId] == null) continue;
    assert.ok(Math.abs(merchant.prices[materialId] - price) <= 1);
  }
  assert.equal(merchant.cycleRotation, 1);
});

// ==========================
// D. 지역 부락 친목도
// ==========================

test("지역 부락과 교역하면 친목도가 오르고, 친목도 구간이 오를수록 취급 재료가 늘어난다", () => {
  assert.deepEqual(villageTradeableMaterials("north", 0), ["wood", "food"]);
  assert.ok(villageTradeableMaterials("north", 30).includes("ore"));
  assert.ok(villageTradeableMaterials("north", 60).includes("frostIron"));

  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 200;
  assert.equal(engine.tradeWithVillage("north", "ore", 1), false, "친목도가 낮으면 아직 취급하지 않는 재료다");
  assert.equal(engine.tradeWithVillage("north", "wood", 1), true);
  assert.equal(engine.state.meta.villageFriendship.north, 4);
  assert.equal(engine.tradeWithVillage("north", "ore", 1), false);
});

test("지역 부락 친목도 30 임계치에 도달하면 무료 생산 동료(장인 파견) 보상이 지급된다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 200;
  assert.equal(engine.state.meta.estate.productionCompanions.deepMiner, undefined);
  for (let i = 0; i < 8; i += 1) engine.tradeWithVillage("north", "wood", 1);
  assert.ok(engine.state.meta.villageFriendship.north >= 30);
  assert.deepEqual(engine.state.meta.villageMilestones.north, [30]);
  assert.equal(engine.state.meta.estate.productionCompanions.deepMiner, true, "친목도 30 보상으로 심맥 광부가 무료 합류한다");
  assert.ok(engine.tradeWithVillage("north", "ore", 1), "친목도 상승으로 광석도 취급하게 됐다");
});

test("recruitProductionCompanion은 free 옵션으로 고철 비용 없이도 슬롯 상한은 그대로 지킨다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 0;
  assert.equal(engine.recruitProductionCompanion("deepMiner", { free: true }), true);
  assert.equal(engine.state.meta.scrap, 0);
  assert.equal(engine.state.meta.estate.productionCompanions.deepMiner, true);
});

// ==========================
// E. 직업별 출신 지역 (플레이버 데이터)
// ==========================

test("기본 6개 직업은 각자 출신 지역(originRegionId)이 서사 데이터로 지정돼 있다", () => {
  assert.equal(PLAYER_BASE_CLASS_DEFS.crusader.originRegionId, "west");
  assert.equal(PLAYER_BASE_CLASS_DEFS.necromancer.originRegionId, "west");
  assert.equal(PLAYER_BASE_CLASS_DEFS.barbarian.originRegionId, "north");
  assert.equal(PLAYER_BASE_CLASS_DEFS.archmage.originRegionId, "north");
  assert.equal(PLAYER_BASE_CLASS_DEFS.maehwa.originRegionId, "east");
  assert.equal(PLAYER_BASE_CLASS_DEFS.tracker.originRegionId, "south");
});

test("병종 정의는 보병·궁병·기병 세 종류이며 병력 상한 공식은 대장 레벨에 완만하게 비례한다", () => {
  assert.deepEqual(Object.keys(TROOP_TYPE_DEFS).sort(), ["archer", "cavalry", "infantry"]);
  assert.equal(troopCapForLeaderLevel(1), 14);
  assert.equal(troopCapForLeaderLevel(10), 50);
});
