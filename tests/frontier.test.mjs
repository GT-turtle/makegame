import test from "node:test";
import assert from "node:assert/strict";

import { GameEngine } from "../src/game.js";
import {
  DISCOVERY_SITE_DEFS,
  FRONTIER_ZONE_DEFS,
  LIVING_AREA_DEFS,
  availableFrontierPopulation,
  availableLivingAreaPopulation,
  livingAreaWorkersUsed,
  occupiedZone,
  refreshFrontierUnlocks,
  routeRisk,
  siteMaterialId,
  suppressionCyclesRemaining,
  zoneRequirementsMet
} from "../src/frontier.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) || null; }
  setItem(key, value) { this.values.set(key, value); }
}

test("하위 필드에는 광산·동굴·던전 탐사 후보가 함께 존재한다", () => {
  assert.equal(DISCOVERY_SITE_DEFS.cave.dungeon, true);
  assert.equal(DISCOVERY_SITE_DEFS.dungeon.dungeon, true);
  assert.ok(FRONTIER_ZONE_DEFS.central_oasis.sitePool.includes("cave"));
  assert.ok(Object.values(DISCOVERY_SITE_DEFS).some((site) => site.id === "mine"));
});

test("세부 개척권은 안전 구역 점령 뒤 인접한 주의 구역을 연다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  assert.equal(frontier.zones.central_oasis.status, "available");
  assert.equal(frontier.zones.central_gorge.status, "locked");
  assert.equal(engine.startFrontierAdventure("central_oasis", "conquest", 9090), true);
  assert.equal(engine.state.adventure.run.subregionId, "central_oasis");
  assert.equal(engine.state.adventure.run.purpose, "conquest");
  assert.equal(frontier.factions.oasis_league.met, true);

  engine.state.adventure.run.status = "completed";
  assert.equal(engine.returnAdventureToEstate("completed"), true);
  assert.equal(occupiedZone(frontier, "central_oasis"), true);
  assert.equal(frontier.zones.central_oasis.sites.length, 1);
  assert.equal(frontier.zones.central_gorge.status, "available");
  assert.equal(zoneRequirementsMet(frontier, "central_gorge"), true);
});

test("발견 거점에 주민과 호위를 배치하고 주기마다 수송을 판정한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  const zone = frontier.zones.central_oasis;
  zone.status = "occupied";
  zone.stability = 40;
  const site = {
    id: "central_oasis-site-test",
    typeId: "caravan",
    quality: 2,
    status: "discovered",
    workers: 0,
    escortUnitId: null,
    delivered: 0,
    lastEvent: "시험 발견"
  };
  zone.sites.push(site);
  assert.equal(engine.developFrontierSite(site.id), true);
  assert.equal(site.status, "developed");
  assert.equal(availableFrontierPopulation(frontier), frontier.population.total - DISCOVERY_SITE_DEFS.caravan.workers);

  engine.state.adventure.roster.push("glass_alchemist");
  engine.state.adventure.unitProgress.glass_alchemist = { level: 2, xp: 0, secondaryId: null };
  const unescorted = routeRisk(frontier, "central_oasis", site, 0);
  assert.equal(engine.assignSiteEscort(site.id, "glass_alchemist"), true);
  const escorted = routeRisk(frontier, "central_oasis", site, 22);
  assert.ok(escorted < unescorted);
  assert.equal(engine.advanceFrontierCycle(), true);
  assert.equal(frontier.cycle, 1);
  assert.ok(site.delivered > 0 || Object.keys(zone.stolenCargo).length > 0);
});

test("추가 유닛은 자동 원정대를 꾸려 점령지를 탐사하거나 토벌한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  frontier.zones.north_fir.status = "occupied";
  engine.state.adventure.roster.push("winter_berserker");
  engine.state.adventure.unitProgress.winter_berserker = { level: 1, xp: 0, secondaryId: null };
  engine.refreshFrontierSquads();
  const wardens = frontier.squads.find((squad) => squad.id === "wardens");
  assert.equal(wardens.unlocked, true);
  assert.equal(engine.assignUnitToFrontierSquad("winter_berserker", "wardens"), true);
  assert.equal(engine.dispatchFrontierMission("wardens", "north_fir", "survey"), true);
  assert.equal(engine.advanceFrontierCycle(), true);
  assert.equal(wardens.mission, null);
  assert.ok(frontier.zones.north_fir.exploration > 0 || frontier.zones.north_fir.sites.length > 0);
});

test("지역 요구 조건은 점령 상태와 requireAny 규칙을 함께 처리한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  assert.equal(FRONTIER_ZONE_DEFS.north_gorge.requireAny, true);
  frontier.zones.north_river.status = "occupied";
  assert.equal(zoneRequirementsMet(frontier, "north_gorge"), true);
  refreshFrontierUnlocks(frontier);
  assert.equal(frontier.zones.north_gorge.status, "available");
});

test("일반 광산은 지역에 따라 Cu·Fe·Al·Sn·Ti 광석을 생산한다", () => {
  const mine = DISCOVERY_SITE_DEFS.mine;
  assert.equal(siteMaterialId(mine, "central"), "copperOre");
  assert.equal(siteMaterialId(mine, "north"), "ore");
  assert.equal(siteMaterialId(mine, "west"), "aluminumOre");
  assert.equal(siteMaterialId(mine, "south"), "tinOre");
  assert.equal(siteMaterialId(mine, "east"), "titaniumOre");
  assert.equal(DISCOVERY_SITE_DEFS.runeCircle.materialId, "runeFragment");
});

test("점령지에는 상주민이 생기지 않고 별도 생활권에서 작업자를 파견한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  const zone = frontier.zones.central_oasis;
  zone.status = "occupied";
  const site = {
    id: "central-oasis-herb-test",
    typeId: "herb",
    materialId: "herb",
    quality: 1,
    status: "discovered",
    workers: 0,
    livingAreaId: null,
    escortUnitId: null,
    delivered: 0,
    lastEvent: "시험 발견"
  };
  zone.sites.push(site);

  assert.equal(zone.residents, undefined);
  assert.equal(engine.developFrontierSite(site.id), true);
  assert.equal(site.livingAreaId, "home_estate");
  assert.equal(livingAreaWorkersUsed(frontier, "home_estate"), DISCOVERY_SITE_DEFS.herb.workers);
  assert.equal(availableLivingAreaPopulation(frontier, "home_estate"), LIVING_AREA_DEFS.home_estate.foundingResidents - DISCOVERY_SITE_DEFS.herb.workers);
});

test("외부 지역 작업지는 그 지역 생활권을 따로 조성해야 운영할 수 있다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  const zone = frontier.zones.north_fir;
  zone.status = "occupied";
  const site = {
    id: "north-fir-lumber-test",
    typeId: "lumber",
    materialId: "wood",
    quality: 1,
    status: "discovered",
    workers: 0,
    livingAreaId: null,
    escortUnitId: null,
    delivered: 0,
    lastEvent: "시험 발견"
  };
  zone.sites.push(site);
  const totalBefore = frontier.population.total;

  assert.equal(engine.developFrontierSite(site.id), false);
  frontier.livingAreas.north_hamlet.discovered = true;
  assert.equal(engine.establishLivingArea("north_hamlet"), true);
  assert.equal(frontier.livingAreas.north_hamlet.residents, LIVING_AREA_DEFS.north_hamlet.foundingResidents);
  assert.equal(frontier.population.total, totalBefore);
  assert.equal(engine.developFrontierSite(site.id), true);
  assert.equal(site.livingAreaId, "north_hamlet");
});

test("세부 점령 노드는 문명식 육각 지도 좌표를 가진다", () => {
  for (const zone of Object.values(FRONTIER_ZONE_DEFS)) {
    assert.ok(Number.isInteger(zone.hex?.col));
    assert.ok(Number.isInteger(zone.hex?.row));
  }
});

test("비서식 점령지는 토벌 기한을 넘기면 방치 불이익이 쌓이고 재토벌로 초기화된다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const frontier = engine.state.frontier;
  const zone = frontier.zones.central_oasis;
  zone.status = "occupied";
  zone.stability = 50;
  zone.threat = 12;
  const initialRisk = routeRisk(frontier, "central_oasis", { typeId: "caravan" }, 0);

  assert.equal(suppressionCyclesRemaining(frontier, "central_oasis"), 4);
  for (let cycle = 0; cycle < 4; cycle += 1) assert.equal(engine.advanceFrontierCycle(), true);
  assert.equal(zone.neglect, 1);
  assert.ok(zone.threat > 12);
  assert.ok(zone.stability < 58);
  assert.ok(routeRisk(frontier, "central_oasis", { typeId: "caravan" }, 0) > initialRisk);

  assert.equal(engine.startFrontierAdventure("central_oasis", "suppression", 5151), true);
  engine.state.adventure.run.status = "completed";
  assert.equal(engine.returnAdventureToEstate("completed"), true);
  assert.equal(zone.neglect, 0);
  assert.equal(zone.suppressionClock, 0);
});
