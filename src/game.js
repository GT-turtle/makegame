import { AFFIX_DEFS, AREA_DEFS, CLASS_DEFS, CRAFT_RECIPES, ENEMY_DEFS, ITEM_DEFS, MATERIAL_DEFS, PRODUCTION_COMPANION_DEFS, RESEARCH_DEFS, TRAIT_DEFS, WORKER_DEFS } from "./data.js";
import { PLAYER_BASE_CLASS_DEFS, PLAYER_KIT_DEFS, RUNE_DEFS, WEAPON_DEFS, normalizedPlayerLoadout, playerKitDefinition } from "./classes.js";
import {
  activeWorkerCount,
  addMaterial,
  adjustedWorkerMaterialCosts,
  advanceEstate,
  bagFingerprint,
  createCraftedItem,
  createExpedition,
  createInitialState,
  createItem,
  createUid,
  distance,
  environmentMitigation,
  happinessMultiplier,
  happinessRecruitCostMultiplier,
  hasAdjacentTag,
  isVisible,
  keyOf,
  masteryGainMultiplier,
  masteryLevel,
  migrateState,
  pathStepToward,
  placeItem,
  removeItem,
  recordWorkerWork,
  resolveBagTrigger,
  revealFloor,
  synergyItemUids,
  useHerbKit
} from "./core.js";
import {
  ENCOUNTER_DEFS,
  ENEMY_COMBATANTS,
  PARTY_LIMIT,
  SECONDARY_DEFS,
  UNIT_DEFS,
  WORLD_REGION_DEFS,
  completeBattle,
  createAutoBattle,
  createRegionRun,
  enterRunDungeon,
  enterRunSettlement,
  issuePlayerAction,
  issueBattleCommand,
  leaveRunDungeon,
  leaveRunSettlement,
  moveBattlePlayer,
  steerBattlePlayer,
  moveRunPlayer,
  selectPlayerTarget,
  tickAutoBattle
} from "./adventure.js";
import {
  DISCOVERY_SITE_DEFS,
  FRONTIER_FACTION_DEFS,
  FRONTIER_ZONE_DEFS,
  LEADER_RECOVERY_CYCLES,
  LIVING_AREA_DEFS,
  TROOP_RECOVERY_CYCLES,
  TROOP_SPECIES_MATCHUP,
  TROOP_TYPE_DEFS,
  VILLAGE_FRIENDSHIP_GAIN,
  VILLAGE_MILESTONE_THRESHOLDS,
  VILLAGE_TRADE_PRICE,
  ZONE_TIER_DEFS,
  availableFrontierPopulation,
  availableLivingAreaPopulation,
  deterministicFrontierRoll,
  inhabitedLivingAreaForRegion,
  livingAreaDefinitionForRegion,
  livingAreaRequirementsMet,
  occupiedZone,
  refreshFrontierUnlocks,
  riskLabel,
  routeRisk,
  siteMaterialId,
  squadTroopTotal,
  stepMerchantCycle,
  totalFrontierPopulation,
  troopCapForLeaderLevel,
  troopRecruitCost,
  villageTradeableMaterials,
  zoneRequirementsMet
} from "./frontier.js";
import {
  ESTATE_GATE_DEFS,
  GATE_GARRISON_LIMIT,
  REMNANT_TEAM_LIMIT,
  createDefenseCampaign,
  groupDefensePower
} from "./defense.js";

const SAVE_KEY = "packforge-expedition-save-v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// 지역의 조우 구성(WORLD_REGION_DEFS.enemyPool -> ENCOUNTER_DEFS -> ENEMY_COMBATANTS.species)으로부터
// 그 지역에 출현하는 몬스터 종족 비율을 어림한다. 분대 병력 상성 계산에 사용한다.
function regionSpeciesMix(regionId) {
  const region = WORLD_REGION_DEFS[regionId];
  if (!region) return {};
  const counts = {};
  let total = 0;
  for (const encounterId of region.enemyPool || []) {
    for (const enemyDefId of ENCOUNTER_DEFS[encounterId]?.enemies || []) {
      const species = ENEMY_COMBATANTS[enemyDefId]?.species;
      if (!species) continue;
      counts[species] = (counts[species] || 0) + 1;
      total += 1;
    }
  }
  if (!total) return {};
  return Object.fromEntries(Object.entries(counts).map(([species, count]) => [species, count / total]));
}

function troopMatchupMultiplier(regionId, troopType) {
  const mix = regionSpeciesMix(regionId);
  const entries = Object.entries(mix);
  if (!entries.length) return 1;
  return entries.reduce((sum, [species, ratio]) => sum + ratio * (TROOP_SPECIES_MATCHUP[species]?.[troopType] ?? 1), 0);
}

// 대장의 역할(탱커/딜러/유틸, UNIT_DEFS[..].role)에 따라 특정 병종에 붙는 시너지 배율.
// 탱커형은 보병을, 딜러형은 궁병·기병을 강화하고, 유틸형은 commandAura/partyArmor 특성처럼 전 병종에 균등 보너스를 준다.
function leaderRoleSynergy(leaderId, troopType) {
  const leader = leaderId ? UNIT_DEFS[leaderId] : null;
  if (!leader) return 1;
  const role = leader.role || "";
  let multiplier = 1;
  if (role.includes("탱") && troopType === "infantry") multiplier += 0.25;
  if (role.includes("딜") && (troopType === "archer" || troopType === "cavalry")) multiplier += 0.2;
  if (role.includes("유틸") || leader.commandAura || leader.partyArmor) multiplier += 0.1;
  return multiplier;
}

// 세부 점령지 종류별로 자동 보급되는 병종 (모병의 두 번째 경로에서 사용).
const SITE_TROOP_TYPE = {
  mine: "infantry", deepMine: "cavalry", herb: "archer", rareHerb: "archer",
  lumber: "infantry", manaWell: "archer", runeCircle: "archer", glassPit: "cavalry",
  caravan: "cavalry", ruin: "infantry"
};

// 병력/인구 소모원 선택: home_estate를 우선 사용하고, 부족하면 필요량을 감당할 수 있는
// 생활권 중 가용 인구가 가장 적은(여유가 가장 빠듯한) 곳부터 채운다.
function pickPopulationSourceLivingArea(frontier, needed) {
  if (availableLivingAreaPopulation(frontier, "home_estate") >= needed) return "home_estate";
  const candidates = Object.keys(frontier.livingAreas)
    .filter((id) => id !== "home_estate" && frontier.livingAreas[id].status === "inhabited")
    .map((id) => ({ id, available: availableLivingAreaPopulation(frontier, id) }))
    .filter((entry) => entry.available >= needed)
    .sort((a, b) => a.available - b.available);
  return candidates[0]?.id || null;
}

// 지역 부락 친목도 임계치(30/60/90) 보상: 장인 파견(무료 생산 동료), 설계도, 비법서(고급 레시피).
const VILLAGE_MILESTONE_REWARDS = {
  north: {
    30: { type: "companion", companionId: "deepMiner" },
    60: { type: "blueprint", recipeId: "armor" },
    90: { type: "grimoire", recipeId: "knightAegis" }
  },
  south: {
    30: { type: "companion", companionId: "herbalistCompanion" },
    60: { type: "blueprint", recipeId: "venom" },
    90: { type: "grimoire", recipeId: "sporeMask" }
  },
  east: {
    30: { type: "companion", companionId: "refinerCompanion" },
    60: { type: "blueprint", recipeId: "ember" },
    90: { type: "grimoire", recipeId: "mechanicRig" }
  },
  west: {
    30: { type: "companion", companionId: "alchemist" },
    60: { type: "blueprint", recipeId: "wardenLens" },
    90: { type: "grimoire", recipeId: "martialWraps" }
  },
  central: {
    30: { type: "companion", companionId: "masterSmith" },
    60: { type: "blueprint", recipeId: "lantern" },
    90: { type: "grimoire", recipeId: "coil" }
  }
};

export class GameEngine {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.listeners = new Set();
    this.state = this.load();
    if (this.state.expedition?.phase === "active") revealFloor(this.state);
  }

  load() {
    try {
      const stored = this.storage?.getItem(SAVE_KEY);
      return stored ? migrateState(JSON.parse(stored)) : createInitialState();
    } catch {
      return createInitialState();
    }
  }

  save() {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // 저장 공간을 사용할 수 없어도 현재 세션은 계속 진행한다.
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(persist = true) {
    if (persist) this.save();
    for (const listener of this.listeners) listener(this.state);
  }

  addLog(text, tone = "") {
    this.state.log.unshift({ text, tone });
    this.state.log = this.state.log.slice(0, 12);
  }

  startExpedition(areaIdOrSeed = this.state.meta.selectedAreaId, seed) {
    if (this.state.expedition || this.state.estateDefense?.campaign) return false;
    const areaId = typeof areaIdOrSeed === "string" ? areaIdOrSeed : this.state.meta.selectedAreaId;
    const resolvedSeed = typeof areaIdOrSeed === "number" ? areaIdOrSeed : seed;
    const area = AREA_DEFS[areaId] || AREA_DEFS.estate;
    createExpedition(this.state, resolvedSeed, area.id);
    revealFloor(this.state);
    this.addLog(`${area.name}에 진입했다. ${area.objective}`, "item");
    this.emit();
    return true;
  }

  selectArea(areaId) {
    if (this.state.expedition || this.state.estateDefense?.campaign || !AREA_DEFS[areaId]) return false;
    this.state.meta.selectedAreaId = areaId;
    this.addLog(`다음 목적지 선택: ${AREA_DEFS[areaId].name}`, "item");
    this.emit();
    return true;
  }

  selectWorldRegion(regionId) {
    const adventure = this.state.adventure;
    const region = WORLD_REGION_DEFS[regionId];
    if (!adventure || adventure.run || this.state.estateDefense?.campaign || !region || region.locked || !adventure.unlockedRegionIds.includes(regionId)) return false;
    adventure.selectedRegionId = regionId;
    this.emit();
    return true;
  }

  startRegionAdventure(regionId = this.state.adventure?.selectedRegionId, seed) {
    const adventure = this.state.adventure;
    const region = WORLD_REGION_DEFS[regionId];
    if (!adventure || adventure.run || this.state.estateDefense?.campaign || !region || region.locked || !adventure.unlockedRegionIds.includes(regionId)) return false;
    const party = adventure.party.filter((unitId) => adventure.roster.includes(unitId) && UNIT_DEFS[unitId]).slice(0, PARTY_LIMIT);
    if (!party.length) return false;
    const run = createRegionRun(regionId, seed, party, adventure.unitProgress, adventure.commander);
    if (!run) return false;
    adventure.selectedRegionId = regionId;
    adventure.run = run;
    adventure.records[regionId].visits += 1;
    this.addLog(`${region.name} 필드에 진입했다. 흩어진 몬스터와 던전 입구를 수색한다.`, "item");
    this.emit();
    return true;
  }

  refreshFrontierSquads() {
    const adventure = this.state.adventure;
    const frontier = this.state.frontier;
    if (!adventure || !frontier) return;
    const vanguard = frontier.squads.find((squad) => squad.id === "vanguard");
    if (vanguard) vanguard.memberIds = [...adventure.party];
    const wardens = frontier.squads.find((squad) => squad.id === "wardens");
    const rangers = frontier.squads.find((squad) => squad.id === "rangers");
    if (wardens) wardens.unlocked ||= adventure.roster.length >= 6;
    if (rangers) rangers.unlocked ||= adventure.roster.length >= 10;

    const claimed = new Set(adventure.party);
    for (const squad of frontier.squads.filter((entry) => entry.id !== "vanguard")) {
      squad.memberIds = squad.memberIds.filter((unitId) => {
        if (!adventure.roster.includes(unitId) || claimed.has(unitId)) return false;
        claimed.add(unitId);
        return true;
      }).slice(0, PARTY_LIMIT);
    }
  }

  addFrontierEvent(text, tone = "item") {
    const frontier = this.state.frontier;
    if (!frontier) return;
    frontier.eventLog.unshift(`제${frontier.cycle}주기 · ${text}`);
    frontier.eventLog = frontier.eventLog.slice(0, 16);
    this.addLog(text, tone);
  }

  selectFrontierZone(zoneId) {
    const frontier = this.state.frontier;
    const definition = FRONTIER_ZONE_DEFS[zoneId];
    if (!frontier || !definition) return false;
    frontier.selectedZoneId = zoneId;
    this.state.adventure.selectedRegionId = definition.regionId;
    this.emit();
    return true;
  }

  meetFrontierFaction(factionId) {
    const frontier = this.state.frontier;
    const definition = FRONTIER_FACTION_DEFS[factionId];
    const faction = frontier?.factions[factionId];
    if (!definition || !faction || faction.met) return false;
    faction.met = true;
    faction.trust = 4;
    faction.lastEvent = `${definition.ruler}의 사절과 처음 조우했다.`;
    this.addFrontierEvent(`${definition.name}의 ${definition.ruler}와 조우했다. 거래·정찰·압박이 가능해졌다.`, "good");
    return true;
  }

  startFrontierAdventure(zoneId = this.state.frontier?.selectedZoneId, purpose = "conquest", seed) {
    const adventure = this.state.adventure;
    const frontier = this.state.frontier;
    const definition = FRONTIER_ZONE_DEFS[zoneId];
    const zone = frontier?.zones[zoneId];
    if (!adventure || !frontier || adventure.run || this.state.estateDefense?.campaign || !definition || !zone) return false;
    if (!adventure.unlockedRegionIds.includes(definition.regionId) || !zoneRequirementsMet(frontier, zoneId)) return false;
    const isOwned = occupiedZone(frontier, zoneId);
    if ((purpose === "conquest" && isOwned) || (purpose === "suppression" && !isOwned)) return false;
    if (purpose === "conquest" && zone.status !== "available") return false;
    const party = adventure.party.filter((unitId) => adventure.roster.includes(unitId) && UNIT_DEFS[unitId]).slice(0, PARTY_LIMIT);
    if (!party.length) return false;
    const run = createRegionRun(
      definition.regionId,
      seed,
      party,
      adventure.unitProgress,
      adventure.commander,
      {
        subregionId: zoneId,
        purpose,
        bossEncounterId: definition.bossEncounterId,
        ambushInterval: { safe: [8, 13], watch: [6, 10], danger: [4, 8] }[definition.tier]
      }
    );
    if (!run) return false;
    adventure.selectedRegionId = definition.regionId;
    adventure.run = run;
    adventure.records[definition.regionId].visits += 1;
    frontier.selectedZoneId = zoneId;
    zone.lastEvent = purpose === "conquest" ? "점령 원정이 시작됐다." : "재토벌대가 진입했다.";
    this.meetFrontierFaction(definition.factionId);
    this.addFrontierEvent(`${definition.name} ${purpose === "conquest" ? "점령 원정" : "재토벌"}을 시작했다. 넓은 필드 너머 던전 목표를 확보하라.`, "item");
    this.emit();
    return true;
  }

  discoverFrontierSite(zoneId, explorationGain = 0, guarantee = false) {
    const frontier = this.state.frontier;
    const definition = FRONTIER_ZONE_DEFS[zoneId];
    const zone = frontier?.zones[zoneId];
    if (!frontier || !definition || !zone || !occupiedZone(frontier, zoneId)) return null;
    zone.exploration = Math.min(199, zone.exploration + explorationGain);
    const alreadyFound = new Set(zone.sites.map((site) => site.typeId));
    const candidates = definition.sitePool.filter((siteId) => !alreadyFound.has(siteId));
    if (!candidates.length || zone.sites.length >= 3) return null;
    const chance = Math.min(0.85, 0.18 + zone.exploration / 150);
    const roll = deterministicFrontierRoll(frontier, `${zoneId}|discover|${zone.sites.length}`);
    if (!guarantee && zone.exploration < 100 && roll > chance) return null;
    const pick = Math.floor(deterministicFrontierRoll(frontier, `${zoneId}|site|${zone.sites.length}`) * candidates.length);
    const typeId = candidates[Math.min(candidates.length - 1, pick)];
    const quality = 1 + Math.floor(deterministicFrontierRoll(frontier, `${zoneId}|quality|${zone.sites.length}`) * 3);
    const site = {
      id: `${zoneId}-site-${zone.sites.length + 1}`,
      typeId,
      materialId: siteMaterialId(DISCOVERY_SITE_DEFS[typeId], definition.regionId),
      quality,
      status: "discovered",
      workers: 0,
      livingAreaId: null,
      escortUnitId: null,
      delivered: 0,
      lastEvent: "탐사 중 발견"
    };
    zone.sites.push(site);
    zone.exploration = Math.max(0, zone.exploration - 100);
    zone.lastEvent = `${DISCOVERY_SITE_DEFS[typeId].name} 발견`;
    this.addFrontierEvent(`${definition.name}에서 ${DISCOVERY_SITE_DEFS[typeId].name}을 발견했다.`, "good");
    return site;
  }

  resolveFrontierAdventure(run, completed, defeated) {
    const frontier = this.state.frontier;
    const zoneId = run?.subregionId;
    const definition = FRONTIER_ZONE_DEFS[zoneId];
    const zone = frontier?.zones[zoneId];
    if (!frontier || !definition || !zone) return;
    if (completed) {
      if (run.purpose === "suppression") {
        zone.suppressions += 1;
        zone.suppressionClock = 0;
        zone.neglect = 0;
        zone.threat = Math.max(0, zone.threat - 36);
        zone.stability = Math.min(100, zone.stability + 16);
        const recovered = [];
        for (const [materialId, amount] of Object.entries(zone.stolenCargo || {})) {
          if (amount <= 0) continue;
          if (materialId === "scrap") this.state.meta.scrap += amount;
          else addMaterial(this.state.meta.materials, materialId, amount);
          recovered.push(`${MATERIAL_DEFS[materialId]?.name || "고철"} ${amount}`);
        }
        zone.stolenCargo = {};
        zone.lastEvent = `재토벌 완료${recovered.length ? ` · 약탈품 ${recovered.join(" · ")} 회수` : ""}`;
        this.addFrontierEvent(`${definition.name} 재토벌 완료. 위협이 낮아지고 개척로가 안정됐다.${recovered.length ? ` 약탈품 ${recovered.join(" · ")} 회수.` : ""}`, "good");
        this.discoverFrontierSite(zoneId, ZONE_TIER_DEFS[definition.tier].discoveryGain, false);
      } else {
        zone.status = "occupied";
        zone.conquests += 1;
        zone.suppressionClock = 0;
        zone.neglect = 0;
        zone.stability = Math.max(zone.stability, 34);
        zone.threat = Math.max(8, zone.threat - 14);
        zone.lastEvent = "점령 완료 · 순찰과 작업지 조사 가능";
        this.addFrontierEvent(`${definition.name} 점령 완료. 이곳은 거주지가 아니며, 생활권에서 작업자를 파견할 수 있다.`, "good");
        this.discoverFrontierSite(zoneId, 100, true);
        refreshFrontierUnlocks(frontier);
      }
    } else if (defeated) {
      zone.threat = Math.min(100, zone.threat + 12);
      zone.lastEvent = "원정대 패퇴 · 위협 증가";
      this.addFrontierEvent(`${definition.name} 원정대가 패퇴했다. 현지 세력의 경계가 강해졌다.`, "bad");
    }
  }

  frontierUnitBusy(unitId, ignoreSquadId = null, ignoreDefense = false) {
    const frontier = this.state.frontier;
    if (!frontier) return false;
    if (this.frontierUnitWounded(unitId)) return true;
    for (const squad of frontier.squads) {
      if (squad.id === "vanguard" || squad.id === ignoreSquadId) continue;
      if (squad.memberIds.includes(unitId)) return true;
    }
    if (Object.values(frontier.zones).some((zone) => zone.sites.some((site) => site.escortUnitId === unitId))) return true;
    return !ignoreDefense && this.defenseDeploymentBusy(unitId);
  }

  // 분대 병력 시스템: 대장(동료)이 원정 실패로 중상당하면 회복될 때까지 재배치할 수 없다 (영구 사망은 없다).
  frontierUnitWounded(unitId) {
    const frontier = this.state.frontier;
    const recoverAt = frontier?.woundedUnits?.[unitId];
    return recoverAt != null && frontier.cycle < recoverAt;
  }

  assignUnitToFrontierSquad(unitId, squadId) {
    const adventure = this.state.adventure;
    const frontier = this.state.frontier;
    const squad = frontier?.squads.find((entry) => entry.id === squadId);
    if (!adventure || !squad || squad.id === "vanguard" || !squad.unlocked || squad.mission || adventure.run || this.state.estateDefense?.campaign) return false;
    if (!adventure.roster.includes(unitId) || adventure.party.includes(unitId)) return false;
    const index = squad.memberIds.indexOf(unitId);
    if (index >= 0) squad.memberIds.splice(index, 1);
    else {
      if (squad.memberIds.length >= PARTY_LIMIT || this.frontierUnitBusy(unitId, squadId)) return false;
      squad.memberIds.push(unitId);
    }
    this.addFrontierEvent(`${UNIT_DEFS[unitId].name}: ${squad.name} ${index >= 0 ? "배치 해제" : "배치"}.`);
    this.emit();
    return true;
  }

  dispatchFrontierMission(squadId, zoneId, type = "survey") {
    const frontier = this.state.frontier;
    const squad = frontier?.squads.find((entry) => entry.id === squadId);
    const definition = FRONTIER_ZONE_DEFS[zoneId];
    if (!frontier || !squad || squad.id === "vanguard" || !squad.unlocked || squad.mission || !squad.memberIds.length || !definition) return false;
    if (!occupiedZone(frontier, zoneId) || !["survey", "suppress"].includes(type)) return false;
    if (this.frontierUnitWounded(squad.memberIds[0])) return false;
    const duration = { safe: 1, watch: 2, danger: 3 }[definition.tier];
    squad.mission = { type, zoneId, remaining: duration };
    this.addFrontierEvent(`${squad.name}을 ${definition.name} ${type === "survey" ? "탐사" : "토벌"}에 파견했다. ${duration}주기 후 귀환.`);
    this.emit();
    return true;
  }

  // 분대 병력 시스템: 영지 인구(고정)와 고철을 소모해 대장의 로지스틱 레벨에 비례한 상한 안에서 병력을 모병한다.
  recruitTroops(squadId, troopType, count = 1) {
    const frontier = this.state.frontier;
    const adventure = this.state.adventure;
    const squad = frontier?.squads.find((entry) => entry.id === squadId);
    const amount = Math.floor(count);
    if (!frontier || !adventure || !squad || squad.id === "vanguard" || !squad.unlocked) return false;
    if (!TROOP_TYPE_DEFS[troopType] || amount <= 0) return false;
    const leaderId = squad.memberIds[0] || null;
    const leaderLevel = leaderId ? (adventure.unitProgress[leaderId]?.level || 1) : 1;
    const cap = troopCapForLeaderLevel(leaderLevel);
    if (squadTroopTotal(squad) + amount > cap) return false;
    const cost = troopRecruitCost(troopType, amount);
    const livingAreaId = pickPopulationSourceLivingArea(frontier, cost.population);
    if (!livingAreaId) return false;
    const happiness = this.state.meta.estate?.happiness ?? 70;
    const scrapCost = Math.max(1, Math.round(cost.scrap * happinessRecruitCostMultiplier(happiness)));
    if (this.state.meta.scrap < scrapCost) return false;
    this.state.meta.scrap -= scrapCost;
    frontier.livingAreas[livingAreaId].residents -= cost.population;
    frontier.population.total = totalFrontierPopulation(frontier);
    squad.troops[troopType] = (squad.troops[troopType] || 0) + amount;
    this.addFrontierEvent(`${squad.name}: ${TROOP_TYPE_DEFS[troopType].name} ${amount}명 모병 (고철 ${scrapCost}, 인구 ${cost.population}).`, "good");
    this.emit();
    return true;
  }

  developFrontierSite(siteId) {
    const frontier = this.state.frontier;
    if (!frontier) return false;
    const entry = Object.entries(frontier.zones).find(([, zone]) => zone.sites.some((site) => site.id === siteId));
    if (!entry) return false;
    const [zoneId, zone] = entry;
    const site = zone.sites.find((item) => item.id === siteId);
    const definition = DISCOVERY_SITE_DEFS[site.typeId];
    if (!definition || definition.dungeon || site.status !== "discovered" || !occupiedZone(frontier, zoneId)) return false;
    const regionId = FRONTIER_ZONE_DEFS[zoneId].regionId;
    const livingArea = inhabitedLivingAreaForRegion(frontier, regionId);
    if (!livingArea || availableLivingAreaPopulation(frontier, livingArea.definition.id) < definition.workers) return false;
    if (Object.entries(definition.build).some(([materialId, amount]) => (this.state.meta.materials[materialId] || 0) < amount)) return false;
    for (const [materialId, amount] of Object.entries(definition.build)) this.state.meta.materials[materialId] -= amount;
    site.status = "developed";
    site.workers = definition.workers;
    site.livingAreaId = livingArea.definition.id;
    site.lastEvent = `${livingArea.definition.name}에서 작업자 파견`;
    zone.status = "developed";
    frontier.estateSatisfaction.prospect = Math.min(100, frontier.estateSatisfaction.prospect + 2);
    this.addFrontierEvent(`${livingArea.definition.name}에서 ${FRONTIER_ZONE_DEFS[zoneId].name}의 ${definition.name}(으)로 작업자 ${definition.workers}명을 파견했다.`, "good");
    this.emit();
    return true;
  }

  establishLivingArea(livingAreaId) {
    const frontier = this.state.frontier;
    const definition = LIVING_AREA_DEFS[livingAreaId];
    const livingArea = frontier?.livingAreas?.[livingAreaId];
    const home = frontier?.livingAreas?.home_estate;
    if (!frontier || !definition || !livingArea || definition.kind === "estate" || livingArea.status === "inhabited") return false;
    if (!livingAreaRequirementsMet(frontier, livingAreaId) || !home || home.status !== "inhabited") return false;
    if (availableLivingAreaPopulation(frontier, "home_estate") < definition.foundingResidents) return false;
    if (Object.entries(definition.build).some(([materialId, amount]) => (this.state.meta.materials[materialId] || 0) < amount)) return false;
    for (const [materialId, amount] of Object.entries(definition.build)) this.state.meta.materials[materialId] -= amount;
    home.residents -= definition.foundingResidents;
    livingArea.status = "inhabited";
    livingArea.residents = definition.foundingResidents;
    livingArea.safety = 48;
    livingArea.foundedAtCycle = frontier.cycle;
    livingArea.lastEvent = `내 영지에서 주민 ${definition.foundingResidents}명이 이주했다.`;
    frontier.population.total = Object.values(frontier.livingAreas).reduce((sum, area) => sum + (area.residents || 0), 0);
    frontier.estateSatisfaction.prospect = Math.min(100, frontier.estateSatisfaction.prospect + 3);
    this.addFrontierEvent(`${definition.name} 조성 완료. 내 영지의 주민 ${definition.foundingResidents}명이 이주했으며, 이 지역 작업지에 인력을 보낼 수 있다.`, "good");
    this.emit();
    return true;
  }

  upgradeFrontierRoute(zoneId) {
    const frontier = this.state.frontier;
    const zone = frontier?.zones[zoneId];
    if (!zone || !occupiedZone(frontier, zoneId) || zone.routeLevel >= 3) return false;
    const cost = { wood: 2 + zone.routeLevel, ore: 1 + zone.routeLevel };
    if (Object.entries(cost).some(([materialId, amount]) => (this.state.meta.materials[materialId] || 0) < amount)) return false;
    for (const [materialId, amount] of Object.entries(cost)) this.state.meta.materials[materialId] -= amount;
    zone.routeLevel += 1;
    this.addFrontierEvent(`${FRONTIER_ZONE_DEFS[zoneId].name} 수송로를 ${zone.routeLevel}단계로 정비했다. 약탈 위험이 감소한다.`, "good");
    this.emit();
    return true;
  }

  assignSiteEscort(siteId, unitId = null) {
    const adventure = this.state.adventure;
    const frontier = this.state.frontier;
    if (!adventure || !frontier || adventure.run || this.state.estateDefense?.campaign) return false;
    const zone = Object.values(frontier.zones).find((entry) => entry.sites.some((site) => site.id === siteId));
    const site = zone?.sites.find((item) => item.id === siteId);
    if (!site || site.status !== "developed") return false;
    if (!unitId || site.escortUnitId === unitId) {
      const previous = site.escortUnitId;
      site.escortUnitId = null;
      if (previous) this.addFrontierEvent(`${UNIT_DEFS[previous]?.name || "호위"}의 수송대 호위를 해제했다.`);
      this.emit();
      return true;
    }
    if (!adventure.roster.includes(unitId) || adventure.party.includes(unitId) || this.frontierUnitBusy(unitId)) return false;
    site.escortUnitId = unitId;
    this.addFrontierEvent(`${UNIT_DEFS[unitId].name}을 ${DISCOVERY_SITE_DEFS[site.typeId].name} 수송대 호위로 배치했다.`, "good");
    this.emit();
    return true;
  }

  barterWithFaction(factionId) {
    const frontier = this.state.frontier;
    const definition = FRONTIER_FACTION_DEFS[factionId];
    const faction = frontier?.factions[factionId];
    if (!definition || !faction?.met || (this.state.meta.materials[definition.wantsMaterial] || 0) < 2) return false;
    this.state.meta.materials[definition.wantsMaterial] -= 2;
    addMaterial(this.state.meta.materials, definition.exportMaterial, 1);
    faction.trust = Math.min(100, faction.trust + 5);
    faction.interests = Math.min(100, faction.interests + 3);
    faction.satisfaction = Math.min(100, faction.satisfaction + 2);
    faction.tradeCount += 1;
    faction.lastEvent = "물물교환 성사";
    this.addFrontierEvent(`${definition.name}과 물물교환: ${MATERIAL_DEFS[definition.wantsMaterial].name} 2 → ${MATERIAL_DEFS[definition.exportMaterial].name} 1.`, "good");
    this.emit();
    return true;
  }

  // 행상인: 정복하지 않은 지역의 재료를 사고파는 범지역 유동 교역 채널. 가격은 주기마다 변동한다.
  tradeWithMerchant(materialId, amount = 1, direction = "buy") {
    const merchant = this.state.meta.merchant;
    const count = Math.floor(amount);
    if (!merchant || count <= 0 || !["buy", "sell"].includes(direction)) return false;
    if (!merchant.stock.includes(materialId)) return false;
    const price = merchant.prices[materialId];
    if (!price) return false;
    if (direction === "buy") {
      const cost = price * count;
      if (this.state.meta.scrap < cost) return false;
      this.state.meta.scrap -= cost;
      addMaterial(this.state.meta.materials, materialId, count);
      this.addLog(`행상인에게서 ${MATERIAL_DEFS[materialId]?.name || materialId} ${count} 구매 (고철 ${cost}).`, "item");
    } else {
      if ((this.state.meta.materials[materialId] || 0) < count) return false;
      this.state.meta.materials[materialId] -= count;
      this.state.meta.scrap += price * count;
      this.addLog(`행상인에게 ${MATERIAL_DEFS[materialId]?.name || materialId} ${count} 판매 (고철 +${price * count}).`, "item");
    }
    this.emit();
    return true;
  }

  // 지역 부락 친목도: 부락에서 재료를 구매하며 친목도를 올린다. 친목도 구간(30/60/90)에 따라 취급 재료가 늘어난다.
  tradeWithVillage(regionId, materialId, amount = 1) {
    const adventure = this.state.adventure;
    const count = Math.floor(amount);
    if (!adventure || !WORLD_REGION_DEFS[regionId] || count <= 0) return false;
    if (!adventure.unlockedRegionIds.includes(regionId)) return false;
    const friendship = this.state.meta.villageFriendship[regionId] ?? 0;
    if (!villageTradeableMaterials(regionId, friendship).includes(materialId)) return false;
    const cost = VILLAGE_TRADE_PRICE * count;
    if (this.state.meta.scrap < cost) return false;
    this.state.meta.scrap -= cost;
    addMaterial(this.state.meta.materials, materialId, count);
    this.state.meta.villageFriendship[regionId] = Math.min(100, friendship + VILLAGE_FRIENDSHIP_GAIN);
    this.addLog(`${WORLD_REGION_DEFS[regionId].villageName}과 교역: ${MATERIAL_DEFS[materialId]?.name || materialId} ${count} 구매 (친목도 +${VILLAGE_FRIENDSHIP_GAIN}).`, "good");
    const rewardText = this.checkVillageMilestones(regionId);
    if (rewardText) this.addLog(rewardText, "good");
    this.emit();
    return true;
  }

  checkVillageMilestones(regionId) {
    const friendship = this.state.meta.villageFriendship[regionId] || 0;
    const claimed = this.state.meta.villageMilestones[regionId] ||= [];
    const rewards = [];
    for (const threshold of VILLAGE_MILESTONE_THRESHOLDS) {
      if (friendship >= threshold && !claimed.includes(threshold)) {
        claimed.push(threshold);
        const text = this.grantVillageMilestoneReward(regionId, threshold);
        if (text) rewards.push(text);
        if (threshold === 60) {
          const weaponText = this.unlockWeaponBlueprintsForRegion(regionId);
          if (weaponText) rewards.push(weaponText);
        }
      }
    }
    return rewards.length ? rewards.join(" · ") : null;
  }

  // 지역 부락 친목도 60 달성 시, 그 지역이 출신지(originRegionId)인 직업의
  // 무기 설계도를 습득한다. 마을 사람들이 "이 지역 출신 개척자"의 무기를
  // 만들어줄 수 있게 됐다는 서사. 여러 직업이 같은 지역 출신이면 한 번에 전부 습득.
  unlockWeaponBlueprintsForRegion(regionId) {
    const commander = this.state.adventure.commander;
    const matchingClasses = Object.values(PLAYER_BASE_CLASS_DEFS).filter((def) => def.originRegionId === regionId);
    const newlyUnlocked = [];
    for (const baseClass of matchingClasses) {
      const weapon = Object.values(WEAPON_DEFS).find((def) => def.baseClassId === baseClass.id);
      if (weapon && !commander.unlockedWeaponBlueprints.includes(weapon.id)) {
        commander.unlockedWeaponBlueprints.push(weapon.id);
        newlyUnlocked.push(weapon.name);
      }
    }
    if (newlyUnlocked.length === 0) return null;
    const villageName = WORLD_REGION_DEFS[regionId]?.villageName || regionId;
    return `${villageName} 무기 설계도 습득: ${newlyUnlocked.join(", ")}.`;
  }

  grantVillageMilestoneReward(regionId, threshold) {
    const reward = VILLAGE_MILESTONE_REWARDS[regionId]?.[threshold];
    const villageName = WORLD_REGION_DEFS[regionId]?.villageName || regionId;
    if (!reward) return null;
    if (reward.type === "companion") {
      const granted = this.recruitProductionCompanion(reward.companionId, { free: true });
      return granted
        ? `${villageName} 장인 파견: ${PRODUCTION_COMPANION_DEFS[reward.companionId]?.name || reward.companionId} 합류.`
        : `${villageName} 장인 파견 가능 (작업 슬롯이 가득 차 대기 중).`;
    }
    if (reward.type === "blueprint" || reward.type === "grimoire") {
      if (!this.state.meta.blueprints.includes(reward.recipeId)) this.state.meta.blueprints.push(reward.recipeId);
      const recipeName = CRAFT_RECIPES.find((entry) => entry.id === reward.recipeId)?.name || reward.recipeId;
      return `${villageName} ${reward.type === "grimoire" ? "비법서" : "설계도"} 습득: ${recipeName}.`;
    }
    return null;
  }

  sendFrontierSpy(factionId, unitId, operation = "recon") {
    const adventure = this.state.adventure;
    const frontier = this.state.frontier;
    const definition = FRONTIER_FACTION_DEFS[factionId];
    const faction = frontier?.factions[factionId];
    if (!adventure || !definition || !faction?.met || !adventure.roster.includes(unitId) || this.state.estateDefense?.campaign) return false;
    if (adventure.party.includes(unitId) || this.frontierUnitBusy(unitId)) return false;
    const level = adventure.unitProgress[unitId]?.level || 1;
    const roll = deterministicFrontierRoll(frontier, `${factionId}|${unitId}|${operation}|${faction.intel}`);
    const success = roll + level * 0.035 > (operation === "agitate" ? 0.48 : 0.3);
    if (success) {
      faction.intel = Math.min(100, faction.intel + (operation === "recon" ? 28 : 12));
      if (operation === "agitate") {
        faction.unrest = Math.min(100, faction.unrest + 12);
        faction.satisfaction = Math.max(0, faction.satisfaction - 8);
        faction.vigilance = Math.min(100, faction.vigilance + 7);
      }
      faction.lastEvent = operation === "recon" ? "내부 정보 확보" : "내부 불만 확산";
      this.addFrontierEvent(`${UNIT_DEFS[unitId].name}의 ${definition.name} ${operation === "recon" ? "정찰" : "이간"} 공작 성공.`, "good");
    } else {
      faction.vigilance = Math.min(100, faction.vigilance + 14);
      faction.trust = Math.max(-100, faction.trust - 8);
      faction.lastEvent = "공작 흔적 발각";
      this.addFrontierEvent(`${UNIT_DEFS[unitId].name}의 공작 흔적이 발각됐다. ${definition.name}의 경계가 높아졌다.`, "bad");
    }
    this.emit();
    return true;
  }

  pressureFrontierFaction(factionId) {
    const frontier = this.state.frontier;
    const definition = FRONTIER_FACTION_DEFS[factionId];
    const faction = frontier?.factions[factionId];
    const defense = this.state.estateDefense;
    if (!definition || !faction?.met || defense.pending || defense.battle || this.state.adventure?.run) return false;
    faction.vigilance = Math.min(100, faction.vigilance + 20);
    faction.unrest = Math.min(100, faction.unrest + 6);
    faction.trust = Math.max(-100, faction.trust - 15);
    defense.threat = Math.max(55, defense.threat);
    defense.pending = {
      regionId: definition.regionId,
      encounterId: definition.encounterId,
      title: `${definition.name}의 보복군`,
      description: `개척 압박에 반발한 ${definition.ruler}의 병력이 내 영지 외곽으로 접근한다.`
    };
    frontier.estateSatisfaction.safety = Math.max(0, frontier.estateSatisfaction.safety - 5);
    this.addFrontierEvent(`${definition.name}을 압박했다. 이익을 노릴 수 있지만 보복군이 내 영지로 향한다.`, "bad");
    this.emit();
    return true;
  }

  advanceFrontierCycle() {
    const frontier = this.state.frontier;
    if (!frontier || this.state.adventure?.run || this.state.estateDefense?.battle || this.state.estateDefense?.campaign) return false;
    frontier.cycle += 1;
    this.refreshFrontierSquads();

    // 중상 회복: 병력(N주기 후 자동 복귀)과 대장(동료, 회복 후 재배치 가능 — 영구 사망 없음)
    for (const squad of frontier.squads) {
      squad.woundedTroops ||= { infantry: 0, archer: 0, cavalry: 0, recoverAt: null };
      if (squad.woundedTroops.recoverAt != null && frontier.cycle >= squad.woundedTroops.recoverAt) {
        for (const troopType of Object.keys(TROOP_TYPE_DEFS)) {
          const recovered = squad.woundedTroops[troopType] || 0;
          if (recovered > 0) {
            squad.troops[troopType] = (squad.troops[troopType] || 0) + recovered;
            squad.woundedTroops[troopType] = 0;
          }
        }
        squad.woundedTroops.recoverAt = null;
      }
    }
    frontier.woundedUnits ||= {};
    for (const [unitId, recoverAt] of Object.entries(frontier.woundedUnits)) {
      if (frontier.cycle >= recoverAt) delete frontier.woundedUnits[unitId];
    }

    for (const squad of frontier.squads) {
      if (!squad.mission) continue;
      squad.mission.remaining -= 1;
      if (squad.mission.remaining > 0) continue;
      const { zoneId, type } = squad.mission;
      const zone = frontier.zones[zoneId];
      const zoneDefinition = FRONTIER_ZONE_DEFS[zoneId];
      const leaderId = squad.memberIds[0] || null;
      // 대장 전투력(기존 로직 유지) + 병종별 병력 수 x 병종 기본 전투력 x 상성 배율 x 대장 시너지 배율
      const leaderPower = squad.memberIds.reduce((sum, unitId) => sum + (this.state.adventure.unitProgress[unitId]?.level || 1) + 2, 0);
      let troopPower = 0;
      for (const troopType of Object.keys(TROOP_TYPE_DEFS)) {
        const count = squad.troops?.[troopType] || 0;
        if (!count) continue;
        troopPower += count * TROOP_TYPE_DEFS[troopType].basePower
          * troopMatchupMultiplier(zoneDefinition.regionId, troopType)
          * leaderRoleSynergy(leaderId, troopType);
      }
      const power = leaderPower + troopPower;
      const tierDifficulty = { safe: 0, watch: 10, danger: 22 }[zoneDefinition.tier] ?? 10;
      const difficulty = tierDifficulty + zone.threat * 0.5;
      const successChance = Math.max(8, Math.min(96, 72 + (power - difficulty))) / 100;
      const roll = deterministicFrontierRoll(frontier, `${squad.id}|mission-result|${zoneId}|${type}`);
      const success = roll < successChance;
      if (success && type === "suppress") {
        zone.threat = Math.max(0, zone.threat - 10 - power * 2);
        zone.stability = Math.min(100, zone.stability + 5 + power);
        zone.suppressions += 1;
        zone.suppressionClock = 0;
        zone.neglect = 0;
        this.addFrontierEvent(`${squad.name}이 ${zoneDefinition.name} 순환 토벌을 마쳤다.`, "good");
      } else if (success) {
        this.discoverFrontierSite(zoneId, 22 + power * 2, false);
        this.addFrontierEvent(`${squad.name}이 ${zoneDefinition.name} 탐사를 마쳤다.`);
      } else {
        const losses = this.applyMissionLosses(squad, zoneDefinition, zone);
        zone.threat = Math.min(100, zone.threat + (type === "suppress" ? 10 : 6));
        this.addFrontierEvent(`${squad.name}이 ${zoneDefinition.name} ${type === "suppress" ? "토벌" : "탐사"}에 실패했다.${losses.deadTotal ? ` 병력 ${losses.deadTotal}명 전사.` : ""}${losses.woundedTotal ? ` 병력 ${losses.woundedTotal}명 중상.` : ""}${losses.leaderWounded ? ` ${UNIT_DEFS[leaderId]?.name || "대장"} 중상, 회복 전까지 재배치 불가.` : ""}`, "bad");
      }
      squad.mission = null;
    }

    for (const [zoneId, zone] of Object.entries(frontier.zones)) {
      if (!occupiedZone(frontier, zoneId)) continue;
      const zoneDefinition = FRONTIER_ZONE_DEFS[zoneId];
      const tierDefinition = ZONE_TIER_DEFS[zoneDefinition.tier];
      zone.suppressionClock = (zone.suppressionClock || 0) + 1;
      if (zone.suppressionClock >= tierDefinition.suppressionInterval) {
        zone.suppressionClock = 0;
        zone.neglect = Math.min(4, (zone.neglect || 0) + 1);
        const threatGain = 8 + zone.neglect * 4;
        zone.threat = Math.min(100, zone.threat + threatGain);
        zone.stability = Math.max(0, zone.stability - 6 - zone.neglect * 2);
        frontier.estateSatisfaction.safety = Math.max(0, frontier.estateSatisfaction.safety - zone.neglect);
        this.addFrontierEvent(`${zoneDefinition.name} 토벌 기한을 넘겼다. 방치 ${zone.neglect}단계 · 위협 +${threatGain} · 안정 하락.`, "bad");
      }
      if (zone.threat < 45) zone.stability = Math.min(100, zone.stability + 2);
      for (const site of zone.sites.filter((entry) => entry.status === "developed")) {
        const definition = DISCOVERY_SITE_DEFS[site.typeId];
        const materialId = site.materialId || siteMaterialId(definition, FRONTIER_ZONE_DEFS[zoneId].regionId);
        const escortLevel = site.escortUnitId ? (this.state.adventure.unitProgress[site.escortUnitId]?.level || 1) : 0;
        const escortPower = site.escortUnitId ? 12 + escortLevel * 5 : 0;
        const risk = routeRisk(frontier, zoneId, site, escortPower);
        const roll = deterministicFrontierRoll(frontier, `${site.id}|shipment|${site.delivered}`) * 100;
        const neglectLoss = Math.floor((zone.neglect || 0) / 2);
        const amount = Math.max(1, definition.output + Math.floor((site.quality - 1) / 2) - neglectLoss);
        if (roll < risk) {
          zone.stolenCargo[materialId] = (zone.stolenCargo[materialId] || 0) + amount;
          zone.threat = Math.min(100, zone.threat + 6);
          site.lastEvent = `${riskLabel(risk)} 노선에서 수송품 약탈`;
          frontier.estateSatisfaction.safety = Math.max(0, frontier.estateSatisfaction.safety - 2);
          this.addFrontierEvent(`${FRONTIER_ZONE_DEFS[zoneId].name} ${definition.name} 수송대가 습격당했다. 재토벌하면 약탈품을 회수할 수 있다.`, "bad");
        } else {
          if (materialId === "scrap") this.state.meta.scrap += amount;
          else addMaterial(this.state.meta.materials, materialId, amount);
          site.delivered += amount;
          site.lastEvent = `${MATERIAL_DEFS[materialId]?.name || "고철"} ${amount} 도착`;
          // 세부 점령지가 주기마다 병력을 자동 보급 (모병의 두 번째 경로): 해당 구역 미션을 수행 중인 분대,
          // 없으면 지정된 "본대"(homeSquadId)에게 낮은 확률로 병력 1명을 보충한다.
          const troopRoll = deterministicFrontierRoll(frontier, `${site.id}|troopSupply|${frontier.cycle}`);
          if (troopRoll < 0.12) {
            const targetSquad = frontier.squads.find((entry) => entry.id !== "vanguard" && entry.mission?.zoneId === zoneId)
              || frontier.squads.find((entry) => entry.id === frontier.homeSquadId && entry.unlocked);
            if (targetSquad) {
              const leaderLevel = targetSquad.memberIds[0] ? (this.state.adventure.unitProgress[targetSquad.memberIds[0]]?.level || 1) : 1;
              if (squadTroopTotal(targetSquad) < troopCapForLeaderLevel(leaderLevel)) {
                const troopType = SITE_TROOP_TYPE[site.typeId] || "infantry";
                targetSquad.troops[troopType] = (targetSquad.troops[troopType] || 0) + 1;
                this.addFrontierEvent(`${zoneDefinition.name} ${definition.name}에서 ${targetSquad.name}에 ${TROOP_TYPE_DEFS[troopType].name} 1명을 보충했다.`);
              }
            }
          }
        }
      }
    }

    const satisfaction = frontier.estateSatisfaction;
    satisfaction.prospect = Math.min(100, satisfaction.prospect + (availableFrontierPopulation(frontier) > 0 ? 1 : 0));
    satisfaction.overall = Math.round((satisfaction.living + satisfaction.safety + satisfaction.fairness + satisfaction.culture + satisfaction.prospect) / 5);

    this.advanceEstateHappiness();
    this.advanceFrontierPopulationGrowth();
    stepMerchantCycle(frontier, this.state.meta.merchant);

    const incursion = Object.entries(frontier.zones).find(([zoneId, zone]) => occupiedZone(frontier, zoneId) && zone.threat >= 80);
    if (incursion && !this.state.estateDefense.pending) {
      const [zoneId] = incursion;
      const definition = FRONTIER_ZONE_DEFS[zoneId];
      const region = WORLD_REGION_DEFS[definition.regionId];
      this.state.estateDefense.pending = {
        regionId: definition.regionId,
        encounterId: region.defenseEncounterId,
        title: `${definition.name}발 대규모 습격`,
        description: "방치된 개척지의 위협이 수송로를 타고 내 영지까지 번졌다."
      };
      this.addFrontierEvent(`${definition.name}의 위협이 내 영지 공격으로 번졌다.`, "bad");
    }
    this.addFrontierEvent(`개척 주기 종료 · 가용 노동 ${availableFrontierPopulation(frontier)}/${frontier.population.total} · 영지 만족도 ${satisfaction.overall} · 영지 행복도 ${this.state.meta.estate.happiness}.`);
    this.emit();
    return true;
  }

  // 원정/토벌 실패 손실 규칙: 병력은 중상(N주기 후 자동 복귀) 또는 사망(영구 손실) 중 판정하고,
  // 대장(동료)은 중상만 가능하며 영구 사망하지 않는다.
  applyMissionLosses(squad, zoneDefinition, zone) {
    const frontier = this.state.frontier;
    const severity = Math.min(0.6, 0.25 + (zone.threat || 0) / 200);
    let deadTotal = 0;
    let woundedTotal = 0;
    for (const troopType of Object.keys(TROOP_TYPE_DEFS)) {
      const count = squad.troops[troopType] || 0;
      if (!count) continue;
      const affected = Math.min(count, Math.max(0, Math.round(count * severity)));
      if (!affected) continue;
      const deathRoll = deterministicFrontierRoll(frontier, `${squad.id}|${troopType}|loss|${frontier.cycle}`);
      const dead = deathRoll < 0.35 ? Math.max(1, Math.round(affected * 0.3)) : 0;
      const wounded = affected - dead;
      squad.troops[troopType] = Math.max(0, count - affected);
      if (wounded > 0) {
        squad.woundedTroops[troopType] = (squad.woundedTroops[troopType] || 0) + wounded;
        woundedTotal += wounded;
      }
      deadTotal += dead;
    }
    if (woundedTotal > 0 || deadTotal > 0) {
      squad.woundedTroops.recoverAt = Math.max(squad.woundedTroops.recoverAt || 0, frontier.cycle + TROOP_RECOVERY_CYCLES);
    }
    const leaderId = squad.memberIds[0] || null;
    let leaderWounded = false;
    if (leaderId) {
      const leaderRoll = deterministicFrontierRoll(frontier, `${squad.id}|leader|${frontier.cycle}`);
      if (leaderRoll < 0.3 + Math.min(0.3, (zone.threat || 0) / 200)) {
        frontier.woundedUnits[leaderId] = frontier.cycle + LEADER_RECOVERY_CYCLES;
        leaderWounded = true;
      }
    }
    if (deadTotal > 0 || leaderWounded) {
      const estate = this.state.meta.estate;
      estate.happiness = Math.max(0, (estate.happiness ?? 70) - deadTotal * 1 - (leaderWounded ? 3 : 0));
    }
    return { deadTotal, woundedTotal, leaderWounded };
  }

  // 영지 행복도(수평 컨텐츠 충족도) 주기 갱신: 점령지 수에 비례한 기본 페널티를
  // 주거 여유·호위 배치 비율로 대표되는 수평 컨텐츠 충족도가 상쇄한다.
  advanceEstateHappiness() {
    const frontier = this.state.frontier;
    const estate = this.state.meta.estate;
    const occupiedZoneCount = Object.keys(frontier.zones).filter((zoneId) => occupiedZone(frontier, zoneId)).length;
    const basePenalty = occupiedZoneCount * 0.6;
    const housingScore = availableFrontierPopulation(frontier) > 0 ? 1 : 0.4;
    const developedSites = Object.values(frontier.zones).flatMap((zone) => zone.sites.filter((site) => site.status === "developed"));
    const escortRatio = developedSites.length ? developedSites.filter((site) => site.escortUnitId).length / developedSites.length : 1;
    const horizontalScore = (housingScore + escortRatio) / 2;
    const offset = horizontalScore * occupiedZoneCount * 0.6;
    const workerIds = ["lumberjack", "miner", "refiner", "herbalist", "blacksmith"];
    const totalActive = workerIds.reduce((sum, id) => sum + activeWorkerCount(this.state, id), 0);
    const totalCapacity = workerIds.reduce((sum, id) => sum + WORKER_DEFS[id].max, 0);
    const loadRatio = totalCapacity ? totalActive / totalCapacity : 0;
    const overworkPenalty = loadRatio > 0.8 ? (loadRatio - 0.8) * 10 : 0;
    const shortagePenalty = (this.state.meta.materials.food || 0) <= 0 ? 2 : 0;
    const delta = offset - basePenalty - overworkPenalty - shortagePenalty;
    estate.happiness = Math.max(0, Math.min(100, Math.round(((estate.happiness ?? 70) + delta) * 10) / 10));
  }

  // 인구 성장률: 행복도가 높을수록 내 영지 인구가 더 빨리 늘어난다.
  advanceFrontierPopulationGrowth() {
    const frontier = this.state.frontier;
    frontier.populationGrowth ||= { remainder: 0 };
    const growthChance = 0.12 * happinessMultiplier(this.state.meta.estate.happiness);
    frontier.populationGrowth.remainder += growthChance;
    if (frontier.populationGrowth.remainder >= 1) {
      const gained = Math.floor(frontier.populationGrowth.remainder);
      frontier.populationGrowth.remainder -= gained;
      frontier.livingAreas.home_estate.residents += gained;
      frontier.population.total = totalFrontierPopulation(frontier);
      this.addFrontierEvent(`내 영지에 새 주민 ${gained}명이 늘었다.`, "good");
    }
  }

  moveAdventureStep(x, y) {
    const run = this.state.adventure?.run;
    const result = moveRunPlayer(run, x, y);
    if (!result.moved) return result;
    if (result.type === "encounter") this.addLog(`${result.feature.name} 조우. 개척자는 직접 조작하고 동료들은 자동으로 교전한다.`, "bad");
    if (result.type === "ambush") this.addLog(`${result.feature.name}! 비점령지 이동 중 불규칙 습격을 받았다.`, "bad");
    if (result.type === "dungeonEntrance") this.addLog(`${result.feature.name} 입구를 발견했다.`, "item");
    if (result.type === "settlement") this.addLog(`${result.feature.name} 입구에 도착했다. 부락 안으로 들어갈 수 있다.`, "item");
    if (result.type === "landmark") {
      run.cargo.scrap += 1;
      const region = WORLD_REGION_DEFS[run.regionId];
      run.cargo.materials[region.rewardMaterial] = (run.cargo.materials[region.rewardMaterial] || 0) + 1;
      this.addLog(`${result.feature.name} 조사 완료. 고철 1 · ${MATERIAL_DEFS[region.rewardMaterial]?.name || "지역 재료"} 1 확보.`, "good");
    }
    this.emit();
    return result;
  }

  enterAdventureDungeon() {
    const run = this.state.adventure?.run;
    if (!enterRunDungeon(run)) return false;
    const region = WORLD_REGION_DEFS[run.regionId];
    this.addLog(`${region.dungeonName} 진입. 좁은 통로에서 부대 간 교전이 벌어진다.`, "item");
    this.emit();
    return true;
  }

  enterAdventureSettlement() {
    const run = this.state.adventure?.run;
    const feature = enterRunSettlement(run);
    if (!feature) return false;
    const definition = livingAreaDefinitionForRegion(run.regionId);
    const livingArea = definition ? this.state.frontier?.livingAreas?.[definition.id] : null;
    if (livingArea) {
      livingArea.discovered = true;
      livingArea.lastEvent = `${feature.name}을 직접 방문해 생활권 후보지를 확인했다.`;
    }
    if (run.settlementVisit.firstVisit) {
      run.cargo.scrap += 1;
      this.addLog(`${feature.name}에 들어가 길과 우물터를 확인했다. 고철 1을 확보하고 생활권 후보지로 기록했다.`, "good");
    } else this.addLog(`${feature.name}에 다시 들어왔다. 부락 안에서는 이동 중 습격이 발생하지 않는다.`, "item");
    this.emit();
    return true;
  }

  leaveAdventureSettlement() {
    if (!leaveRunSettlement(this.state.adventure?.run)) return false;
    this.addLog("부락을 나와 지역 필드로 돌아왔다.", "item");
    this.emit();
    return true;
  }

  leaveAdventureDungeon() {
    const run = this.state.adventure?.run;
    if (!leaveRunDungeon(run)) return false;
    this.addLog("던전을 빠져나와 지역 필드로 복귀했다.", "item");
    this.emit();
    return true;
  }

  cancelAdventurePrompt() {
    const run = this.state.adventure?.run;
    if (!run) return false;
    run.pendingEntrance = false;
    run.pendingExit = false;
    run.pendingSettlement = null;
    this.emit();
    return true;
  }

  advanceRealtimeBattle(deltaMs) {
    const run = this.state.adventure?.run;
    if (!run?.battle) return "idle";
    if (run.battle.awaitingPlayerStart) return "waiting";
    const before = run.battle.status;
    const status = tickAutoBattle(run.battle, deltaMs);
    if (before === "active" && status !== "active") {
      const result = completeBattle(run);
      run.battle.resultRevealAt = Date.now() + 1000;
      this.addLog(result.title, status === "victory" ? "good" : "bad");
      this.emit(true);
    } else {
      this.emit(false);
    }
    return status;
  }

  confirmRealtimeBattleStart() {
    const battle = this.state.adventure?.run?.battle;
    if (!battle || battle.status !== "active" || !battle.awaitingPlayerStart) return false;
    battle.awaitingPlayerStart = false;
    this.addLog(`${battle.encounterName} 교전을 시작한다.`, "bad");
    this.emit();
    return true;
  }

  commandRealtimeBattle(command, targetId = null) {
    const battle = this.state.adventure?.run?.battle;
    if (battle?.awaitingPlayerStart) return false;
    if (!issueBattleCommand(battle, command, targetId)) return false;
    this.emit(false);
    return true;
  }

  moveRealtimePlayer(x, y) {
    const battle = this.state.adventure?.run?.battle;
    if (battle?.awaitingPlayerStart) return false;
    if (!moveBattlePlayer(battle, x, y)) return false;
    this.emit(false);
    return true;
  }

  steerRealtimePlayer(x, y) {
    const battle = this.state.adventure?.run?.battle;
    if (battle?.awaitingPlayerStart) return false;
    return steerBattlePlayer(battle, x, y);
  }

  targetRealtimeEnemy(targetId) {
    const battle = this.state.adventure?.run?.battle;
    if (battle?.awaitingPlayerStart) return false;
    if (!selectPlayerTarget(battle, targetId)) return false;
    this.emit(false);
    return true;
  }

  playerRealtimeAction(action) {
    const battle = this.state.adventure?.run?.battle;
    if (battle?.awaitingPlayerStart) return false;
    if (!issuePlayerAction(battle, action)) return false;
    if (battle.lastPlayerSkillId) this.gainSkillMastery(battle.lastPlayerSkillId);
    this.emit(false);
    return true;
  }

  continueAfterBattle() {
    const run = this.state.adventure?.run;
    if (!run?.battle || run.result?.type !== "battleVictory") return false;
    run.battle = null;
    run.result = null;
    this.emit();
    return true;
  }

  returnAdventureToEstate(reason = "retreat") {
    const adventure = this.state.adventure;
    const run = adventure?.run;
    if (!run) return false;
    const completed = run.status === "completed" || reason === "completed";
    const defeated = run.status === "defeated" || reason === "defeated";
    const ratio = defeated ? 0.5 : 1;
    const securedScrap = Math.floor(run.cargo.scrap * ratio);
    this.state.meta.scrap += securedScrap;
    const materialText = [];
    for (const [materialId, amount] of Object.entries(run.cargo.materials)) {
      const secured = Math.floor(amount * ratio);
      if (secured <= 0) continue;
      addMaterial(this.state.meta.materials, materialId, secured);
      materialText.push(`${MATERIAL_DEFS[materialId]?.name || materialId} ${secured}`);
    }
    const levelMessages = [];
    for (const [unitId, earnedXp] of Object.entries(run.unitXp || {})) {
      const progress = adventure.unitProgress[unitId] ||= { level: 1, xp: 0, secondaryId: null };
      progress.xp += Math.max(0, earnedXp);
      let needed = 8 + progress.level * 6;
      while (progress.xp >= needed) {
        progress.xp -= needed;
        progress.level += 1;
        levelMessages.push(`${UNIT_DEFS[unitId]?.name || unitId} Lv.${progress.level}`);
        needed = 8 + progress.level * 6;
      }
    }
    const commander = adventure.commander ||= { name: "개척자", level: 1, xp: 0 };
    commander.xp += Math.max(0, run.commanderXp || 0);
    let commanderNeeded = 10 + commander.level * 7;
    while (commander.xp >= commanderNeeded) {
      commander.xp -= commanderNeeded;
      commander.level += 1;
      levelMessages.unshift(`${commander.name} Lv.${commander.level}`);
      commanderNeeded = 10 + commander.level * 7;
    }
    let recruited = null;
    if (completed) {
      adventure.records[run.regionId].victories += 1;
      this.state.meta.victories += 1;
      this.state.meta.essence += 1;
      const region = WORLD_REGION_DEFS[run.regionId];
      recruited = region.recruits.find((unitId) => !adventure.roster.includes(unitId)) || null;
      if (recruited) {
        adventure.roster.push(recruited);
        adventure.unitProgress[recruited] = { level: 1, xp: 0, secondaryId: null };
      }
      const advancedTechnique = { north: "spirit", south: "alchemy", east: "tactics", west: "mana", central: "alchemy" }[run.regionId];
      if (advancedTechnique && !adventure.unlockedTechniques.includes(advancedTechnique)) adventure.unlockedTechniques.push(advancedTechnique);
      if (run.capturedBoss) commander.storedBoss = { ...run.capturedBoss };
    }
    this.resolveFrontierAdventure(run, completed, defeated);
    this.refreshFrontierSquads();
    const threatGain = Math.min(32, run.encountersWon * 4 + (completed ? 10 : 2));
    const defense = this.state.estateDefense;
    defense.threat = Math.min(100, defense.threat + threatGain);
    if (defense.threat >= 50 && !defense.pending) {
      const region = WORLD_REGION_DEFS[run.regionId];
      defense.pending = {
        regionId: run.regionId,
        encounterId: region.defenseEncounterId,
        title: `${region.direction} 개척로의 반격`,
        description: `${region.name}에서 밀려난 무리가 내 영지의 외곽 생산지를 향하고 있다.`
      };
    }
    adventure.run = null;
    advanceEstate(this.state, Math.max(1, run.encountersWon));
    this.addLog(`내 영지 귀환. 고철 ${securedScrap}${completed ? " · 지역 핵 1" : ""}${materialText.length ? ` · ${materialText.join(" · ")}` : ""}${recruited ? ` · ${UNIT_DEFS[recruited].name} 합류` : ""}${completed && run.capturedBoss ? ` · ${run.capturedBoss.name} 봉인 갱신` : ""}.`, "item");
    if (levelMessages.length) this.addLog(`성장: ${levelMessages.join(" · ")}`, "good");
    if (defense.pending) this.addLog(`경고: ${defense.pending.title}`, "bad");
    this.emit();
    return true;
  }

  togglePartyUnit(unitId) {
    const adventure = this.state.adventure;
    if (adventure.run || this.state.estateDefense?.battle || this.state.estateDefense?.campaign || !adventure.roster.includes(unitId) || !UNIT_DEFS[unitId]) return false;
    const index = adventure.party.indexOf(unitId);
    if (index >= 0) {
      if (adventure.party.length <= 1) return false;
      adventure.party.splice(index, 1);
    } else {
      if (adventure.party.length >= PARTY_LIMIT) return false;
      if (this.frontierUnitBusy(unitId)) return false;
      adventure.party.push(unitId);
    }
    this.refreshFrontierSquads();
    this.emit();
    return true;
  }

  assignUnitTechnique(unitId, techniqueId = null) {
    const adventure = this.state.adventure;
    if (adventure.run || this.state.estateDefense?.battle || this.state.estateDefense?.campaign || !adventure.roster.includes(unitId)) return false;
    if (techniqueId && (!SECONDARY_DEFS[techniqueId] || !adventure.unlockedTechniques.includes(techniqueId))) return false;
    const progress = adventure.unitProgress[unitId] ||= { level: 1, xp: 0, secondaryId: null };
    progress.secondaryId = techniqueId || null;
    this.addLog(`${UNIT_DEFS[unitId].name}: 보조 특성 ${techniqueId ? SECONDARY_DEFS[techniqueId].name : "해제"}`, "item");
    this.emit();
    return true;
  }

  trainUnit(unitId) {
    const adventure = this.state.adventure;
    if (adventure.run || this.state.estateDefense?.battle || this.state.estateDefense?.campaign || !adventure.roster.includes(unitId)) return false;
    const progress = adventure.unitProgress[unitId] ||= { level: 1, xp: 0, secondaryId: null };
    const cost = Math.max(2, progress.level * 2);
    if (this.state.meta.scrap < cost) return false;
    this.state.meta.scrap -= cost;
    progress.xp += 4;
    const needed = 8 + progress.level * 6;
    if (progress.xp >= needed) {
      progress.xp -= needed;
      progress.level += 1;
      this.addLog(`${UNIT_DEFS[unitId].name}이 Lv.${progress.level}로 성장했다.`, "good");
    } else {
      this.addLog(`${UNIT_DEFS[unitId].name} 훈련 완료. 경험 ${progress.xp}/${needed}`, "item");
    }
    this.emit();
    return true;
  }

  fortifyEstate() {
    const defense = this.state.estateDefense;
    if (this.state.adventure?.run || defense.battle || defense.campaign || this.state.meta.scrap < 3 || defense.fortification >= 5) return false;
    this.state.meta.scrap -= 3;
    defense.fortification += 1;
    defense.threat = Math.max(0, defense.threat - 8);
    this.addLog(`방어 시설 보강 ${defense.fortification}/5 · 위협도 감소`, "good");
    this.emit();
    return true;
  }

  // 영지 행복도·수평 컨텐츠: 축제를 열어 행복도를 즉시 끌어올리는 수동 이벤트 트리거.
  holdEstateFestival() {
    if (this.state.expedition || this.state.adventure?.run || this.state.estateDefense?.campaign) return false;
    const cost = { food: 4, scrap: 3 };
    if ((this.state.meta.materials.food || 0) < cost.food || this.state.meta.scrap < cost.scrap) return false;
    this.state.meta.materials.food -= cost.food;
    this.state.meta.scrap -= cost.scrap;
    const estate = this.state.meta.estate;
    estate.happiness = Math.min(100, (estate.happiness ?? 70) + 8);
    this.addLog(`영지 축제를 열었다. 행복도가 올랐다 (${estate.happiness}).`, "good");
    this.emit();
    return true;
  }

  defenseDeploymentBusy(unitId) {
    const deployments = this.state.estateDefense?.deployments;
    if (!deployments) return false;
    return Object.values(deployments.gates).some((unitIds) => unitIds.includes(unitId)) || deployments.remnants.includes(unitId);
  }

  assignDefenseGateUnit(unitId, gateId) {
    const defense = this.state.estateDefense;
    const adventure = this.state.adventure;
    const gateUnits = defense?.deployments?.gates?.[gateId];
    if (!defense?.pending || !adventure || !gateUnits || adventure.run || defense.battle || defense.campaign) return false;
    if (!adventure.roster.includes(unitId) || adventure.party.includes(unitId) || this.frontierUnitBusy(unitId, null, true)) return false;
    const alreadyHere = gateUnits.includes(unitId);
    for (const ids of Object.values(defense.deployments.gates)) {
      const index = ids.indexOf(unitId);
      if (index >= 0) ids.splice(index, 1);
    }
    if (!alreadyHere) {
      if (gateUnits.length >= GATE_GARRISON_LIMIT) return false;
      gateUnits.push(unitId);
    }
    this.addLog(`${UNIT_DEFS[unitId].name}: ${ESTATE_GATE_DEFS[gateId].name} ${alreadyHere ? "배치 해제" : "고정 수비 배치"}.`, "item");
    this.emit();
    return true;
  }

  assignDefenseRemnantUnit(unitId) {
    const defense = this.state.estateDefense;
    const adventure = this.state.adventure;
    const campaign = defense?.campaign;
    const canAssign = defense?.pending && !adventure?.run && !defense.battle && (!campaign || campaign.phase === "remnants");
    if (!canAssign || !adventure.roster.includes(unitId) || adventure.party.includes(unitId) || this.frontierUnitBusy(unitId, null, true)) return false;
    const assigned = defense.deployments.remnants;
    const index = assigned.indexOf(unitId);
    if (index >= 0) assigned.splice(index, 1);
    else {
      if (assigned.length >= REMNANT_TEAM_LIMIT) return false;
      assigned.push(unitId);
    }
    if (campaign?.phase === "remnants") campaign.remnants.assignedIds = [...assigned];
    this.addLog(`${UNIT_DEFS[unitId].name}: 내부 잔당 소탕 ${index >= 0 ? "배치 해제" : "대기조 배치"}.`, "item");
    this.emit();
    return true;
  }

  startEstateDefense() {
    const defense = this.state.estateDefense;
    const adventure = this.state.adventure;
    if (!defense.pending || defense.battle || defense.campaign || adventure.run || !adventure.party.length) return false;
    defense.campaign = createDefenseCampaign(defense.pending, defense.fortification, defense.deployments);
    defense.result = null;
    this.addLog(`${defense.pending.title} 다중 성문 방어 작전 개시. 기동대가 지원할 첫 성문을 선택한다.`, "bad");
    this.emit();
    return true;
  }

  enterEstateDefenseGate(gateId) {
    const defense = this.state.estateDefense;
    const adventure = this.state.adventure;
    const campaign = defense?.campaign;
    const gate = campaign?.gates?.[gateId];
    if (!campaign || campaign.phase !== "gates" || !gate || gate.status !== "underAttack" || defense.result) return false;
    if (campaign.activeGateId === gateId && defense.battle?.status === "active") return true;
    if (campaign.activeGateId && campaign.gates[campaign.activeGateId] && defense.battle) {
      campaign.gates[campaign.activeGateId].battle = defense.battle;
    }
    const defenders = [...new Set([...adventure.party, ...gate.garrisonIds])];
    gate.battle ||= createAutoBattle(
      defense.pending.encounterId,
      `estate-gate-${gateId}`,
      "defense-gate",
      defenders,
      adventure.unitProgress,
      {
        regionId: defense.pending.regionId,
        defense: true,
        commander: adventure.commander,
        partyLimit: 15,
        enemyCopies: gate.garrisonIds.length >= 5 ? 3 : 2
      }
    );
    for (const unit of gate.battle.units) unit.armor = Math.min(0.65, unit.armor + defense.fortification * 0.025);
    defense.battle = gate.battle;
    campaign.activeGateId = gateId;
    campaign.switches += 1;
    campaign.eventLog.unshift(`${ESTATE_GATE_DEFS[gateId].name}에 개척자 기동대가 합류했다. 고정 수비 ${gate.garrisonIds.length}명.`);
    campaign.eventLog = campaign.eventLog.slice(0, 12);
    this.addLog(`${ESTATE_GATE_DEFS[gateId].name} 지원 전투 개시`, "bad");
    this.emit();
    return true;
  }

  markEstateGateBreached(gateId, description) {
    const defense = this.state.estateDefense;
    const campaign = defense.campaign;
    const gate = campaign?.gates?.[gateId];
    if (!gate || gate.status === "breached" || defense.result) return false;
    gate.status = "breached";
    gate.durability = 0;
    campaign.breachedGateId = gateId;
    if (defense.battle?.status === "active") defense.battle.status = "defeat";
    defense.result = {
      type: "gateBreach",
      title: `${ESTATE_GATE_DEFS[gateId].name} 돌파`,
      description: description || "성문 내구도가 모두 소진되어 적이 영지 내부로 밀려들었다."
    };
    campaign.eventLog.unshift(`${ESTATE_GATE_DEFS[gateId].name} 붕괴. 전 병력이 내부 방어선으로 이동한다.`);
    this.addLog(defense.result.title, "bad");
    return true;
  }

  advanceEstateGatePressure(deltaMs) {
    const defense = this.state.estateDefense;
    const campaign = defense?.campaign;
    if (!campaign || campaign.phase !== "gates" || defense.result) return;
    campaign.elapsed += deltaMs;
    campaign.backgroundClock += deltaMs;
    while (campaign.backgroundClock >= 1000 && !defense.result) {
      campaign.backgroundClock -= 1000;
      const assault = 12 + Math.min(8, Math.floor(campaign.elapsed / 20000) * 2);
      for (const [gateId, gate] of Object.entries(campaign.gates)) {
        if (gate.status !== "underAttack") continue;
        const garrisonPower = groupDefensePower(gate.garrisonIds, this.state.adventure.unitProgress, UNIT_DEFS);
        const militiaPower = 20 + defense.fortification * 3;
        const mobilePower = campaign.activeGateId === gateId ? 24 : 0;
        const damage = Math.max(1, Math.round(assault - (garrisonPower + militiaPower + mobilePower) * 0.45));
        gate.durability = Math.max(0, gate.durability - damage);
        gate.damageTaken += damage;
        if (gate.durability <= 0) {
          this.markEstateGateBreached(gateId, `${ESTATE_GATE_DEFS[gateId].name}에 기동대가 도착하기 전 수비대가 무너졌다.`);
          break;
        }
      }
    }
  }

  advanceEstateDefense(deltaMs) {
    const defense = this.state.estateDefense;
    if (!defense.battle) return "idle";
    const before = defense.battle.status;
    const status = tickAutoBattle(defense.battle, deltaMs);
    if (defense.campaign?.phase === "gates") this.advanceEstateGatePressure(deltaMs);
    if (!defense.result && before === "active" && status !== "active") {
      if (defense.campaign?.phase === "gates") {
        const gateId = defense.campaign.activeGateId;
        if (status === "victory") {
          defense.result = {
            type: "gateHeld",
            title: `${ESTATE_GATE_DEFS[gateId].name} 방어 성공`,
            description: "이 성문의 공성 병력을 격퇴했다. 기동대는 전황 지도로 돌아가 다른 문을 지원할 수 있다."
          };
          this.addLog(defense.result.title, "good");
        } else this.markEstateGateBreached(gateId, "개척자 기동대와 고정 수비대가 밀려 성문이 무너졌다.");
      } else if (defense.campaign?.phase === "inner") {
        defense.result = status === "victory"
          ? { type: "innerVictory", title: "내부전장 방어 성공", description: "성 안으로 들어온 적의 주력을 격파했다. 숨어든 잔당을 찾아내는 마지막 소탕이 남았다." }
          : { type: "innerDefeat", title: "내부 방어선 붕괴", description: "주민 대피로는 지켰지만 창고와 생산 시설 일부를 포기해야 했다." };
        this.addLog(defense.result.title, status === "victory" ? "good" : "bad");
      }
      this.emit(true);
    } else this.emit(false);
    return status;
  }

  beginEstateInnerBattle() {
    const defense = this.state.estateDefense;
    const adventure = this.state.adventure;
    const campaign = defense?.campaign;
    if (!campaign || !campaign.breachedGateId) return false;
    campaign.phase = "inner";
    campaign.activeGateId = "inner";
    defense.result = null;
    defense.battle = createAutoBattle(
      defense.pending.encounterId,
      "estate-inner",
      "defense-inner",
      adventure.party,
      adventure.unitProgress,
      { regionId: defense.pending.regionId, defense: true, commander: adventure.commander, enemyCopies: 3, forceBoss: true }
    );
    for (const unit of defense.battle.units) unit.armor = Math.min(0.65, unit.armor + defense.fortification * 0.02);
    campaign.eventLog.unshift(`${ESTATE_GATE_DEFS[campaign.breachedGateId].name}에서 침입한 적과 내부전장 교전이 시작됐다.`);
    this.addLog("성문 돌파로 내부전장 전투가 시작됐다.", "bad");
    return true;
  }

  moveEstateDefenseToRemnants() {
    const defense = this.state.estateDefense;
    const campaign = defense?.campaign;
    if (!campaign) return false;
    campaign.phase = "remnants";
    campaign.activeGateId = null;
    campaign.remnants.assignedIds = [...defense.deployments.remnants];
    campaign.remnants.status = "waiting";
    defense.battle = null;
    defense.result = null;
    campaign.eventLog.unshift("주력은 격퇴했지만 민가·창고·하수로에 잔당이 흩어졌다. 소탕대를 투입해야 한다.");
    this.addLog("성내 잔당 소탕 단계로 전환됐다.", "item");
    return true;
  }

  commandEstateDefense(command, targetId = null) {
    const battle = this.state.estateDefense?.battle;
    if (!issueBattleCommand(battle, command, targetId)) return false;
    this.emit(false);
    return true;
  }

  moveDefensePlayer(x, y) {
    const battle = this.state.estateDefense?.battle;
    if (!moveBattlePlayer(battle, x, y)) return false;
    this.emit(false);
    return true;
  }

  steerDefensePlayer(x, y) {
    return steerBattlePlayer(this.state.estateDefense?.battle, x, y);
  }

  targetDefenseEnemy(targetId) {
    const battle = this.state.estateDefense?.battle;
    if (!selectPlayerTarget(battle, targetId)) return false;
    this.emit(false);
    return true;
  }

  playerDefenseAction(action) {
    const battle = this.state.estateDefense?.battle;
    if (!issuePlayerAction(battle, action)) return false;
    if (battle.lastPlayerSkillId) this.gainSkillMastery(battle.lastPlayerSkillId);
    this.emit(false);
    return true;
  }

  resolveEstateDefense() {
    const defense = this.state.estateDefense;
    if (!defense.battle || defense.battle.status === "active" || !defense.result) return false;
    const campaign = defense.campaign;
    if (!campaign) return false;
    if (defense.result.type === "gateBreach") {
      this.beginEstateInnerBattle();
      this.emit();
      return true;
    }
    if (defense.result.type === "gateHeld") {
      const gate = campaign.gates[campaign.activeGateId];
      gate.status = "held";
      gate.waveCleared = true;
      gate.battle = null;
      this.state.meta.scrap += Math.max(1, Math.floor(defense.battle.rewardScrap / 2));
      defense.battle = null;
      defense.result = null;
      campaign.activeGateId = null;
      if (Object.values(campaign.gates).every((entry) => entry.status === "held")) this.moveEstateDefenseToRemnants();
      this.emit();
      return true;
    }
    if (defense.result.type === "innerVictory") {
      this.state.meta.scrap += 4 + defense.battle.rewardScrap;
      this.moveEstateDefenseToRemnants();
      this.emit();
      return true;
    }
    if (defense.result.type === "innerDefeat") {
      campaign.phase = "resolved";
      campaign.finalResult = { success: false, title: "영지 피해 발생", description: "주민은 대피했지만 내부 방어선이 무너져 생산 자원을 잃었다." };
      defense.battle = null;
      defense.result = null;
      this.emit();
      return true;
    }
    return false;
  }

  resolveEstateRemnants() {
    const defense = this.state.estateDefense;
    const campaign = defense?.campaign;
    if (!campaign || campaign.phase !== "remnants") return false;
    const assigned = defense.deployments.remnants.filter((unitId) => this.state.adventure.roster.includes(unitId));
    const power = groupDefensePower(assigned, this.state.adventure.unitProgress, UNIT_DEFS);
    const required = campaign.breachedGateId ? 20 : 10;
    const success = power >= required;
    campaign.remnants.assignedIds = [...assigned];
    campaign.remnants.strength = required;
    campaign.remnants.status = success ? "cleared" : "escaped";
    campaign.remnants.result = { power: Math.round(power), required };
    campaign.phase = "resolved";
    campaign.finalResult = success
      ? { success: true, title: "영지 완전 방어", description: `소탕대 ${assigned.length}명이 성내 잔당까지 정리했다. 주민과 생산 시설이 일상으로 복귀한다.` }
      : { success: false, title: "잔당 소탕 실패", description: "주력은 막았지만 잔당이 창고와 작업장을 습격했다. 다음 방어에서는 전담 소탕대가 필요하다." };
    campaign.eventLog.unshift(`${success ? "잔당 소탕 완료" : "잔당 일부 도주"} · 소탕력 ${Math.round(power)}/${required}`);
    this.addLog(campaign.finalResult.title, success ? "good" : "bad");
    this.emit();
    return true;
  }

  finishEstateDefenseCampaign() {
    const defense = this.state.estateDefense;
    const campaign = defense?.campaign;
    if (!campaign || campaign.phase !== "resolved" || !campaign.finalResult) return false;
    if (campaign.finalResult.success) {
      defense.victories += 1;
      defense.threat = Math.max(0, defense.threat - 50);
      this.state.meta.scrap += 6;
      if (this.state.frontier?.estateSatisfaction) this.state.frontier.estateSatisfaction.safety = Math.min(100, this.state.frontier.estateSatisfaction.safety + 4);
      const estate = this.state.meta.estate;
      estate.happiness = Math.min(100, (estate.happiness ?? 70) + 5);
    } else {
      defense.threat = 28;
      this.state.meta.materials.wood = Math.max(0, (this.state.meta.materials.wood || 0) - 3);
      this.state.meta.materials.ore = Math.max(0, (this.state.meta.materials.ore || 0) - 2);
      if (this.state.frontier?.estateSatisfaction) this.state.frontier.estateSatisfaction.safety = Math.max(0, this.state.frontier.estateSatisfaction.safety - 6);
    }
    defense.pending = null;
    defense.battle = null;
    defense.result = null;
    defense.campaign = null;
    this.emit();
    return true;
  }

  classDefinition() {
    return CLASS_DEFS[this.state.meta.classId] || CLASS_DEFS.knight;
  }

  chargeClassResource(amount = 1) {
    const definition = this.classDefinition();
    this.state.player.classResource = Math.min(definition.resourceMax, (this.state.player.classResource || 0) + amount);
  }

  gainSkillMastery(skillId) {
    const current = this.state.meta.skillMastery[skillId] || 0;
    this.state.meta.skillMastery[skillId] = current + masteryGainMultiplier(this.state);
    return masteryLevel(this.state.meta.skillMastery[skillId]);
  }

  selectCommanderKit(kitId) {
    const adventure = this.state.adventure;
    const kit = PLAYER_KIT_DEFS[kitId];
    if (!adventure || adventure.run || this.state.expedition || this.state.estateDefense?.campaign || !kit) return false;
    const commander = adventure.commander;
    commander.combatKitId = kit.id;
    commander.skillLoadouts ||= {};
    commander.skillLoadouts[kit.id] ||= [...kit.defaultLoadout];
    this.addLog(`전투 전승 선택: ${kit.shortName}`, "item");
    this.emit();
    return true;
  }

  toggleCommanderSkill(skillId) {
    const adventure = this.state.adventure;
    if (!adventure || adventure.run || this.state.expedition || this.state.estateDefense?.campaign) return false;
    const commander = adventure.commander;
    const kit = playerKitDefinition(commander.combatKitId);
    if (!kit.skills.some((skill) => skill.id === skillId)) return false;
    commander.skillLoadouts ||= {};
    const loadout = normalizedPlayerLoadout(commander, kit.id, false);
    const index = loadout.indexOf(skillId);
    if (index >= 0) loadout.splice(index, 1);
    else {
      if (loadout.length >= 3) return false;
      loadout.push(skillId);
    }
    commander.skillLoadouts[kit.id] = loadout;
    this.emit();
    return true;
  }

  selectClass(classId) {
    if (this.state.expedition || this.state.adventure?.run || this.state.estateDefense?.campaign || !CLASS_DEFS[classId]) return false;
    this.state.meta.classId = classId;
    this.state.player.classResource = Math.min(2, CLASS_DEFS[classId].resourceMax);
    this.addLog(`전투 계통 선택: ${CLASS_DEFS[classId].name}`, "item");
    this.emit();
    return true;
  }

  selectTrait(traitId) {
    if (this.state.expedition || this.state.adventure?.run || this.state.estateDefense?.campaign || !TRAIT_DEFS[traitId]) return false;
    this.state.meta.traitId = traitId;
    this.addLog(`출신 특성 선택: ${TRAIT_DEFS[traitId].name}`, "item");
    this.emit();
    return true;
  }

  useClassSkill() {
    const { expedition, player } = this.state;
    if (!expedition || expedition.phase !== "active") return false;
    const classDef = this.classDefinition();
    const skill = classDef.skill;
    const readyAt = player.skillReadyAt?.[skill.id] || 0;
    if (player.classResource < skill.cost || player.turn < readyAt) return false;

    const previousLevel = masteryLevel(this.state.meta.skillMastery[skill.id] || 0);
    let resolved = false;
    if (classDef.id === "knight") {
      player.guard += 4 + previousLevel;
      const pressureId = AREA_DEFS[expedition.areaId]?.pressure?.id;
      if (pressureId) expedition.pressure[pressureId] = Math.max(0, expedition.pressure[pressureId] - 3 - previousLevel);
      this.addLog(`철벽 태세: 방어 ${4 + previousLevel}${pressureId ? ", 지역 압력 완화" : ""}.`, "good");
      resolved = true;
    }
    if (classDef.id === "barbarian") {
      const target = expedition.floor.enemies.find((enemy) => (
        enemy.hp > 0
        && distance(enemy, player) === 1
        && (!ENEMY_DEFS[enemy.defId].boss || expedition.beaconsActivated >= expedition.beaconGoal)
      ));
      if (!target) return false;
      const damage = 5 + previousLevel;
      target.active = true;
      target.hp -= damage;
      this.addLog(`파쇄 강타: ${ENEMY_DEFS[target.defId].name}에게 ${damage} 피해.`, "good");
      if (target.hp <= 0) this.killEnemy(target);
      resolved = true;
    }
    if (classDef.id === "mechanic") {
      const targets = expedition.floor.enemies
        .filter((enemy) => (
          enemy.hp > 0
          && isVisible(this.state, enemy.x, enemy.y)
          && (!ENEMY_DEFS[enemy.defId].boss || expedition.beaconsActivated >= expedition.beaconGoal)
        ))
        .sort((a, b) => distance(a, player) - distance(b, player));
      const target = targets[0];
      if (!target) return false;
      const damage = 4 + previousLevel;
      target.active = true;
      target.hp -= damage;
      this.addLog(`자동 포탑: ${ENEMY_DEFS[target.defId].name}에게 ${damage} 피해.`, "good");
      if (target.hp <= 0) this.killEnemy(target);
      resolved = true;
    }
    if (classDef.id === "martial") {
      const amount = 3 + Math.floor(previousLevel / 2);
      const healed = Math.min(amount, player.maxHp - player.hp);
      player.hp += healed;
      player.evasion = Math.max(1, player.evasion);
      for (const pressureId of Object.keys(expedition.pressure)) {
        expedition.pressure[pressureId] = Math.max(0, expedition.pressure[pressureId] - 3 - previousLevel);
      }
      this.addLog(`기혈 순환: 체력 ${healed} 회복, 회피 1, 환경 압력 완화.`, "good");
      resolved = true;
    }
    if (!resolved) return false;

    player.classResource -= skill.cost;
    player.skillReadyAt[skill.id] = player.turn + skill.cooldown + 1;
    const nextLevel = this.gainSkillMastery(skill.id);
    if (nextLevel > previousLevel) this.addLog(`${skill.name} 숙련도 ${nextLevel}단계 달성.`, "item");
    this.completePlayerTurn();
    return true;
  }

  playerAct(dx, dy) {
    const { expedition, player } = this.state;
    if (!expedition || expedition.phase !== "active") return false;
    const floor = expedition.floor;
    const target = { x: player.x + dx, y: player.y + dy };
    if (target.x < 0 || target.y < 0 || target.y >= floor.tiles.length || target.x >= floor.tiles[target.y].length) return false;
    if (floor.tiles[target.y][target.x] !== "floor") {
      this.addLog("무너진 벽이 길을 막고 있다.");
      this.emit();
      return false;
    }
    const enemy = this.enemyAt(target.x, target.y);
    if (enemy && ENEMY_DEFS[enemy.defId].boss && expedition.beaconsActivated < expedition.beaconGoal) {
      this.addLog(`보스의 장막이 공격을 튕겨낸다. 측량 거점 ${expedition.beaconGoal - expedition.beaconsActivated}개가 더 필요하다.`, "bad");
      this.emit();
      return false;
    }
    if (enemy) {
      this.attackEnemy(enemy);
      if (["knight", "barbarian", "martial"].includes(this.state.meta.classId)) this.chargeClassResource(1);
    } else {
      player.x = target.x;
      player.y = target.y;
      const movement = resolveBagTrigger(this.state, "move");
      for (const event of movement.events) this.addLog(event.text, event.tone);
      this.resolveFeature(target.x, target.y);
      if (["mechanic", "martial"].includes(this.state.meta.classId)) this.chargeClassResource(1);
    }
    this.completePlayerTurn();
    return true;
  }

  wait() {
    if (!this.state.expedition || this.state.expedition.phase !== "active") return false;
    this.addLog("숨을 고르고 적의 움직임을 살폈다.");
    this.completePlayerTurn();
    return true;
  }

  consumeRearrangeTurn(beforeFingerprint) {
    if (!this.state.expedition || this.state.expedition.phase !== "active") return false;
    if (beforeFingerprint === bagFingerprint(this.state.inventory)) return false;
    this.addLog("전투 중 가방을 다시 묶었다. 한 턴이 흘렀다.", "item");
    this.completePlayerTurn();
    return true;
  }

  attackEnemy(enemy) {
    enemy.active = true;
    const result = resolveBagTrigger(this.state, "attack", { damage: 1 });
    const totalDamage = result.damage + result.burn + result.shock;
    enemy.hp -= totalDamage;
    enemy.poison += result.poison;
    enemy.burn += result.burn > 0 ? 1 : 0;
    this.addLog(`${ENEMY_DEFS[enemy.defId].name}에게 피해 ${totalDamage}.`, "good");
    for (const event of result.events) this.addLog(event.text, event.tone);
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    const definition = ENEMY_DEFS[enemy.defId];
    const killEffects = resolveBagTrigger(this.state, "kill");
    const earned = definition.scrap + killEffects.bonusScrap;
    this.state.expedition.runScrap += earned;
    enemy.hp = 0;
    this.addLog(`${definition.name} 처치. 고철 +${earned}`, "good");
    for (const event of killEffects.events) this.addLog(event.text, event.tone);
    if (!definition.boss && Math.random() < 0.35) {
      const materialId = enemy.defId === "spore" ? "sporeGland" : enemy.defId === "raider" ? "blackSteel" : "ore";
      this.addCargoMaterial(materialId, 1);
      this.addLog(`원정 짐: ${MATERIAL_DEFS[materialId].name} +1`, "item");
    }
    this.state.expedition.floor.enemies = this.state.expedition.floor.enemies.filter((entry) => entry.hp > 0);
    if (definition.boss) this.finishExpedition();
  }

  addCargoMaterial(materialId, amount = 1) {
    if (!this.state.expedition) return;
    addMaterial(this.state.expedition.cargo.materials, materialId, amount);
  }

  addCargoBlueprint(recipeId) {
    if (!this.state.expedition) return false;
    if (this.state.meta.blueprints.includes(recipeId) || this.state.expedition.cargo.blueprints.includes(recipeId)) return false;
    this.state.expedition.cargo.blueprints.push(recipeId);
    return true;
  }

  secureCargo(materialRatio = 1) {
    const cargo = this.state.expedition?.cargo;
    if (!cargo) return { materials: [], blueprints: [] };
    const secured = { materials: [], blueprints: [] };
    for (const [materialId, amount] of Object.entries(cargo.materials)) {
      const kept = Math.floor(amount * materialRatio);
      if (kept <= 0) continue;
      addMaterial(this.state.meta.materials, materialId, kept);
      secured.materials.push(`${MATERIAL_DEFS[materialId]?.name || materialId} ${kept}`);
    }
    for (const recipeId of cargo.blueprints) {
      if (!this.state.meta.blueprints.includes(recipeId)) {
        this.state.meta.blueprints.push(recipeId);
        secured.blueprints.push(CRAFT_RECIPES.find((recipe) => recipe.id === recipeId)?.name || recipeId);
      }
    }
    cargo.materials = {};
    cargo.blueprints = [];
    return secured;
  }

  completePlayerTurn() {
    if (!this.state.expedition || this.state.expedition.phase !== "active") {
      this.emit();
      return;
    }
    this.state.player.turn += 1;
    this.state.expedition.floor.worldTurn = (this.state.expedition.floor.worldTurn || 0) + 1;
    const estateEvents = advanceEstate(this.state, 1);
    if (estateEvents.length) this.addLog(`영지 자동 생산 · ${estateEvents.join(" · ")}`, "item");
    this.applyEnvironment();
    if (this.state.expedition.phase !== "active") {
      this.emit();
      return;
    }
    this.enemyTurn();
    if (this.state.expedition?.phase === "active") revealFloor(this.state);
    this.emit();
  }

  getEnvironmentStatus() {
    const expedition = this.state.expedition;
    if (!expedition) return null;
    const area = AREA_DEFS[expedition.areaId] || AREA_DEFS.desert;
    const pressure = area.pressure;
    if (!pressure) return { area, pressure: null, rate: 0, mitigation: 0, gain: 0, value: 0 };
    const bossAwake = expedition.beaconGoal > 0 && expedition.beaconsActivated >= expedition.beaconGoal;
    const rate = pressure.rate + (bossAwake ? 1 : 0);
    const mitigation = environmentMitigation(this.state, pressure.id);
    return {
      area,
      pressure,
      rate,
      mitigation,
      gain: Math.max(0, rate - mitigation),
      value: expedition.pressure[pressure.id] || 0
    };
  }

  applyEnvironment() {
    const status = this.getEnvironmentStatus();
    if (!status?.pressure) return;
    const pressureValues = this.state.expedition.pressure;
    for (const pressureId of Object.keys(pressureValues)) {
      if (pressureId !== status.pressure.id && pressureValues[pressureId] > 0) pressureValues[pressureId] -= 1;
    }
    const previous = pressureValues[status.pressure.id];
    if (status.gain > 0) {
      pressureValues[status.pressure.id] += status.gain;
      if (previous === 0) {
        this.addLog(`${status.area.name}: ${status.pressure.name} 압력 +${status.gain}/턴. 대응 ${status.mitigation}.`, "bad");
      }
    } else if (pressureValues[status.pressure.id] > 0) {
      pressureValues[status.pressure.id] -= 1;
    }
    if (pressureValues[status.pressure.id] >= status.pressure.threshold) {
      pressureValues[status.pressure.id] -= status.pressure.threshold;
      this.addLog(`${status.pressure.name} 한계 초과! 환경 피해 3.`, "bad");
      this.receiveDamage(3);
    }
  }

  enemyTurn() {
    const { expedition, player } = this.state;
    if (!expedition || expedition.phase !== "active") return;
    const floor = expedition.floor;
    const enemies = [...floor.enemies];

    for (const enemy of enemies) {
      if (enemy.hp <= 0 || expedition.phase !== "active") continue;
      if (ENEMY_DEFS[enemy.defId].boss && expedition.beaconsActivated < expedition.beaconGoal) continue;
      if (!enemy.active && distance(enemy, player) > 7) continue;
      enemy.active = true;
      if (enemy.poison > 0) {
        enemy.hp -= 1;
        enemy.poison -= 1;
        this.addLog(`${ENEMY_DEFS[enemy.defId].name}: 중독 피해 1`, "good");
      }
      if (enemy.burn > 0 && enemy.hp > 0) {
        enemy.hp -= 1;
        enemy.burn -= 1;
        this.addLog(`${ENEMY_DEFS[enemy.defId].name}: 화상 피해 1`, "good");
      }
      if (enemy.hp <= 0) {
        this.killEnemy(enemy);
        continue;
      }

      const adjacent = distance(enemy, player) === 1;
      if (adjacent && enemy.intent === "strike") {
        this.receiveDamage(ENEMY_DEFS[enemy.defId].damage, enemy);
        enemy.intent = "recover";
        continue;
      }
      if (adjacent) {
        enemy.intent = "strike";
        this.addLog(`${ENEMY_DEFS[enemy.defId].name}이 공격을 준비한다!`, "bad");
        continue;
      }
      if (enemy.intent === "strike") {
        enemy.intent = "pursue";
        this.addLog(`${ENEMY_DEFS[enemy.defId].name}의 공격이 허공을 갈랐다.`, "good");
        continue;
      }
      if (enemy.intent === "recover") {
        enemy.intent = "pursue";
        continue;
      }

      const blocked = new Set(floor.enemies.filter((entry) => entry.id !== enemy.id && entry.hp > 0).map((entry) => keyOf(entry.x, entry.y)));
      const step = pathStepToward(floor.tiles, enemy, player, blocked);
      if (!(step.x === player.x && step.y === player.y)) {
        enemy.x = step.x;
        enemy.y = step.y;
      }
      if (distance(enemy, player) === 1) enemy.intent = "strike";
    }
  }

  receiveDamage(amount, source = null) {
    if (this.state.player.evasion > 0) {
      this.state.player.evasion -= 1;
      this.addLog("장화의 회피로 공격을 피했다.", "good");
      return 0;
    }
    const defense = resolveBagTrigger(this.state, "hurt", { block: 0 });
    for (const event of defense.events) this.addLog(event.text, event.tone);
    const totalBlock = defense.block + this.state.player.guard;
    this.state.player.guard = 0;
    const damage = Math.max(0, amount - totalBlock);
    this.state.player.hp -= damage;
    if (this.state.meta.classId === "knight" && totalBlock > 0) this.chargeClassResource(1);
    if (this.state.meta.classId === "barbarian" && damage > 0) this.chargeClassResource(2);
    const attacker = source ? ENEMY_DEFS[source.defId].name : "환경";
    this.addLog(`${attacker}의 공격: 피해 ${damage}${totalBlock ? ` · 방어 ${totalBlock}` : ""}`, damage ? "bad" : "good");
    if (this.state.player.hp <= 0) {
      this.state.player.hp = 0;
      this.state.expedition.phase = "defeated";
      this.addLog("원정에 실패했다. 확보하지 못한 고철 일부를 잃는다.", "bad");
    }
    return damage;
  }

  resolveFeature(x, y) {
    const { expedition, player } = this.state;
    const feature = expedition.floor.features[keyOf(x, y)];
    if (!feature) return;
    if (feature.type === "hazard") {
      const pressureId = feature.pressureId || AREA_DEFS[expedition.areaId]?.pressure?.id || "toxin";
      const mitigation = environmentMitigation(this.state, pressureId);
      const damage = Math.max(0, 2 - Math.floor(mitigation / 2));
      if (damage > 0) this.receiveDamage(damage);
      const pressureName = AREA_DEFS[expedition.areaId]?.pressure?.name || "환경 위험";
      this.addLog(damage ? `${pressureName} 지형 피해 ${damage}.` : "환경 장비로 위험 지형을 막았다.", damage ? "bad" : "good");
    }
    if (feature.type === "estateNode" && !feature.collected) {
      feature.collected = true;
      if (feature.materialId) {
        addMaterial(this.state.meta.materials, feature.materialId, 1);
        this.addLog(`${feature.name} 순찰 완료: ${MATERIAL_DEFS[feature.materialId].name} +1`, "good");
      } else {
        this.addLog(`${feature.name} 순찰 완료. 영지 외곽은 안전하다.`, "good");
      }
    }
    if (feature.type === "estateHall") {
      this.addLog("개척 영주관에 도착했다. 뒤로 버튼으로 영지 관리 화면을 열 수 있다.", "item");
    }
    if (feature.type === "cache" && !feature.opened) {
      feature.opened = true;
      const hasCharmToolLink = this.state.inventory.some((item) => (
        item.x >= 0 && item.defId === "scavengerCharm" && hasAdjacentTag(this.state.inventory, item.uid, "tool")
      ));
      const scrap = hasCharmToolLink ? 4 : 3;
      expedition.runScrap += scrap;
      expedition.lootFound += 1;
      const area = AREA_DEFS[expedition.areaId] || AREA_DEFS.desert;
      const regionMaterial = area.rareMaterial;
      this.addCargoMaterial(regionMaterial, 1);
      const candidates = CRAFT_RECIPES.filter((recipe) => (
        recipe.classId === this.state.meta.classId || recipe.source === area.blueprintSource
      ));
      const blueprint = candidates.find((recipe) => this.addCargoBlueprint(recipe.id));
      const blueprintText = blueprint ? ` · 설계도 [${blueprint.name}]` : "";
      this.addLog(`보급함: ${MATERIAL_DEFS[regionMaterial].name} +1${blueprintText} · 고철 +${scrap}`, "item");
    }
    if (feature.type === "camp" && !feature.used) {
      feature.used = true;
      const healed = Math.min(5, player.maxHp - player.hp);
      player.hp += healed;
      this.state.meta.scrap += expedition.runScrap;
      const cargo = this.secureCargo(1);
      const cargoText = [...cargo.materials, ...cargo.blueprints.map((name) => `설계도 ${name}`)].join(", ");
      this.addLog(`야영지 확보: 체력 ${healed} 회복, 고철 ${expedition.runScrap} 보관${cargoText ? ` · ${cargoText}` : ""}.`, "good");
      expedition.runScrap = 0;
    }
    if (feature.type === "beacon" && !feature.activated) {
      feature.activated = true;
      expedition.beaconsActivated += 1;
      this.state.meta.bestBeacons = Math.max(this.state.meta.bestBeacons, expedition.beaconsActivated);
      expedition.runScrap += 2;
      const healed = Math.min(2, player.maxHp - player.hp);
      player.hp += healed;
      const seen = new Set(expedition.floor.seen);
      for (let revealY = y - 5; revealY <= y + 5; revealY += 1) {
        for (let revealX = x - 5; revealX <= x + 5; revealX += 1) {
          if (revealY >= 0 && revealX >= 0 && revealY < expedition.floor.tiles.length && revealX < expedition.floor.tiles[revealY].length) {
            seen.add(keyOf(revealX, revealY));
          }
        }
      }
      expedition.floor.seen = [...seen];
      const record = this.state.meta.areaRecords[expedition.areaId];
      record.bestSurvey = Math.max(record.bestSurvey, expedition.beaconsActivated);
      this.addLog(`측량 거점 재가동 ${expedition.beaconsActivated}/${expedition.beaconGoal} · 고철 +2${healed ? ` · 체력 +${healed}` : ""}`, "good");
      if (expedition.beaconsActivated >= expedition.beaconGoal) {
        this.addLog("모든 신호가 연결됐다. 보스의 장막이 사라졌다!", "item");
      }
    }
    if (feature.type === "core" && expedition.beaconsActivated < expedition.beaconGoal) {
      this.addLog(`장막이 길을 막는다. 측량 거점 ${expedition.beaconGoal - expedition.beaconsActivated}개가 더 필요하다.`, "bad");
    }
  }

  finishExpedition() {
    const expedition = this.state.expedition;
    if (!expedition || expedition.phase !== "active") return;
    expedition.phase = "victory";
    expedition.runEssence += 1;
    this.state.meta.victories += 1;
    const area = AREA_DEFS[expedition.areaId] || AREA_DEFS.desert;
    const record = this.state.meta.areaRecords[area.id];
    record.victories += 1;
    record.bestSurvey = Math.max(record.bestSurvey, expedition.beaconGoal);
    this.state.meta.bestBeacons = Math.max(this.state.meta.bestBeacons, expedition.beaconGoal);
    if (area.bossMaterial) this.addCargoMaterial(area.bossMaterial, 1);
    if (area.bossBlueprint) this.addCargoBlueprint(area.bossBlueprint);
    if (!this.state.inventory.some((item) => item.defId === "scavengerCharm")) {
      this.state.inventory.push(createItem("scavengerCharm", createUid(this.state)));
    }
    this.addLog(`${ENEMY_DEFS[area.bossDefId].name} 격파. 희귀 재료와 설계도를 원정 짐에 확보했다.`, "item");
  }

  enemyAt(x, y) {
    return this.state.expedition?.floor.enemies.find((enemy) => enemy.hp > 0 && enemy.x === x && enemy.y === y) || null;
  }

  isTileVisible(x, y) {
    return isVisible(this.state, x, y);
  }

  returnToHub(reason = "retreat") {
    const expedition = this.state.expedition;
    if (!expedition) return;
    let securedScrap = expedition.runScrap;
    let securedEssence = expedition.runEssence;
    if (reason === "defeated") {
      securedScrap = Math.floor(securedScrap / 2);
      securedEssence = 0;
    }
    const cargo = this.secureCargo(reason === "defeated" ? 0.5 : 1);
    this.state.meta.scrap += securedScrap;
    this.state.meta.essence += securedEssence;
    this.state.expedition = null;
    this.state.player.hp = this.state.player.maxHp;
    this.state.player.guard = 0;
    this.state.player.evasion = 0;
    const cargoText = [...cargo.materials, ...cargo.blueprints.map((name) => `설계도 ${name}`)].join(", ");
    this.addLog(`공방 귀환. 고철 ${securedScrap}${securedEssence ? ` · 핵 ${securedEssence}` : ""}${cargoText ? ` · ${cargoText}` : ""} 확보.`, "item");
    this.emit();
  }

  purchaseResearch(researchId) {
    const definition = RESEARCH_DEFS.find((entry) => entry.id === researchId);
    if (this.state.expedition || this.state.adventure?.run || this.state.estateDefense?.campaign || !definition || this.state.meta.research.includes(researchId)) return false;
    if (this.state.meta.scrap < definition.cost) return false;
    this.state.meta.scrap -= definition.cost;
    this.state.meta.research.push(researchId);
    if (definition.type === "bag") {
      this.state.meta.bagRows = Math.min(5, this.state.meta.bagRows + 1);
    } else {
      if (!this.state.meta.blueprints.includes(definition.itemDefId)) this.state.meta.blueprints.push(definition.itemDefId);
    }
    this.addLog(`연구 완료: ${definition.name}${definition.type === "bag" ? "" : " 설계도 해금"}`, "item");
    this.emit();
    return true;
  }

  hireWorker(workerId) {
    const definition = WORKER_DEFS[workerId];
    if (this.state.expedition || this.state.adventure?.run || this.state.estateDefense?.campaign || !definition || workerId === "steward") return false;
    const current = this.state.meta.estate.workers[workerId] || 0;
    if (activeWorkerCount(this.state, workerId) >= definition.max || this.state.meta.scrap < definition.cost) return false;
    this.state.meta.scrap -= definition.cost;
    this.state.meta.estate.workers[workerId] = current + 1;
    this.addLog(`${definition.name} 고용 완료. 자동 생산 인원 ${current + 1}명.`, "item");
    this.emit();
    return true;
  }

  craftRecipe(recipeId, random = Math.random) {
    const recipe = CRAFT_RECIPES.find((entry) => entry.id === recipeId);
    if (this.state.expedition || this.state.adventure?.run || this.state.estateDefense?.campaign || !recipe || activeWorkerCount(this.state, "blacksmith") < 1) return false;
    if (!this.state.meta.blueprints.includes(recipe.id)) return false;
    if (recipe.requiresCompanionId && !this.state.meta.estate.productionCompanions[recipe.requiresCompanionId]) return false;
    const costs = adjustedWorkerMaterialCosts(this.state, "blacksmith", recipe.materials);
    for (const [materialId, amount] of Object.entries(costs)) {
      if ((this.state.meta.materials[materialId] || 0) < amount) return false;
    }
    adjustedWorkerMaterialCosts(this.state, "blacksmith", recipe.materials, true);
    for (const [materialId, amount] of Object.entries(costs)) this.state.meta.materials[materialId] -= amount;
    const isAlchemy = Boolean(ITEM_DEFS[recipe.itemDefId].tags?.includes("alchemy"));
    const bonusCompanionId = isAlchemy ? "alchemist" : "masterSmith";
    const bonusCompanion = PRODUCTION_COMPANION_DEFS[bonusCompanionId];
    const craftBonus = this.state.meta.estate.productionCompanions[bonusCompanionId]
      ? { qualityBonus: bonusCompanion.qualityBonus, bonusAffixChance: bonusCompanion.bonusAffixChance }
      : {};
    const item = createCraftedItem(recipe.itemDefId, createUid(this.state), random, craftBonus);
    this.state.inventory.push(item);
    const affixes = item.affixes.map((affixId) => AFFIX_DEFS[affixId].name).join(" · ");
    this.addLog(`제작 완료: ${ITEM_DEFS[item.defId].name} 품질 ${item.quality}${affixes ? ` · ${affixes}` : ""}`, "item");
    // 영지 행복도가 높을수록 대장장이 숙련(=재료 절감·산출 보너스로 이어지는 "제작 속도")이 더 빨리 쌓인다.
    const work = recordWorkerWork(this.state, "blacksmith", (recipe.workHours || 4) * happinessMultiplier(this.state.meta.estate?.happiness));
    if (work.advanced) this.addLog(`대장장이 직종 숙련이 ${work.current.name} 단계에 도달했다.`, "good");
    this.emit();
    return item;
  }

  // free: true면 비용을 건너뛴다 (지역 부락 친목도 임계치의 "장인 파견" 보상 등, 슬롯 상한 체크는 그대로 적용).
  recruitProductionCompanion(companionId, { free = false } = {}) {
    const definition = PRODUCTION_COMPANION_DEFS[companionId];
    if (this.state.expedition || this.state.adventure?.run || this.state.estateDefense?.campaign || !definition) return false;
    if (this.state.meta.estate.productionCompanions[companionId]) return false;
    if (activeWorkerCount(this.state, definition.workerId) >= WORKER_DEFS[definition.workerId].max) return false;
    if (!free) {
      if (this.state.meta.scrap < definition.cost) return false;
      this.state.meta.scrap -= definition.cost;
    }
    this.state.meta.estate.productionCompanions[companionId] = true;
    for (const recipeId of definition.recipeIds || []) {
      if (!this.state.meta.blueprints.includes(recipeId)) this.state.meta.blueprints.push(recipeId);
    }
    this.addLog(`${definition.name} 합류. ${WORKER_DEFS[definition.workerId].name} 직종에 전속 배치됐다.`, "item");
    this.emit();
    return true;
  }

  purchaseRune(runeId) {
    const definition = RUNE_DEFS[runeId];
    const commander = this.state.adventure.commander;
    if (this.state.adventure?.run || this.state.estateDefense?.campaign || !definition) return false;
    if (commander.runesOwned.includes(runeId)) return false;
    if (this.state.meta.scrap < definition.cost) return false;
    this.state.meta.scrap -= definition.cost;
    commander.runesOwned.push(runeId);
    this.addLog(`${definition.name} 획득.`, "item");
    this.emit();
    return true;
  }

  equipRune(runeId) {
    const commander = this.state.adventure.commander;
    if (this.state.adventure?.run || this.state.estateDefense?.campaign) return false;
    if (runeId !== null && !commander.runesOwned.includes(runeId)) return false;
    commander.equippedRuneId = runeId;
    this.addLog(runeId ? `${RUNE_DEFS[runeId].name} 장착.` : "룬 해제.", "item");
    this.emit();
    return true;
  }

  // 설계도(unlockedWeaponBlueprints)를 지역 부락 친목도로 습득한 뒤, 재료를
  // 소모해 실제로 제작(weaponsOwned)하는 단계. 룬은 고철로 바로 구매하지만
  // 무기는 설계도 선행 습득이 필요하다는 점만 다르고 나머지 습득/장착 2단계
  // 구조는 룬과 동일하다.
  craftWeapon(weaponId) {
    const definition = WEAPON_DEFS[weaponId];
    const commander = this.state.adventure.commander;
    if (this.state.adventure?.run || this.state.estateDefense?.campaign || !definition) return false;
    if (!commander.unlockedWeaponBlueprints.includes(weaponId)) return false;
    if (commander.weaponsOwned.includes(weaponId)) return false;
    for (const [materialId, amount] of Object.entries(definition.materials)) {
      if ((this.state.meta.materials[materialId] || 0) < amount) return false;
    }
    for (const [materialId, amount] of Object.entries(definition.materials)) {
      this.state.meta.materials[materialId] -= amount;
    }
    commander.weaponsOwned.push(weaponId);
    this.addLog(`${definition.name} 제작 완료.`, "item");
    this.emit();
    return true;
  }

  equipWeapon(weaponId) {
    const commander = this.state.adventure.commander;
    if (this.state.adventure?.run || this.state.estateDefense?.campaign) return false;
    if (weaponId !== null) {
      const definition = WEAPON_DEFS[weaponId];
      if (!definition || !commander.weaponsOwned.includes(weaponId)) return false;
      const kit = playerKitDefinition(commander.combatKitId);
      if (definition.baseClassId !== kit.baseClassId) return false;
    }
    commander.equippedWeaponId = weaponId;
    this.addLog(weaponId ? `${WEAPON_DEFS[weaponId].name} 장착.` : "무기 해제.", "item");
    this.emit();
    return true;
  }

  placeInventoryItem(uid, x, y, rotation) {
    const placed = placeItem(this.state.inventory, uid, x, y, rotation, this.state.meta.bagRows);
    if (placed) this.emit();
    return placed;
  }

  removeInventoryItem(uid) {
    const removed = removeItem(this.state.inventory, uid);
    if (removed) this.emit();
    return removed;
  }

  useInventoryItem(uid) {
    if (!this.state.expedition || this.state.expedition.phase !== "active") return false;
    const result = useHerbKit(this.state, uid);
    if (!result) return false;
    this.addLog(result.text, "good");
    this.completePlayerTurn();
    return true;
  }

  getLinkedUids(uid) {
    return synergyItemUids(this.state.inventory, uid);
  }

  getBagFingerprint() {
    return bagFingerprint(this.state.inventory);
  }

  snapshot() {
    return clone(this.state);
  }
}

export { SAVE_KEY };
