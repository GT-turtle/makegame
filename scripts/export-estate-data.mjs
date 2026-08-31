import { writeFileSync } from "node:fs";
import {
  AFFIX_DEFS,
  CRAFT_RECIPES,
  HERB_IDS,
  ITEM_DEFS,
  MATERIAL_DEFS,
  ORE_SMELTING_DEFS,
  PRODUCTION_COMPANION_DEFS,
  RESEARCH_DEFS,
  WORKER_DEFS,
  WORKER_PROFICIENCY_TIERS
} from "../src/data.js";
import {
  DISCOVERY_SITE_DEFS,
  FRONTIER_ZONE_DEFS,
  LIVING_AREA_DEFS,
  MERCHANT_PRICE_BOUNDS,
  MERCHANT_ROTATION_INTERVAL,
  MERCHANT_STOCK_SIZE,
  LEADER_RECOVERY_CYCLES,
  TROOP_RECOVERY_CYCLES,
  TROOP_SPECIES_MATCHUP,
  TROOP_TYPE_DEFS,
  VILLAGE_FRIENDSHIP_GAIN,
  VILLAGE_MILESTONE_THRESHOLDS,
  VILLAGE_TRADE_PRICE,
  ZONE_TIER_DEFS
} from "../src/frontier.js";
import { ENCOUNTER_DEFS, ENEMY_COMBATANTS, UNIT_DEFS, WORLD_REGION_DEFS } from "../src/adventure.js";
import { SAVE_VERSION } from "../src/core.js";

// 세부 점령지 종류별로 자동 보급되는 병종 (src/game.js SITE_TROOP_TYPE — export되지 않는 내부 상수라 이곳에 그대로 옮겨온다).
const SITE_TROOP_TYPE = {
  mine: "infantry", deepMine: "cavalry", herb: "archer", rareHerb: "archer",
  lumber: "infantry", manaWell: "archer", runeCircle: "archer", glassPit: "cavalry",
  caravan: "cavalry", ruin: "infantry"
};

// 지역 부락 친목도 임계치(30/60/90) 보상 (src/game.js VILLAGE_MILESTONE_REWARDS — 마찬가지로 내부 상수).
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

// game.js의 regionSpeciesMix()를 그대로 재현: 지역 enemyPool -> 조우 -> 몬스터 종족 비율.
// 분대 병력 상성 계산(troopMatchupMultiplier)에 쓰이는 값을 미리 계산해 내보낸다 (Unity 쪽은
// 전투 조우/몬스터 테이블 전체를 이식하지 않으므로, 이 비율표만 데이터로 이식한다).
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

const materials = Object.values(MATERIAL_DEFS).map((m) => ({
  id: m.id, name: m.name, glyph: m.glyph, category: m.category,
  symbol: m.symbol || "", common: Boolean(m.common), refined: Boolean(m.refined), description: m.description
}));

const oreSmelting = Object.entries(ORE_SMELTING_DEFS).map(([oreId, yields]) => ({
  oreId,
  outputs: Object.entries(yields).map(([materialId, ratio]) => ({ materialId, ratio }))
}));

const workers = Object.values(WORKER_DEFS).map((w) => ({ id: w.id, name: w.name, cost: w.cost, max: w.max }));

const workerProficiencyTiers = WORKER_PROFICIENCY_TIERS.map((t) => ({
  id: t.id, name: t.name, hours: t.hours, yieldBonus: t.yieldBonus, materialSaving: t.materialSaving, speedBonus: t.speedBonus
}));

const craftRecipes = CRAFT_RECIPES.map((r) => ({
  id: r.id, itemDefId: r.itemDefId, name: r.name,
  materials: Object.entries(r.materials).map(([materialId, amount]) => ({ materialId, amount })),
  classId: r.classId || "", source: r.source || "", researchId: r.researchId || "",
  requiresCompanionId: r.requiresCompanionId || "",
  isAlchemy: Boolean(ITEM_DEFS[r.itemDefId]?.tags?.includes("alchemy"))
}));

const productionCompanions = Object.values(PRODUCTION_COMPANION_DEFS).map((c) => ({
  id: c.id, workerId: c.workerId, name: c.name, cost: c.cost,
  yieldBonus: c.yieldBonus || 0, speedBonus: c.speedBonus || 0, materialSaving: c.materialSaving || 0,
  qualityBonus: c.qualityBonus || 0, bonusAffixChance: c.bonusAffixChance || 0,
  recipeIds: c.recipeIds || [], alchemyOnly: Boolean(c.alchemyOnly)
}));

const researchDefs = RESEARCH_DEFS.map((r) => ({
  id: r.id, name: r.name, cost: r.cost, itemDefId: r.itemDefId || "", type: r.type || ""
}));

const affixDefs = Object.values(AFFIX_DEFS).map((a) => ({
  id: a.id, name: a.name, attack: a.attack || 0, block: a.block || 0,
  environmentAll: a.environmentAll || 0, masteryBonus: a.masteryBonus || 0
}));

const zoneTierDefs = Object.values(ZONE_TIER_DEFS).map((t) => ({
  id: t.id, baseRisk: t.baseRisk, discoveryGain: t.discoveryGain, suppressionInterval: t.suppressionInterval
}));

const frontierZones = Object.values(FRONTIER_ZONE_DEFS).map((z) => ({
  id: z.id, regionId: z.regionId, name: z.name, tier: z.tier,
  requirements: z.requirements || [], requireAny: Boolean(z.requireAny), neighbors: z.neighbors || [],
  sitePool: z.sitePool || [], bossEncounterId: z.bossEncounterId || ""
}));

const livingAreas = Object.values(LIVING_AREA_DEFS).map((a) => ({
  id: a.id, regionId: a.regionId, name: a.name, kind: a.kind, unlockZoneId: a.unlockZoneId || "",
  capacity: a.capacity, foundingResidents: a.foundingResidents,
  build: Object.entries(a.build || {}).map(([materialId, amount]) => ({ materialId, amount }))
}));

const discoverySites = Object.values(DISCOVERY_SITE_DEFS).map((s) => ({
  id: s.id, name: s.name, materialId: s.materialId || "",
  materialByRegion: Object.entries(s.materialByRegion || {}).map(([regionId, materialId]) => ({ regionId, materialId })),
  output: s.output, workers: s.workers,
  build: Object.entries(s.build || {}).map(([materialId, amount]) => ({ materialId, amount })),
  risk: s.risk, dungeon: Boolean(s.dungeon)
}));

const troopTypes = Object.values(TROOP_TYPE_DEFS).map((t) => ({ id: t.id, name: t.name, basePower: t.basePower }));

const troopSpeciesMatchup = Object.entries(TROOP_SPECIES_MATCHUP).map(([species, matchup]) => ({
  species, infantry: matchup.infantry, archer: matchup.archer, cavalry: matchup.cavalry
}));

const companionUnits = Object.values(UNIT_DEFS).map((u) => ({
  id: u.id, name: u.name, regionId: u.regionId, role: u.role,
  commandAura: u.commandAura || 0, partyArmor: u.partyArmor || 0
}));

const regionSpeciesMixEntries = Object.keys(WORLD_REGION_DEFS).map((regionId) => ({
  regionId,
  species: Object.entries(regionSpeciesMix(regionId)).map(([species, ratio]) => ({ species, ratio }))
}));

const worldRegions = Object.values(WORLD_REGION_DEFS).map((r) => ({ id: r.id, villageName: r.villageName }));

const villageMilestoneRewards = Object.entries(VILLAGE_MILESTONE_REWARDS).flatMap(([regionId, byThreshold]) => (
  Object.entries(byThreshold).map(([threshold, reward]) => ({
    regionId, threshold: Number(threshold), type: reward.type,
    companionId: reward.companionId || "", recipeId: reward.recipeId || ""
  }))
));

const siteTroopTypes = Object.entries(SITE_TROOP_TYPE).map(([siteId, troopType]) => ({ siteId, troopType }));

const herbIds = [...HERB_IDS];

const constants = {
  merchantRotationInterval: MERCHANT_ROTATION_INTERVAL,
  merchantStockSize: MERCHANT_STOCK_SIZE,
  merchantPriceMin: MERCHANT_PRICE_BOUNDS.min,
  merchantPriceMax: MERCHANT_PRICE_BOUNDS.max,
  villageMilestoneThresholds: VILLAGE_MILESTONE_THRESHOLDS,
  villageTradePrice: VILLAGE_TRADE_PRICE,
  villageFriendshipGain: VILLAGE_FRIENDSHIP_GAIN,
  troopRecoveryCycles: TROOP_RECOVERY_CYCLES,
  leaderRecoveryCycles: LEADER_RECOVERY_CYCLES,
  saveVersion: SAVE_VERSION
};

const payload = {
  materials, oreSmelting, workers, workerProficiencyTiers, craftRecipes, productionCompanions,
  researchDefs, affixDefs, zoneTierDefs, frontierZones, livingAreas, discoverySites, troopTypes,
  troopSpeciesMatchup, companionUnits, regionSpeciesMixEntries, worldRegions, villageMilestoneRewards,
  siteTroopTypes, herbIds, constants
};

writeFileSync(new URL("../unity-export/estate-data.json", import.meta.url), JSON.stringify(payload, null, 2), "utf8");
console.log("wrote unity-export/estate-data.json");
