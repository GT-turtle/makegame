export const ZONE_TIER_DEFS = {
  safe: { id: "safe", name: "안전", glyph: "●", color: "#78b58a", baseRisk: 12, discoveryGain: 34, suppressionInterval: 4 },
  watch: { id: "watch", name: "주의", glyph: "◆", color: "#d0aa63", baseRisk: 28, discoveryGain: 27, suppressionInterval: 3 },
  danger: { id: "danger", name: "위험", glyph: "▲", color: "#d16e63", baseRisk: 46, discoveryGain: 21, suppressionInterval: 2 }
};

export const FRONTIER_ZONE_DEFS = {
  north_fir: {
    id: "north_fir", regionId: "north", name: "침엽수 구릉", tier: "safe", factionId: "frost_march",
    hex: { col: 2, row: 1 },
    description: "내 영지에서 북부로 이어지는 첫 산길. 모피와 목재를 노리는 작은 무리가 배회한다.",
    requirements: [], neighbors: ["north_river", "north_pass"], sitePool: ["lumber", "herb", "cave", "ruin"], bossEncounterId: "frostWolves"
  },
  north_river: {
    id: "north_river", regionId: "north", name: "얼어붙은 강변", tier: "safe", factionId: "frost_march",
    hex: { col: 1, row: 2 },
    description: "얕은 얼음 아래 수원과 약초 군락이 남아 있다.",
    requirements: ["north_fir"], neighbors: ["north_fir", "north_gorge"], sitePool: ["herb", "lumber", "dungeon"], bossEncounterId: "iceRaiders"
  },
  north_pass: {
    id: "north_pass", regionId: "north", name: "백풍 고개", tier: "watch", factionId: "frost_march",
    hex: { col: 3, row: 2 },
    description: "북부 광산 영주의 순찰대와 빙철 약탈자가 같은 길을 두고 충돌한다.",
    requirements: ["north_fir"], neighbors: ["north_fir", "north_gorge", "north_mine"], sitePool: ["mine", "ruin", "dungeon"], bossEncounterId: "iceRaiders"
  },
  north_gorge: {
    id: "north_gorge", regionId: "north", name: "눈사태 협곡", tier: "watch", factionId: "frost_march",
    hex: { col: 2, row: 3 },
    description: "길은 짧지만 눈사태와 바위 마수 때문에 수송대가 자주 끊긴다.",
    requirements: ["north_river", "north_pass"], requireAny: true, neighbors: ["north_river", "north_pass", "north_mine"], sitePool: ["mine", "herb", "ruin"], bossEncounterId: "snowGolems"
  },
  north_mine: {
    id: "north_mine", regionId: "north", name: "빙결 심층광산", tier: "danger", factionId: "frost_march",
    hex: { col: 2, row: 4 },
    description: "설철 광맥과 빙맥 거상이 잠든 북부의 핵심 개척지.",
    requirements: ["north_pass", "north_gorge"], neighbors: ["north_pass", "north_gorge"], sitePool: ["deepMine", "dungeon", "ruin"], bossEncounterId: "frostColossusPack"
  },

  south_river: { id: "south_river", regionId: "south", name: "녹수 강변", tier: "safe", factionId: "canopy_council", hex: { col: 2, row: 1 }, description: "수운과 약초 채집이 가능한 남부의 진입로.", requirements: [], neighbors: ["south_spore"], sitePool: ["herb", "lumber", "cave", "ruin"], bossEncounterId: "venomStalkers" },
  south_spore: { id: "south_spore", regionId: "south", name: "포자 분지", tier: "watch", factionId: "canopy_council", hex: { col: 1, row: 2 }, description: "약제 연맹과 독비늘 무리가 희귀 독초를 두고 충돌한다.", requirements: ["south_river"], neighbors: ["south_river", "south_canopy"], sitePool: ["herb", "dungeon", "ruin"], bossEncounterId: "vineBrood" },
  south_canopy: { id: "south_canopy", regionId: "south", name: "거대 수관 심부", tier: "danger", factionId: "canopy_council", hex: { col: 2, row: 3 }, description: "수관의 어미가 둥지를 튼 남부 최고 위험 지대.", requirements: ["south_spore"], neighbors: ["south_spore"], sitePool: ["rareHerb", "dungeon", "ruin"], bossEncounterId: "canopyMatriarchPack" },

  east_outskirts: { id: "east_outskirts", regionId: "east", name: "단조성 외곽", tier: "safe", factionId: "forge_compact", hex: { col: 2, row: 1 }, description: "공방 도시와 산성 사이의 완충 지대.", requirements: [], neighbors: ["east_pass"], sitePool: ["mine", "lumber", "cave", "ruin"], bossEncounterId: "mountainBandits" },
  east_pass: { id: "east_pass", regionId: "east", name: "운철 고개", tier: "watch", factionId: "forge_compact", hex: { col: 3, row: 2 }, description: "철갑 수문병과 문파의 순찰대가 교차하는 산길.", requirements: ["east_outskirts"], neighbors: ["east_outskirts", "east_forge"], sitePool: ["mine", "runeCircle", "dungeon", "ruin"], bossEncounterId: "ironGuard" },
  east_forge: { id: "east_forge", regionId: "east", name: "봉인 단조성", tier: "danger", factionId: "forge_compact", hex: { col: 2, row: 3 }, description: "산철과 고대 단조 설계가 남은 요새 도시.", requirements: ["east_pass"], neighbors: ["east_pass"], sitePool: ["deepMine", "dungeon", "ruin"], bossEncounterId: "forgeGuardianPack" },

  west_march: { id: "west_march", regionId: "west", name: "서부 변경 초지", tier: "safe", factionId: "oath_march", hex: { col: 2, row: 1 }, description: "변경백의 농장과 오래된 순례로가 이어진다.", requirements: [], neighbors: ["west_wood"], sitePool: ["lumber", "herb", "cave", "ruin"], bossEncounterId: "thornBeasts" },
  west_wood: { id: "west_wood", regionId: "west", name: "서약림", tier: "watch", factionId: "oath_march", hex: { col: 1, row: 2 }, description: "기사단과 정령 자치령의 경계가 겹친 숲.", requirements: ["west_march"], neighbors: ["west_march", "west_ruins"], sitePool: ["herb", "runeCircle", "dungeon", "ruin"], bossEncounterId: "oathbreakers" },
  west_ruins: { id: "west_ruins", regionId: "west", name: "마나 폐허권", tier: "danger", factionId: "oath_march", hex: { col: 2, row: 3 }, description: "마나 잔영과 폐서약당 수호자가 남은 금지 구역.", requirements: ["west_wood"], neighbors: ["west_wood"], sitePool: ["manaWell", "dungeon", "ruin"], bossEncounterId: "ruinWardenPack" },

  central_oasis: { id: "central_oasis", regionId: "central", name: "오아시스 가도", tier: "safe", factionId: "oasis_league", hex: { col: 2, row: 1 }, description: "내 영지와 대상단 도시를 잇는 첫 교역로.", requirements: [], neighbors: ["central_gorge"], sitePool: ["herb", "caravan", "cave", "ruin"], bossEncounterId: "sandHunters" },
  central_gorge: { id: "central_gorge", regionId: "central", name: "유리 협곡", tier: "watch", factionId: "oasis_league", hex: { col: 3, row: 2 }, description: "유리사 광맥과 약탈대가 함께 모이는 협곡.", requirements: ["central_oasis"], neighbors: ["central_oasis", "central_palace"], sitePool: ["mine", "caravan", "dungeon"], bossEncounterId: "duneRaiders" },
  central_palace: { id: "central_palace", regionId: "central", name: "매몰 지하궁", tier: "danger", factionId: "oasis_league", hex: { col: 2, row: 3 }, description: "사구 폭군과 고대 대상로의 유산이 묻힌 중심지.", requirements: ["central_gorge"], neighbors: ["central_gorge"], sitePool: ["glassPit", "dungeon", "ruin"], bossEncounterId: "duneTyrantPack" }
};

export const FRONTIER_FACTION_DEFS = {
  frost_march: { id: "frost_march", regionId: "north", name: "설벽 변경령", ruler: "변경공 라도미르", description: "광산과 겨울 항로를 지키는 북부 영주권.", exportMaterial: "frostIron", wantsMaterial: "wood", encounterId: "iceRaiders" },
  canopy_council: { id: "canopy_council", regionId: "south", name: "수관 평의회", ruler: "강의 대변자 아마라", description: "강변 도시와 약초 부족이 느슨하게 맺은 연합.", exportMaterial: "venomSac", wantsMaterial: "ore", encounterId: "vineBrood" },
  forge_compact: { id: "forge_compact", regionId: "east", name: "운철 공방도시", ruler: "성주 겸 장인 유건", description: "단조 조합과 산성 수비대가 공동 통치한다.", exportMaterial: "mountainIron", wantsMaterial: "wood", encounterId: "ironGuard" },
  oath_march: { id: "oath_march", regionId: "west", name: "회색서약 변경백령", ruler: "변경백 엘로이스", description: "기사단·농장·정령림 사이의 계약으로 유지되는 영지.", exportMaterial: "manaStone", wantsMaterial: "ore", encounterId: "oathbreakers" },
  oasis_league: { id: "oasis_league", regionId: "central", name: "오아시스 대상연맹", ruler: "대상주 나딤", description: "수원과 유리사 교역권을 나누어 가진 도시 연맹.", exportMaterial: "glassSand", wantsMaterial: "wood", encounterId: "duneRaiders" }
};

// 생활권은 점령지와 별개다. 주민은 이곳에 거주하고, 광산·벌목지에는 작업 인력만 파견된다.
// 중앙의 내 영지만 행정 거점이며 다른 생활권은 인구를 공급하는 작은 촌락으로 취급한다.
export const LIVING_AREA_DEFS = {
  home_estate: {
    id: "home_estate", regionId: "central", name: "내 영지 생활권", glyph: "⌂", kind: "estate",
    description: "성벽 안팎의 주거지와 농가. 모든 행정과 장거리 물류가 돌아오는 유일한 중심지.",
    unlockZoneId: null, capacity: 20, foundingResidents: 12, build: {}
  },
  north_hamlet: {
    id: "north_hamlet", regionId: "north", name: "북부 산기슭 생활권", glyph: "▤", kind: "hamlet",
    description: "눈사태 길을 피한 하곡의 작은 촌락. 광부는 여기에서 광산으로 오간다.",
    unlockZoneId: "north_fir", capacity: 10, foundingResidents: 3, build: { wood: 4, food: 2 }
  },
  south_hamlet: {
    id: "south_hamlet", regionId: "south", name: "남부 강둑 생활권", glyph: "▤", kind: "hamlet",
    description: "범람선보다 높은 강둑의 촌락. 채집꾼은 여기에서 약초밭과 벌목지로 향한다.",
    unlockZoneId: "south_river", capacity: 10, foundingResidents: 3, build: { wood: 4, food: 2 }
  },
  east_hamlet: {
    id: "east_hamlet", regionId: "east", name: "동부 산성 아래 생활권", glyph: "▤", kind: "hamlet",
    description: "산성과 공방로 사이에 자리 잡은 촌락. 장인과 운반꾼이 작업지에 상주하지 않도록 잇는다.",
    unlockZoneId: "east_outskirts", capacity: 10, foundingResidents: 3, build: { wood: 4, food: 2 }
  },
  west_hamlet: {
    id: "west_hamlet", regionId: "west", name: "서부 변경촌 생활권", glyph: "▤", kind: "hamlet",
    description: "농지와 순례로가 만나는 방어 촌락. 숲과 폐허의 작업대가 이곳을 거쳐 움직인다.",
    unlockZoneId: "west_march", capacity: 10, foundingResidents: 3, build: { wood: 4, food: 2 }
  }
};

export const DISCOVERY_SITE_DEFS = {
  mine: {
    id: "mine", name: "지역 금속 광산", glyph: "◆", materialId: "ore",
    materialByRegion: { north: "ore", south: "bauxite", east: "cassiterite", west: "sphalerite", central: "malachite" },
    output: 2, workers: 2, build: { wood: 2, ore: 1 }, risk: 8
  },
  deepMine: {
    id: "deepMine", name: "특수 금속 심층광산", glyph: "❄", materialId: "frostIron",
    materialByRegion: { north: "frostIron", east: "mountainIron" },
    output: 1, workers: 3, build: { wood: 3, ore: 2 }, risk: 18
  },
  herb: {
    id: "herb", name: "야생 약초밭", glyph: "♣", materialId: "herb",
    materialByRegion: { north: "rhodiola", south: "cinchonaBark", east: "cordyceps", west: "chamomile", central: "aloeVera" },
    output: 2, workers: 1, build: { wood: 1 }, risk: 5
  },
  rareHerb: { id: "rareHerb", name: "독성 약초원", glyph: "♢", materialId: "venomSac", output: 1, workers: 2, build: { wood: 2 }, risk: 14 },
  lumber: { id: "lumber", name: "고목 벌목지", glyph: "♠", materialId: "wood", output: 2, workers: 2, build: { ore: 1 }, risk: 7 },
  manaWell: { id: "manaWell", name: "마나 용출지", glyph: "✦", materialId: "manaStone", output: 1, workers: 2, build: { wood: 2, ore: 1 }, risk: 16 },
  runeCircle: { id: "runeCircle", name: "폐허 룬 각인소", glyph: "ᚱ", materialId: "runeFragment", output: 1, workers: 2, build: { wood: 1, ore: 1 }, risk: 13 },
  glassPit: { id: "glassPit", name: "유리사 채굴지", glyph: "◇", materialId: "glassSand", output: 1, workers: 2, build: { wood: 2, ore: 1 }, risk: 15 },
  caravan: { id: "caravan", name: "대상단 중계소", glyph: "◎", materialId: "food", output: 2, workers: 2, build: { wood: 2, ore: 1 }, risk: 6 },
  ruin: { id: "ruin", name: "매몰된 작업장", glyph: "⌘", materialId: "scrap", output: 2, workers: 2, build: { wood: 2 }, risk: 10 },
  cave: { id: "cave", name: "야생 동굴", glyph: "◒", materialId: null, output: 0, workers: 0, build: {}, risk: 18, dungeon: true },
  dungeon: { id: "dungeon", name: "숨겨진 던전", glyph: "☠", materialId: null, output: 0, workers: 0, build: {}, risk: 24, dungeon: true }
};

export function siteMaterialId(siteDefinition, regionId) {
  return siteDefinition?.materialByRegion?.[regionId] || siteDefinition?.materialId || null;
}

export function createInitialFrontierState() {
  return {
    selectedZoneId: "central_oasis",
    cycle: 0,
    population: { total: 12 },
    livingAreas: Object.fromEntries(Object.values(LIVING_AREA_DEFS).map((area) => [area.id, {
      status: area.id === "home_estate" ? "inhabited" : "locked",
      discovered: area.id === "home_estate",
      residents: area.id === "home_estate" ? area.foundingResidents : 0,
      safety: area.id === "home_estate" ? 72 : 0,
      foundedAtCycle: area.id === "home_estate" ? 0 : null,
      lastEvent: area.id === "home_estate" ? "내 영지 주민이 생활하고 있다." : "아직 생활권이 조성되지 않았다."
    }])),
    estateSatisfaction: { overall: 68, living: 66, safety: 62, fairness: 70, culture: 72, prospect: 70 },
    zones: Object.fromEntries(Object.values(FRONTIER_ZONE_DEFS).map((zone) => [zone.id, {
      status: zone.requirements.length ? "locked" : "available",
      exploration: 0,
      stability: 0,
      threat: ZONE_TIER_DEFS[zone.tier].baseRisk,
      routeLevel: 0,
      sites: [],
      stolenCargo: {},
      conquests: 0,
      suppressions: 0,
      suppressionClock: 0,
      neglect: 0,
      lastEvent: ""
    }])),
    squads: [
      { id: "vanguard", name: "제1원정대", unlocked: true, memberIds: ["snow_guard", "venom_tracker", "formation_officer", "oath_knight", "desert_lancer"], mission: null },
      { id: "wardens", name: "제2원정대", unlocked: false, memberIds: [], mission: null },
      { id: "rangers", name: "제3원정대", unlocked: false, memberIds: [], mission: null }
    ],
    factions: Object.fromEntries(Object.values(FRONTIER_FACTION_DEFS).map((faction) => [faction.id, {
      met: false,
      trust: 0,
      vigilance: 18,
      interests: 0,
      satisfaction: 64,
      unrest: 8,
      intel: 0,
      tradeCount: 0,
      lastEvent: ""
    }])),
    eventLog: ["개척 지도에 아직 확인하지 못한 길과 문명이 표시되기 시작했다."]
  };
}

export function zoneRequirementsMet(frontier, zoneId) {
  const definition = FRONTIER_ZONE_DEFS[zoneId];
  if (!definition) return false;
  if (!definition.requirements.length) return true;
  const owned = (requiredId) => ["occupied", "stabilized", "developed"].includes(frontier.zones[requiredId]?.status);
  return definition.requireAny
    ? definition.requirements.some(owned)
    : definition.requirements.every(owned);
}

export function refreshFrontierUnlocks(frontier) {
  for (const zone of Object.values(FRONTIER_ZONE_DEFS)) {
    const state = frontier.zones[zone.id];
    if (state.status === "locked" && zoneRequirementsMet(frontier, zone.id)) state.status = "available";
  }
}

export function occupiedZone(frontier, zoneId) {
  return ["occupied", "stabilized", "developed"].includes(frontier.zones[zoneId]?.status);
}

export function livingAreaDefinitionForRegion(regionId) {
  return Object.values(LIVING_AREA_DEFS).find((area) => area.regionId === regionId) || null;
}

export function inhabitedLivingAreaForRegion(frontier, regionId) {
  const definition = livingAreaDefinitionForRegion(regionId);
  if (!definition || frontier.livingAreas?.[definition.id]?.status !== "inhabited") return null;
  return { definition, state: frontier.livingAreas[definition.id] };
}

export function livingAreaRequirementsMet(frontier, livingAreaId) {
  const definition = LIVING_AREA_DEFS[livingAreaId];
  if (!definition) return false;
  const livingArea = frontier.livingAreas?.[livingAreaId];
  return Boolean(livingArea?.discovered) && (!definition.unlockZoneId || occupiedZone(frontier, definition.unlockZoneId));
}

export function suppressionCyclesRemaining(frontier, zoneId) {
  const definition = FRONTIER_ZONE_DEFS[zoneId];
  const zone = frontier.zones?.[zoneId];
  if (!definition || !zone || !occupiedZone(frontier, zoneId)) return null;
  const interval = ZONE_TIER_DEFS[definition.tier].suppressionInterval;
  return Math.max(0, interval - (zone.suppressionClock || 0));
}

export function livingAreaWorkersUsed(frontier, livingAreaId) {
  return Object.values(frontier.zones).flatMap((zone) => zone.sites || [])
    .reduce((sum, site) => sum + (
      site.status === "developed" && site.livingAreaId === livingAreaId ? site.workers || 0 : 0
    ), 0);
}

export function availableLivingAreaPopulation(frontier, livingAreaId) {
  const livingArea = frontier.livingAreas?.[livingAreaId];
  if (!livingArea || livingArea.status !== "inhabited") return 0;
  return Math.max(0, livingArea.residents - livingAreaWorkersUsed(frontier, livingAreaId));
}

export function totalFrontierPopulation(frontier) {
  if (!frontier.livingAreas) return frontier.population?.total || 0;
  return Object.values(frontier.livingAreas).reduce((sum, area) => sum + (area.residents || 0), 0);
}

export function frontierPopulationUsed(frontier) {
  return Object.values(frontier.zones).flatMap((zone) => zone.sites || [])
    .reduce((sum, site) => sum + (site.status === "developed" ? site.workers || 0 : 0), 0);
}

export function availableFrontierPopulation(frontier) {
  return Math.max(0, totalFrontierPopulation(frontier) - frontierPopulationUsed(frontier));
}

export function deterministicFrontierRoll(frontier, salt = "") {
  const text = `${frontier.cycle}|${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function routeRisk(frontier, zoneId, site, escortPower = 0) {
  const definition = FRONTIER_ZONE_DEFS[zoneId];
  const zone = frontier.zones[zoneId];
  if (!definition || !zone) return 100;
  const tier = ZONE_TIER_DEFS[definition.tier];
  return Math.max(2, Math.min(95,
    tier.baseRisk
    + Math.round(zone.threat * 0.45)
    + (DISCOVERY_SITE_DEFS[site.typeId]?.risk || 0)
    - zone.routeLevel * 9
    - Math.round(zone.stability * 0.18)
    + (zone.neglect || 0) * 9
    - escortPower
  ));
}

export function riskLabel(value) {
  if (value <= 15) return "안전";
  if (value <= 35) return "주의";
  if (value <= 60) return "위험";
  return "극위험";
}
