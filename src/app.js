import { AFFIX_DEFS, AREA_DEFS, BAG_COLS, CLASS_DEFS, CRAFT_RECIPES, ENEMY_DEFS, ITEM_CATEGORY_DEFS, ITEM_DEFS, MATERIAL_DEFS, RESEARCH_DEFS, TAG_LABELS, TRAIT_DEFS, VIEW_SIZE, WORKER_DEFS } from "./data.js";
import { adjustedWorkerMaterialCosts, environmentMitigation, findPath, itemCells, keyOf, masteryLevel, workerProficiency } from "./core.js";
import { GameEngine } from "./game.js";
import { BASIC_DISCIPLINE_DEFS, PLAYER_KIT_DEFS, normalizedPlayerLoadout, playerBaseClassDefinition, playerCombatStats, playerKitDefinition, playerSkillDefinition } from "./classes.js";
import {
  DUNGEON_VIEW_SIZE,
  FIELD_VIEW_SIZE,
  MONSTER_ECOLOGY_DEFS,
  PARTY_LIMIT,
  REGION_PORTRAIT_INDEX,
  SECONDARY_DEFS,
  STATUS_EFFECT_DEFS,
  UNIT_DEFS,
  WORLD_REGION_DEFS,
  currentZone,
  explorationPath
} from "./adventure.js";
import {
  DISCOVERY_SITE_DEFS,
  FRONTIER_FACTION_DEFS,
  FRONTIER_ZONE_DEFS,
  LIVING_AREA_DEFS,
  ZONE_TIER_DEFS,
  availableFrontierPopulation,
  availableLivingAreaPopulation,
  frontierPopulationUsed,
  livingAreaDefinitionForRegion,
  livingAreaRequirementsMet,
  livingAreaWorkersUsed,
  occupiedZone,
  riskLabel,
  routeRisk,
  siteMaterialId,
  suppressionCyclesRemaining,
  zoneRequirementsMet
} from "./frontier.js";
import {
  ESTATE_GATE_DEFS,
  GATE_GARRISON_LIMIT,
  REMNANT_TEAM_LIMIT,
  gateDurabilityGrade,
  groupDefensePower
} from "./defense.js";

const app = document.querySelector("#app");
const engine = new GameEngine();
const COMBAT_TIME_SCALE = 0.68;
const BATTLE_CAMERA_YAW = -Math.PI / 4;

const view = {
  bagOpen: false,
  selectedUid: null,
  selectedRotation: 0,
  bagFingerprint: "",
  // 앱을 새로 열 때는 진행 중인 원정이 있어도 항상 영지 전경부터 보여준다.
  hubOpen: true,
  facilityOpen: null,
  warehouseCategory: "equipment",
  worldOpen: false,
  frontierOpen: false,
  frontierZoneOpen: null,
  frontierSelectedSiteId: "operation",
  frontierMenuOpen: null,
  defensePlanOpen: false,
  defenseMapOpen: false,
  zoneMapOpen: false,
  rosterOpen: false,
  classOpen: false,
  mapOpen: false,
  retreatConfirm: false,
  autoMove: null,
  autoPath: [],
  autoTimer: null,
  adventurePath: [],
  adventureTarget: null,
  adventureTimer: null,
  combatTimer: null,
  battleResultTimer: null,
  lastCombatAt: 0,
  battleCameraBattle: null,
  battleCameraYaw: 0,
  joystickPointerId: null,
  joystickMode: null,
  joystickCenterX: 0,
  joystickCenterY: 0,
  joystickX: 0,
  joystickY: 0,
  fieldMoveTimer: null,
  lastFieldMoveAt: 0,
  mapPointers: new Map(),
  mapPinchLayer: null,
  mapPinchDistance: 0,
  mapGestureLastAt: 0,
  toast: "",
  toastTimer: null
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function portraitIndexForUnit(unit) {
  return unit?.portraitIndex ?? REGION_PORTRAIT_INDEX[unit?.regionId] ?? 0;
}

function portraitClass(index) {
  return `portrait-atlas portrait-${Math.max(0, Math.min(5, Number(index) || 0))}`;
}

const PLAYER_BATTLE_ART_CLASSES = Object.freeze({
  spiritCrusader: "player-art-webtoon player-webtoon-crusader",
  heavyNecromancer: "player-art-webtoon player-webtoon-necromancer",
  barbarian: "player-art-webtoon player-webtoon-barbarian",
  tracker: "player-art-webtoon player-webtoon-tracker",
  maehwa: "player-art-webtoon player-webtoon-maehwa",
  crusader: "player-art-webtoon player-webtoon-crusader",
  shapeshifter: "player-art-webtoon player-webtoon-shapeshifter-human",
  shapeshifterHuman: "player-art-webtoon player-webtoon-shapeshifter-human",
  shapeshifterWolf: "player-art-webtoon player-webtoon-shapeshifter-wolf",
  archmage: "player-art-webtoon player-webtoon-archmage",
  grandMage: "player-art-webtoon player-webtoon-archmage"
});

const BATTLE_COMPANION_REGION_FALLBACK = Object.freeze(["north", "south", "east", "west", "central", "north"]);

const PLAYER_KIT_CONCEPT_ART = Object.freeze({
  spiritCrusader: "./assets/character-crusader-webtoon-v1.png",
  heavyNecromancer: "./assets/character-necromancer-webtoon-v1.png",
  archmage: "./assets/character-archmage-webtoon-v2.png",
  grandMage: "./assets/character-archmage-webtoon-v2.png"
});

const MONSTER_BATTLE_ART_CLASSES = Object.freeze({
  goblin: "monster-sprite monster-goblin",
  orc: "monster-sprite monster-orc",
  wolf: "monster-sprite monster-wolf",
  bear: "monster-sprite monster-bear"
});

const COMPANION_BATTLE_ART_CLASSES = Object.freeze({
  north: "companion-sprite companion-north",
  south: "companion-sprite companion-south",
  east: "companion-sprite companion-east",
  west: "companion-sprite companion-west",
  central: "companion-sprite companion-central"
});

function playerBattleArtClass(kitId) {
  return PLAYER_BATTLE_ART_CLASSES[kitId] || "";
}

function monsterBattleArtClass(entity) {
  return MONSTER_BATTLE_ART_CLASSES[entity?.species] || "";
}

function companionBattleRegion(entity) {
  const directRegion = entity?.regionId;
  if (COMPANION_BATTLE_ART_CLASSES[directRegion]) return directRegion;
  const defId = String(entity?.defId || "").replace(/^unit-/, "");
  const entityId = String(entity?.id || "").replace(/^unit-/, "");
  const definitionRegion = UNIT_DEFS[defId]?.regionId || UNIT_DEFS[entityId]?.regionId;
  return COMPANION_BATTLE_ART_CLASSES[definitionRegion] ? definitionRegion : "";
}

function battleCompanionClass(entity) {
  const region = companionBattleRegion(entity);
  const regionKey = region || BATTLE_COMPANION_REGION_FALLBACK[portraitIndexForUnit(entity) || 0];
  return region || regionKey;
}

function showToast(message) {
  view.toast = message;
  clearTimeout(view.toastTimer);
  render();
  view.toastTimer = setTimeout(() => {
    view.toast = "";
    render();
  }, 1800);
}

function resetScreenScroll() {
  requestAnimationFrame(() => globalThis.scrollTo(0, 0));
}

function currentArea(state) {
  return AREA_DEFS[state.expedition?.areaId || state.meta.selectedAreaId] || AREA_DEFS.estate;
}

const ESTATE_FACILITIES = {
  hall: { id: "hall", name: "영주관", glyph: "♜", eyebrow: "개척자와 영지 기록", x: 50, y: 19 },
  guild: { id: "guild", name: "고용소", glyph: "♙", eyebrow: "일꾼과 자동 생산", x: 22, y: 43 },
  workshop: { id: "workshop", name: "룬 공방", glyph: "✦", eyebrow: "공용 연구와 설계", x: 78, y: 45 },
  forge: { id: "forge", name: "대장간", glyph: "⚒", eyebrow: "장비 제작과 변동 옵션", x: 22, y: 73 },
  warehouse: { id: "warehouse", name: "창고", glyph: "▦", eyebrow: "가방 배치와 보관 장비", x: 78, y: 74 },
  gate: { id: "gate", name: "원정 성문", glyph: "⚑", eyebrow: "지역 선택과 출정 준비", x: 50, y: 92 }
};

function facilityBadge(state, facilityId) {
  if (facilityId === "hall") return `${state.meta.victories}회 정복`;
  if (facilityId === "guild") {
    const workers = Object.values(state.meta.estate.workers).reduce((sum, count) => sum + count, 0);
    return `${workers}명 근무`;
  }
  if (facilityId === "forge") return `설계 ${state.meta.blueprints.length}/${CRAFT_RECIPES.length}`;
  if (facilityId === "workshop") return `연구 ${state.meta.research.length}/${RESEARCH_DEFS.length}`;
  if (facilityId === "warehouse") {
    const active = state.inventory.filter((item) => item.x >= 0).length;
    return `${active}개 작동`;
  }
  if (facilityId === "gate") {
    const run = state.adventure?.run;
    return run ? "원정 진행 중" : "대륙 지도";
  }
  return "";
}

function estateHotspot(state, facility) {
  return `
    <button
      class="estate-hotspot estate-hotspot-${facility.id}"
      style="--hotspot-x:${facility.x}%;--hotspot-y:${facility.y}%"
      data-action="open-facility"
      data-facility-id="${facility.id}"
      aria-label="${facility.name} 열기, ${facilityBadge(state, facility.id)}"
    >
      <span class="hotspot-glyph">${facility.glyph}</span>
      <span class="hotspot-copy"><strong>${facility.name}</strong><small>${facilityBadge(state, facility.id)}</small></span>
    </button>
  `;
}

function topbar(state) {
  const facility = ESTATE_FACILITIES[view.facilityOpen];
  const run = state.adventure?.run;
  const runRegion = run ? WORLD_REGION_DEFS[run.regionId] : null;
  const defensePhase = state.estateDefense?.campaign?.phase;
  const location = defensePhase && !view.hubOpen ? ({ gates: "네 성문 방어", inner: "영지 내부전장", remnants: "성내 잔당 소탕", resolved: "수성전 정산" })[defensePhase]
    : state.estateDefense?.battle && !view.hubOpen ? "내 영지 방어전"
    : view.frontierOpen ? `${WORLD_REGION_DEFS[state.adventure?.selectedRegionId]?.name || "개척권"} 세부 지도`
    : view.worldOpen ? "대륙 원정 지도"
    : run && !view.hubOpen ? `${runRegion.name} · ${run.location === "dungeon" ? runRegion.dungeonName : "지역 필드"}`
      : state.expedition && !view.hubOpen ? currentArea(state).name
        : (facility?.name || "개척 영지");
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">▦</div>
        <div>
          <strong>배낭공방</strong>
          <small>${escapeHtml(location)}</small>
        </div>
      </div>
      <div class="resources" aria-label="보유 자원">
        <span class="resource-chip">고철 <b>${state.meta.scrap}</b></span>
        <span class="resource-chip">핵 <b>${state.meta.essence}</b></span>
        <span class="resource-chip threat-chip">위협 <b>${state.estateDefense?.threat || 0}</b></span>
      </div>
    </header>
  `;
}

function hubScreen(state) {
  const run = state.adventure?.run;
  const selectedRegion = WORLD_REGION_DEFS[run?.regionId || state.adventure?.selectedRegionId] || WORLD_REGION_DEFS.central;
  const workers = Object.values(state.meta.estate.workers).reduce((sum, count) => sum + count, 0);
  return `
    <main class="screen hub-screen estate-hub-screen">
      <section class="estate-scene" aria-label="개척 영지 시설 지도">
        <img src="./assets/estate-hub-v1.png" alt="설산과 사막 사이에 세워진 개척 영지 전경" draggable="false">
        <div class="estate-scene-shade"></div>
        <header class="estate-scene-title">
          <div><p class="eyebrow">개척 영지 · 시제품 0.24.0</p><h1>내 영지</h1></div>
          <span>${run ? `${selectedRegion.glyph} ${selectedRegion.name} 원정 중` : `일꾼 ${workers}명 가동 중`}</span>
        </header>
        ${Object.values(ESTATE_FACILITIES).map((facility) => estateHotspot(state, facility)).join("")}
      </section>

      <nav class="estate-quickbar" aria-label="영지 시설 바로가기">
        ${Object.values(ESTATE_FACILITIES).map((facility) => `
          <button data-action="open-facility" data-facility-id="${facility.id}">
            <span>${facility.glyph}</span><small>${facility.name}</small>
          </button>
        `).join("")}
      </nav>

      <section class="estate-brief">
        <div>
          <span>${run ? "진행 중인 원정" : "대륙 원정대"}</span>
          <strong>${selectedRegion.glyph} ${selectedRegion.name}</strong>
          <small>${run ? `${run.location === "dungeon" ? selectedRegion.dungeonName : "넓은 지역 필드"} 탐사 중` : "전체 지도에서 지역을 고르고 필드와 던전을 탐사한다"}</small>
        </div>
        <button class="primary" data-action="open-world">${run ? "원정 지도 열기" : "전체 지도 열기"}</button>
      </section>
      <section class="estate-defense-brief ${state.estateDefense.pending ? "alert" : ""}">
        <div class="defense-gauge"><i style="--threat:${state.estateDefense.threat}%"></i></div>
        <div><span>${state.estateDefense.pending ? "공격 징후 발견" : "영지 경계도"}</span><strong>${state.estateDefense.pending?.title || `위협 ${state.estateDefense.threat}/100`}</strong><small>${state.estateDefense.pending?.description || "개척과 원정을 확대할수록 주변의 반발이 강해진다."}</small></div>
        ${state.estateDefense.pending
          ? state.estateDefense.campaign
            ? '<button class="danger" data-action="resume-defense">진행 중인 수성 작전</button>'
            : '<button class="danger" data-action="start-defense">수비 배치·작전 시작</button>'
          : `<button class="secondary" data-action="fortify-estate" ${state.meta.scrap < 3 || state.estateDefense.fortification >= 5 ? "disabled" : ""}>방어 보강 ${state.estateDefense.fortification}/5</button>`}
      </section>
    </main>
  `;
}

function materialGrid(state, categoryIds = ["ore", "special", "other"], showEmpty = false) {
  const sections = categoryIds.map((categoryId) => {
    const category = ITEM_CATEGORY_DEFS[categoryId];
    const materials = Object.values(MATERIAL_DEFS).filter((material) => (
      material.category === categoryId && (showEmpty || (state.meta.materials[material.id] || 0) > 0)
    ));
    if (!category || !materials.length) return "";
    return `
      <section class="material-category-block category-${categoryId}">
        <header><span>${category.glyph}</span><div><strong>${category.name}</strong><small>${category.description}</small></div></header>
        <div class="material-grid">${materials.map((material) => `
          <article class="material-stock ${material.common ? "common" : "rare"}" title="${escapeHtml(material.description || material.name)}">
            <span>${material.glyph}${material.symbol ? `<i>${material.symbol}</i>` : ""}</span><small>${escapeHtml(material.name)}</small><b>${state.meta.materials[material.id] || 0}</b>
          </article>
        `).join("")}</div>
      </section>
    `;
  }).join("");
  return `<div class="material-category-stack">${sections || '<div class="empty-state">아직 확보한 물자가 없다.</div>'}</div>`;
}

function warehouseCategoryTabs(state) {
  return `<nav class="warehouse-category-tabs" aria-label="창고 물품 분류">${Object.values(ITEM_CATEGORY_DEFS).map((category) => {
    const count = category.id === "equipment"
      ? state.inventory.length
      : Object.values(MATERIAL_DEFS).filter((material) => material.category === category.id).reduce((sum, material) => sum + (state.meta.materials[material.id] || 0), 0);
    return `<button class="${view.warehouseCategory === category.id ? "selected" : ""}" data-action="set-warehouse-category" data-category-id="${category.id}"><span>${category.glyph}</span><strong>${category.name}</strong><small>${count}</small></button>`;
  }).join("")}</nav>`;
}

function warehouseCategoryContent(state, activeCount, linkedItems) {
  const category = ITEM_CATEGORY_DEFS[view.warehouseCategory] || ITEM_CATEGORY_DEFS.equipment;
  if (category.id !== "equipment") return `
    <article class="warehouse-category-intro"><span>${category.glyph}</span><div><p class="eyebrow">창고 분류</p><h3>${category.name}</h3><p>${category.description}</p></div></article>
    ${materialGrid(state, [category.id], true)}
  `;
  return `
    <article class="warehouse-engine">
      <div><span>가방 전투 엔진</span><strong>${BAG_COLS}×${state.meta.bagRows}</strong><small>배치 ${activeCount}개 · 연결 ${linkedItems}개 · 보관 ${state.inventory.length - activeCount}개</small></div>
      <button class="primary" data-action="open-bag">가방 열기</button>
    </article>
    <p class="facility-note">장비는 가방에 배치하면 모두 각자 효과를 발휘한다. 서로 맞닿은 장비는 추가 효과를 만들며, 영지에서는 턴 소모 없이 재배치할 수 있다.</p>
    <div class="trigger-strip facility-trigger-preview" aria-label="배치된 장비">${renderTriggerStrip(state)}</div>
  `;
}

function expeditionPreparation(state, area) {
  const activeCount = state.inventory.filter((item) => item.x >= 0).length;
  const linkedItems = state.inventory.filter((item) => item.x >= 0 && engine.getLinkedUids(item.uid).length > 0).length;
  const mitigation = area.pressure ? environmentMitigation(state, area.pressure.id) : 0;
  const projectedGain = area.pressure ? Math.max(0, area.pressure.rate - mitigation) : 0;
  const preparedness = !area.pressure || projectedGain === 0 ? "대응 충분" : projectedGain === 1 ? "주의 필요" : "대응 부족";
  const rewardMaterial = MATERIAL_DEFS[area.bossMaterial || area.rareMaterial];
  const rewardRecipe = CRAFT_RECIPES.find((recipe) => recipe.id === area.bossBlueprint);
  return `
    <article class="expedition-prep-card" style="--area-accent:${area.accent}">
      <div class="prep-card-head"><span>${area.glyph}</span><div><small>${area.difficulty}</small><h3>${area.name}</h3></div><b class="prep-grade grade-${projectedGain > 1 ? "bad" : projectedGain === 1 ? "warn" : "good"}">${preparedness}</b></div>
      <p>${area.description}</p>
      <div class="prep-metrics">
        <div><span>환경</span><b>${area.pressure ? `${area.pressure.glyph} +${area.pressure.rate}/턴` : "없음"}</b></div>
        <div><span>현재 대응</span><b>${area.pressure ? (mitigation > 0 ? `-${mitigation}/턴` : "0/턴") : "안전"}</b></div>
        <div><span>실제 증가</span><b>${area.pressure ? `+${projectedGain}/턴` : "0"}</b></div>
        <div><span>가방 연결</span><b>${linkedItems}/${activeCount}</b></div>
      </div>
      <div class="prep-objective"><span>원정 목표</span><strong>${area.objective}</strong></div>
      <div class="prep-rewards"><span>핵심 보상</span><b>${rewardMaterial ? `${rewardMaterial.glyph} ${rewardMaterial.name}` : "영지 자원"}</b>${rewardRecipe ? `<b>⌘ ${rewardRecipe.name} 설계도</b>` : ""}</div>
      ${projectedGain > 0 ? '<p class="prep-advice">직업·출신·가방 장비의 대응 수치는 합산된다. 특정 장비 하나가 아니라 여러 조합으로 압력을 상쇄할 수 있다.</p>' : ""}
    </article>
  `;
}

function facilityOverlay(state) {
  const facility = ESTATE_FACILITIES[view.facilityOpen];
  if (!facility) return "";
  const ongoing = state.expedition || state.adventure?.run || state.estateDefense?.battle || state.estateDefense?.campaign;
  const selectedArea = AREA_DEFS[ongoing?.areaId || state.meta.selectedAreaId] || AREA_DEFS.estate;
  const combatKit = playerKitDefinition(state.adventure?.commander?.combatKitId);
  const combatBaseClass = playerBaseClassDefinition(combatKit.baseClassId);
  const combatLoadout = normalizedPlayerLoadout(state.adventure?.commander || {}, combatKit.id);
  const traitDef = TRAIT_DEFS[state.meta.traitId];
  const unlockedRecipes = CRAFT_RECIPES.filter((recipe) => state.meta.blueprints.includes(recipe.id));
  const activeCount = state.inventory.filter((item) => item.x >= 0).length;
  const linkedItems = state.inventory.filter((item) => item.x >= 0 && engine.getLinkedUids(item.uid).length > 0).length;
  let content = "";

  if (facility.id === "hall") content = `
    <div class="summary-grid facility-summary">
      <article class="summary-stat"><span>완료 원정</span><b>${state.meta.victories}</b></article>
      <article class="summary-stat"><span>해금 설계도</span><b>${state.meta.blueprints.length}/${CRAFT_RECIPES.length}</b></article>
      <article class="summary-stat"><span>작동 아이템</span><b>${activeCount}</b></article>
      <article class="summary-stat"><span>연결 아이템</span><b>${linkedItems}</b></article>
    </div>
    <div class="section-heading"><h2>개척자</h2><span>직업과 출신이 원정 해법을 바꾼다</span></div>
    <article class="card class-summary" style="--class-color:${combatKit.color}">
      <div class="class-glyph">${combatKit.glyph}</div>
      <div class="class-copy"><p class="eyebrow">${escapeHtml(combatBaseClass.name)} · ${escapeHtml(traitDef.name)} · 장착 기술 ${combatLoadout.length}/3</p><h3>${escapeHtml(combatKit.shortName)}</h3><p>${combatBaseClass.passive.glyph} ${escapeHtml(combatBaseClass.passive.name)} · ${escapeHtml(combatKit.description)}</p></div>
      <button class="secondary" data-action="open-class" ${ongoing ? "disabled" : ""}>${ongoing ? "원정 중 고정" : "직업·특성"}</button>
    </article>
    <article class="party-management-card">
      <div><span>동행 동료</span><strong>${state.adventure.party.length}/${PARTY_LIMIT}명 편성 · 보유 ${state.adventure.roster.length}/15명</strong><small>플레이어는 직접 조작하고 두 동료는 각자 판단해 싸운다.</small></div>
      <button class="primary" data-action="open-roster" ${ongoing ? "disabled" : ""}>부대 편성·육성</button>
    </article>
  `;

  if (facility.id === "guild") content = `
    ${materialGrid(state)}
    <article class="party-management-card"><div><span>원정대 훈련</span><strong>지역 출신 동료와 교차 특성</strong><small>지역을 정복하면 정해진 동료가 차례로 합류한다.</small></div><button class="primary" data-action="open-roster" ${ongoing ? "disabled" : ""}>부대 관리</button></article>
    <div class="section-heading"><h2>영지 인력</h2><span>실제로 일한 시간만 직종 숙련으로 쌓인다</span></div>
    <section class="worker-grid">${Object.values(WORKER_DEFS).map((worker) => workerCard(state, worker, ongoing)).join("")}</section>
  `;

  if (facility.id === "forge") {
    const smithProficiency = workerProficiency(state, "blacksmith");
    content = `
    ${materialGrid(state)}
    <div class="section-heading"><h2>제작 가능 장비</h2><span>대장장이 ${smithProficiency.name} · 누적 ${smithProficiency.workHours}시간</span></div>
    <section class="cards forge-cards">${unlockedRecipes.map((recipe) => craftCard(state, recipe, ongoing)).join("") || '<div class="empty-state">원정에서 설계도를 찾아오면 제작 목록이 열린다.</div>'}</section>
  `;
  }

  if (facility.id === "workshop") content = `
    <p class="facility-note">룬과 연금술은 모든 직업이 함께 사용한다. 연구한 설계는 대장간 제작 목록에 영구적으로 추가된다.</p>
    <section class="cards">${RESEARCH_DEFS.map((research) => researchCard(state, research)).join("")}</section>
  `;

  if (facility.id === "warehouse") content = `
    ${warehouseCategoryTabs(state)}
    ${warehouseCategoryContent(state, activeCount, linkedItems)}
  `;

  if (facility.id === "gate") content = `
    <article class="gate-world-preview">
      <span class="gate-world-glyph">◎</span>
      <div><p class="eyebrow">필드와 던전으로 이어지는 대륙</p><h3>전체 원정 지도</h3><p>지역을 선택하면 41×41 필드를 탐사한다. 필드 깊숙한 곳의 입구에 도달하면 15×15 던전으로 들어간다.</p></div>
    </article>
    <div class="facility-actions">
      <button class="primary" data-action="open-world">${state.adventure?.run ? "진행 중인 원정 보기" : "대륙 지도 펼치기"}</button>
      <button class="secondary" data-action="open-bag">원정 장비 점검</button>
    </div>
  `;

  return `
    <div class="overlay facility-overlay" role="dialog" aria-modal="true" aria-label="${facility.name}">
      <section class="sheet facility-sheet facility-${facility.id}">
        <header class="sheet-header facility-header"><div><p class="eyebrow">${facility.eyebrow}</p><h2>${facility.glyph} ${facility.name}</h2></div><button class="primary" data-action="close-facility">영지로</button></header>
        ${content}
      </section>
    </div>
  `;
}

function areaCard(state, area, selectedAreaId, ongoing) {
  const record = state.meta.areaRecords[area.id];
  const selected = area.id === selectedAreaId;
  const pressure = area.pressure ? `${area.pressure.glyph} ${area.pressure.name} +${area.pressure.rate}/턴` : "환경 압력 없음";
  return `
    <button class="area-card ${selected ? "selected" : ""} area-${area.id}" style="--area-accent:${area.accent}" data-action="select-area" data-area-id="${area.id}" ${ongoing ? "disabled" : ""}>
      <span class="area-glyph">${area.glyph}</span>
      <span class="area-card-copy">
        <small>${escapeHtml(area.difficulty)} · 방문 ${record.visits} · 승리 ${record.victories}</small>
        <strong>${escapeHtml(area.name)}</strong>
        <i>${escapeHtml(area.subtitle)}</i>
        <em>${pressure}</em>
      </span>
    </button>
  `;
}

function roleScore(scores = [1, 1, 1]) {
  const labels = ["딜", "탱", "유틸"];
  return `<div class="role-score">${labels.map((label, index) => `<span>${label}<b>${"●".repeat(scores[index] || 0)}${"○".repeat(Math.max(0, 4 - (scores[index] || 0)))}</b></span>`).join("")}</div>`;
}

function rosterUnitCard(state, unit) {
  const owned = state.adventure.roster.includes(unit.id);
  const selected = state.adventure.party.includes(unit.id);
  const progress = state.adventure.unitProgress[unit.id] || { level: 1, xp: 0, secondaryId: null };
  const needed = 8 + progress.level * 6;
  const region = WORLD_REGION_DEFS[unit.regionId];
  const secondary = SECONDARY_DEFS[progress.secondaryId];
  return `
    <article class="roster-unit-card ${owned ? "owned" : "locked"} ${selected ? "selected" : ""}" style="--unit-color:${unit.color}">
      <header><span class="unit-portrait ${portraitClass(portraitIndexForUnit(unit))}" aria-hidden="true"></span><div><p class="eyebrow">${region.direction} · ${unit.role}</p><h3>${owned ? unit.name : "합류하지 않은 동료"}</h3><small>${owned ? `Lv.${progress.level} · 경험 ${progress.xp}/${needed}` : `${region.name} 정복으로 합류`}</small></div>${selected ? '<b class="party-mark">출정</b>' : ""}</header>
      ${owned ? `<p>${unit.primary} · ${unit.weakness}</p>${roleScore(unit.scores)}` : `<p>${region.description}</p>`}
      ${owned ? `
        <div class="technique-row"><span>보조 특성</span><b>${secondary ? `${secondary.glyph} ${secondary.name}` : "없음"}</b></div>
        <div class="technique-choices">
          <button class="${!progress.secondaryId ? "selected" : ""}" data-action="assign-technique" data-unit-id="${unit.id}" data-technique-id="">기본</button>
          ${state.adventure.unlockedTechniques.map((techniqueId) => {
            const technique = SECONDARY_DEFS[techniqueId];
            return `<button class="${progress.secondaryId === techniqueId ? "selected" : ""}" data-action="assign-technique" data-unit-id="${unit.id}" data-technique-id="${techniqueId}" title="${escapeHtml(technique.description)}">${technique.glyph} ${technique.name}</button>`;
          }).join("")}
        </div>
        <div class="roster-actions">
          <button class="secondary" data-action="train-unit" data-unit-id="${unit.id}" ${state.meta.scrap < Math.max(2, progress.level * 2) ? "disabled" : ""}>훈련 ${Math.max(2, progress.level * 2)}</button>
          <button class="${selected ? "ghost" : "primary"}" data-action="toggle-party-unit" data-unit-id="${unit.id}">${selected ? "편성 해제" : partyLimitLabel(state)}</button>
        </div>
      ` : ""}
    </article>
  `;
}

function partyLimitLabel(state) {
  return state.adventure.party.length >= PARTY_LIMIT ? `${PARTY_LIMIT}명 편성 완료` : "동행 편성";
}

function rosterOverlay(state) {
  if (!view.rosterOpen) return "";
  return `
    <div class="overlay roster-overlay" role="dialog" aria-modal="true" aria-label="부대 편성 및 육성">
      <section class="sheet roster-sheet">
        <header class="sheet-header"><div><p class="eyebrow">출신 고정 · 보조 특성 변경 가능</p><h2>동료 2인 편성·육성</h2></div><button class="primary" data-action="close-roster">내 영지로</button></header>
        <figure class="roster-concept-banner"><img src="./assets/regional-roster-v1.png" alt="북부, 남부, 동부, 서부, 중부의 대표 원정대 콘셉트" draggable="false"><figcaption>지역별 대표 전투 문화 · 임시 콘셉트 이미지</figcaption></figure>
        <p class="facility-note">편성 순서에 따른 위치·능력 보정은 없다. 플레이어 캐릭터는 직접 조작하고, 편성한 최대 2명의 동료는 각자 판단해 자동으로 싸운다.</p>
        ${squadPreview(state)}
        ${Object.values(WORLD_REGION_DEFS).map((region) => `
          <section class="roster-region" style="--region-color:${region.accent}">
            <div class="section-heading"><h2>${region.glyph} ${region.name}</h2><span>${region.subtitle}</span></div>
            <div class="roster-grid">${region.recruits.map((unitId) => rosterUnitCard(state, UNIT_DEFS[unitId])).join("")}</div>
          </section>
        `).join("")}
      </section>
    </div>
  `;
}

function workerCard(state, worker, ongoing) {
  const count = state.meta.estate.workers[worker.id] || 0;
  const isSteward = worker.id === "steward";
  const disabled = isSteward || ongoing || count >= worker.max || state.meta.scrap < worker.cost;
  const proficiency = isSteward ? null : workerProficiency(state, worker.id);
  const proficiencyText = !proficiency
    ? ""
    : proficiency.maxed
      ? `누적 ${proficiency.workHours}시간 · 최고 단계`
      : `누적 ${proficiency.workHours}/${proficiency.nextHours}시간`;
  return `
    <article class="worker-card">
      <span class="worker-glyph">${worker.glyph}</span>
      <div><strong>${escapeHtml(worker.name)} ${count}/${worker.max}</strong><small>${escapeHtml(worker.description)}</small></div>
      ${proficiency ? `<div class="worker-proficiency"><span><b>${proficiency.name}</b><small>${proficiencyText}</small></span><i><em style="width:${Math.round(proficiency.ratio * 100)}%"></em></i><small>수득 +${Math.round(proficiency.yieldBonus * 100)}% · 소비 -${Math.round(proficiency.materialSaving * 100)}% · 속도 +${Math.round(proficiency.speedBonus * 100)}%</small></div>` : ""}
      <button class="ghost" data-action="hire-worker" data-worker-id="${worker.id}" ${disabled ? "disabled" : ""}>${isSteward ? "재직 중" : count >= worker.max ? "최대" : `고용 ${worker.cost}`}</button>
    </article>
  `;
}

function materialCost(materials) {
  return Object.entries(materials).map(([id, amount]) => `${MATERIAL_DEFS[id].glyph} ${MATERIAL_DEFS[id].symbol ? `${MATERIAL_DEFS[id].symbol} ` : ""}${MATERIAL_DEFS[id].name} ${amount}`).join(" · ");
}

function craftCard(state, recipe, ongoing) {
  const definition = ITEM_DEFS[recipe.itemDefId];
  const costs = adjustedWorkerMaterialCosts(state, "blacksmith", recipe.materials);
  const affordable = Object.entries(costs).every(([id, amount]) => (state.meta.materials[id] || 0) >= amount);
  const classLabel = recipe.classId ? CLASS_DEFS[recipe.classId].name : "공용";
  return `
    <article class="card recipe-card" style="--item-color:${definition.color}">
      <div class="research-icon">${definition.glyph}</div>
      <div class="research-main">
        <p class="eyebrow">${classLabel} 설계도</p>
        <h3>${escapeHtml(recipe.name)}</h3>
        <p>${materialCost(costs)}</p>
      </div>
      <button class="secondary research-action" data-action="craft-recipe" data-recipe-id="${recipe.id}" ${ongoing || !affordable ? "disabled" : ""}>제작</button>
    </article>
  `;
}

function researchCard(state, research) {
  const complete = state.meta.research.includes(research.id);
  const affordable = state.meta.scrap >= research.cost;
  const lockedByExpedition = Boolean(state.expedition);
  return `
    <article class="card card-row ${complete ? "complete" : ""}">
      <div class="research-icon" aria-hidden="true">${research.glyph}</div>
      <div class="research-main">
        <h3>${escapeHtml(research.name)}</h3>
        <p>${escapeHtml(research.description)}</p>
      </div>
      <button
        class="${complete ? "ghost" : "secondary"} research-action"
        data-action="research"
        data-research-id="${research.id}"
        ${complete || !affordable || lockedByExpedition ? "disabled" : ""}
      >${complete ? "완료" : lockedByExpedition ? "원정 중" : `고철 ${research.cost}`}</button>
    </article>
  `;
}

function expeditionScreen(state) {
  const { expedition, player } = state;
  const floor = expedition.floor;
  const info = currentArea(state);
  const classDef = CLASS_DEFS[state.meta.classId];
  const skill = classDef.skill;
  const mastery = masteryLevel(state.meta.skillMastery[skill.id] || 0);
  const cooldown = Math.max(0, (player.skillReadyAt?.[skill.id] || 0) - player.turn);
  const canUseSkill = player.classResource >= skill.cost && cooldown === 0;
  const environment = engine.getEnvironmentStatus();
  const hpPercent = Math.max(0, Math.round((player.hp / player.maxHp) * 100));
  const pressurePercent = environment.pressure ? Math.min(100, Math.round((environment.value / environment.pressure.threshold) * 100)) : 0;
  const cargoCount = Object.values(expedition.cargo.materials).reduce((sum, amount) => sum + amount, 0);
  const boss = floor.enemies.find((enemy) => ENEMY_DEFS[enemy.defId].boss);
  const objectiveTitle = info.kind === "estate"
    ? "영지 순찰"
    : expedition.beaconsActivated < expedition.beaconGoal
      ? `측량 거점 ${expedition.beaconsActivated}/${expedition.beaconGoal}`
      : (boss ? `${ENEMY_DEFS[boss.defId].name}에게 접근` : "지역 정복 완료");
  const objectiveText = info.kind === "estate" ? info.objective
    : expedition.beaconsActivated < expedition.beaconGoal ? info.objective : "지도 동쪽의 보스 거점으로 향하라";
  return `
    <main class="screen expedition-screen area-${info.id}" style="--area-accent:${info.accent}">
      <section class="expedition-status">
        <div class="bar-wrap health-wrap">
          <div class="bar-label"><span>체력</span><b>${player.hp} / ${player.maxHp}</b></div>
          <div class="bar"><i style="width:${hpPercent}%"></i></div>
        </div>
        <div class="class-resource" style="--class-color:${classDef.color}">
          <span>${classDef.glyph} ${classDef.resourceName}</span><b>${player.classResource}/${classDef.resourceMax}</b>
        </div>
        <div class="status-stack">
          <span class="status-chip">턴 <b>${player.turn}</b></span>
          ${player.evasion ? '<span class="status-chip buff">회피 <b>1</b></span>' : ""}
        </div>
      </section>

      <section class="dungeon-frame" style="--depth-accent:${info.accent}">
        <div class="depth-title">
          <div><span>지역 지도 · ${player.x}, ${player.y}</span><strong>${info.glyph} ${escapeHtml(info.name)}</strong></div>
          <small>${escapeHtml(info.subtitle)}</small>
        </div>
        <p class="map-hint">밝혀진 길을 누르면 이동 · 새 적 발견 시 한 턴 경계 후 자동 재개</p>
        <div class="dungeon-grid area-${info.id}" role="grid" aria-label="${escapeHtml(info.name)} 주변 지도">
          ${renderDungeon(state)}
        </div>
      </section>

      ${environment.pressure ? `
        <section class="pressure-card" style="--pressure-color:${info.accent}">
          <div class="pressure-copy">
            <span>${environment.pressure.glyph} ${escapeHtml(environment.pressure.name)}</span>
            <b>${environment.value}/${environment.pressure.threshold}</b>
          </div>
          <div class="pressure-bar"><i style="width:${pressurePercent}%"></i></div>
          <small>지역 발생 ${environment.rate} · 직업/특성/장비 대응 ${environment.mitigation} · 실제 +${environment.gain}/턴</small>
        </section>
      ` : `
        <section class="pressure-card safe-area" style="--pressure-color:${info.accent}">
          <div class="pressure-copy"><span>⌂ 영지 안전권</span><b>안전</b></div>
          <small>환경 압력과 적이 없다. 생산 거점을 순찰하거나 영지 관리로 돌아갈 수 있다.</small>
        </section>
      `}

      <div class="objective">
        <span><b>${objectiveTitle}</b><br>${objectiveText}</span>
        <span>고철 <b>${expedition.runScrap}</b> · 짐 <b>${cargoCount + expedition.cargo.blueprints.length}</b></span>
      </div>

      <div class="trigger-strip" aria-label="최근 발동 아이템">${renderTriggerStrip(state)}</div>

      <section class="combat-log" aria-label="원정 기록">
        ${state.log.slice(0, 5).map((entry) => `<p class="${entry.tone || ""}">${escapeHtml(entry.text)}</p>`).join("")}
      </section>

      <nav class="action-bar" aria-label="원정 조작">
        <div class="action-side">
          <button class="secondary" data-action="open-bag">가방</button>
          <button class="ghost" data-action="back-hub">뒤로</button>
        </div>
        <div class="travel-control" aria-live="polite">
          <span>${view.autoMove?.paused ? "적 경계 중 · 곧 이동" : (view.autoMove ? "이동 중 · 다시 눌러 변경" : "지도를 눌러 이동")}</span>
          <button class="class-skill" style="--class-color:${classDef.color}" data-action="class-skill" ${canUseSkill ? "" : "disabled"}>${skill.glyph} ${skill.name} · ${cooldown ? `대기 ${cooldown}` : `${classDef.resourceName} ${skill.cost}`} · 숙련 ${mastery}</button>
          <button class="wait" data-action="wait" aria-label="한 턴 대기">● 한 턴 대기</button>
        </div>
        <div class="action-side">
          <button class="secondary" data-action="open-map">지도</button>
          ${quickUseButton(state)}
        </div>
      </nav>
    </main>
  `;
}

function squadPreview(state, compact = false) {
  const party = state.adventure?.party || [];
  const commander = state.adventure?.commander || { name: "개척자", level: 1, xp: 0 };
  return `
    <section class="squad-preview ${compact ? "compact" : ""}" aria-label="원정 부대 편성">
      <article class="commander-slot">
        <span class="${portraitClass(0)}"></span><div><strong>직접 조작 · ${escapeHtml(commander.name)}</strong><small>Lv.${commander.level} · 조이스틱 이동/직접 공격</small></div>
      </article>
      ${party.map((unitId) => {
        const unit = UNIT_DEFS[unitId];
        if (!unit) return "";
        const level = state.adventure.unitProgress[unitId]?.level || 1;
        return `<article class="squad-unit" style="--unit-color:${unit.color}"><span class="${portraitClass(portraitIndexForUnit(unit))}"></span><div><strong>자동 · ${unit.name}</strong><small>Lv.${level} · ${unit.role}</small></div></article>`;
      }).join("")}
    </section>
  `;
}

function worldRegionNode(state, region) {
  const selected = state.adventure?.selectedRegionId === region.id;
  const unlocked = !region.locked && state.adventure?.unlockedRegionIds.includes(region.id);
  const record = state.adventure?.records?.[region.id] || { visits: 0, victories: 0 };
  return `
    <button
      class="continent-region-node ${selected ? "selected" : ""} ${unlocked ? "unlocked" : "locked"}"
      style="--region-x:${region.mapX}%;--region-y:${region.mapY}%;--region-color:${region.accent}"
      data-action="open-frontier"
      data-region-id="${region.id}"
      ${unlocked ? "" : "disabled"}
    >
      <span>${region.locked ? "◆" : region.glyph}</span>
      <strong>${region.name}</strong>
      <small>${region.locked ? "미개척" : `방문 ${record.visits} · 정복 ${record.victories}`}</small>
    </button>
  `;
}

function mapZoomControls(layer) {
  const depth = ({ world: "대륙", regional: "지역", local: "하위 필드" })[layer] || "지도";
  return `
    <div class="map-zoom-controls" aria-label="${depth} 지도 확대와 축소">
      <button data-action="map-zoom-out" data-map-layer-action="${layer}" aria-label="한 단계 축소">−</button>
      <span><b>${depth}</b><small>두 손가락을 벌리거나 오므리기</small></span>
      <button data-action="map-zoom-in" data-map-layer-action="${layer}" aria-label="한 단계 확대">＋</button>
    </div>
  `;
}

function worldScreen(state) {
  const adventure = state.adventure;
  const run = adventure?.run;
  const selectedId = run?.regionId || adventure?.selectedRegionId || "central";
  const selected = WORLD_REGION_DEFS[selectedId] || WORLD_REGION_DEFS.central;
  const record = adventure.records[selected.id] || { visits: 0, victories: 0 };
  return `
    <main class="screen continent-screen">
      <section class="continent-map" data-map-layer="world" aria-label="전체 대륙 지도">
        <div class="continent-map-title"><p class="eyebrow">원정 성문 밖의 세계</p><h1>다섯 개척권</h1><span>역사 재현이 아닌 10~12세기풍 판타지 세계</span></div>
        <div class="continent-route route-one"></div><div class="continent-route route-two"></div><div class="continent-route route-three"></div><div class="continent-route route-four"></div>
        <button class="continent-estate-node" data-action="close-world"><span>⌂</span><strong>내 영지</strong><small>교역로의 개척 거점</small></button>
        ${Object.values(WORLD_REGION_DEFS).map((region) => worldRegionNode(state, region)).join("")}
        <div class="continent-compass" aria-hidden="true">N<br>✦</div>
        ${mapZoomControls("world")}
      </section>
      <section class="region-inspector" style="--region-color:${selected.accent}">
        <header><span class="region-inspector-glyph">${selected.glyph}</span><div><p class="eyebrow">${selected.danger} · ${selected.pressure}</p><h2>${selected.name}</h2><small>${selected.subtitle}</small></div></header>
        <p>${selected.description}</p>
        <div class="region-hazard"><span>${selected.hazard.glyph}</span><div><b>${selected.hazard.name}</b><small>${selected.hazard.description}</small></div></div>
        <div class="region-flow">
          <span><b>41×41</b> 넓은 필드</span><i>→</i><span><b>${selected.dungeonGlyph}</b> 위치 발견</span><i>→</i><span><b>15×15</b> ${selected.dungeonName}</span>
        </div>
        <div class="region-record"><span>방문 <b>${record.visits}</b></span><span>던전 정복 <b>${record.victories}</b></span><span>전투 <b>직접+자동</b></span></div>
        ${squadPreview(state, true)}
        <div class="world-actions">
          <button class="secondary" data-action="close-world">영지로</button>
          <button class="primary" data-action="${run ? "resume-adventure" : "open-frontier"}" data-region-id="${selected.id}" ${selected.locked ? "disabled" : ""}>${run ? `${WORLD_REGION_DEFS[run.regionId].name} 원정 복귀` : `${selected.name} 세부 개척`}</button>
        </div>
      </section>
    </main>
  `;
}

function frontierStatusLabel(status) {
  return ({ locked: "진입 불가", available: "점령 가능", occupied: "점령·순찰", stabilized: "안정", developed: "작업지 운영" })[status] || status;
}

function freeFrontierUnits(state, includeUnitId = null) {
  return state.adventure.roster.filter((unitId) => (
    unitId === includeUnitId || (!state.adventure.party.includes(unitId) && !engine.frontierUnitBusy(unitId))
  ));
}

function frontierZonePosition(index, total) {
  const layouts = {
    3: [[24, 69], [51, 45], [78, 26]],
    4: [[22, 70], [43, 45], [69, 28], [78, 67]],
    5: [[20, 70], [37, 43], [62, 28], [75, 57], [52, 75]]
  };
  return (layouts[total] || layouts[5])[index] || [50, 50];
}

function frontierZoneNode(state, definition, index, total) {
  const frontier = state.frontier;
  const zone = frontier.zones[definition.id];
  const selected = frontier.selectedZoneId === definition.id;
  const tier = ZONE_TIER_DEFS[definition.tier];
  const activeWorks = zone.sites.filter((site) => site.status === "developed").length;
  const discoveredDungeon = zone.sites.some((site) => DISCOVERY_SITE_DEFS[site.typeId]?.dungeon);
  const suppressionLeft = suppressionCyclesRemaining(frontier, definition.id);
  const [mapX, mapY] = frontierZonePosition(index, total);
  return `
    <button class="frontier-zone-node tier-${definition.tier} status-${zone.status} ${selected ? "selected" : ""}" data-action="open-frontier-zone-map" data-zone-id="${definition.id}" style="--tier-color:${tier.color};--zone-x:${mapX}%;--zone-y:${mapY}%" ${zone.status === "locked" ? "disabled" : ""}>
      <span>${activeWorks ? "⚒" : discoveredDungeon ? "☠" : tier.glyph}</span>
      <div><strong>${definition.name}</strong><small>${tier.name} · ${frontierStatusLabel(zone.status)}</small></div>
      <em>${occupiedZone(frontier, definition.id) ? `${zone.neglect ? `방치 ${zone.neglect}` : `토벌 ${suppressionLeft}주기`}` : zone.status === "available" ? "필드 열기" : "잠김"}</em>
    </button>
  `;
}

function frontierSiteCard(state, zoneId, site) {
  const frontier = state.frontier;
  const definition = DISCOVERY_SITE_DEFS[site.typeId];
  const materialId = site.materialId || siteMaterialId(definition, FRONTIER_ZONE_DEFS[zoneId]?.regionId);
  const developed = site.status === "developed";
  const escort = site.escortUnitId ? UNIT_DEFS[site.escortUnitId] : null;
  const escortLevel = escort ? (state.adventure.unitProgress[escort.id]?.level || 1) : 0;
  const risk = developed ? routeRisk(frontier, zoneId, site, escort ? 12 + escortLevel * 5 : 0) : 0;
  const buildText = Object.entries(definition.build).map(([materialId, amount]) => `${MATERIAL_DEFS[materialId]?.name || materialId} ${amount}`).join(" · ") || "없음";
  const freeUnits = freeFrontierUnits(state).slice(0, 5);
  const regionId = FRONTIER_ZONE_DEFS[zoneId]?.regionId;
  const livingAreaDefinition = site.livingAreaId ? LIVING_AREA_DEFS[site.livingAreaId] : livingAreaDefinitionForRegion(regionId);
  const livingArea = livingAreaDefinition ? frontier.livingAreas[livingAreaDefinition.id] : null;
  const canDispatchWorkers = livingArea?.status === "inhabited"
    && availableLivingAreaPopulation(frontier, livingAreaDefinition.id) >= definition.workers;
  return `
    <article class="frontier-site-card ${developed ? "developed" : "discovered"}">
      <header><span>${definition.glyph}</span><div><strong>${definition.name} · 품질 ${site.quality}</strong><small>${definition.dungeon ? "추가 전투 콘텐츠" : developed ? `${livingAreaDefinition?.name || "생활권"} 작업자 ${site.workers}명 · 주기당 ${MATERIAL_DEFS[materialId]?.symbol ? `${MATERIAL_DEFS[materialId].symbol} ` : ""}${MATERIAL_DEFS[materialId]?.name || "고철"} ${definition.output}` : `${materialId ? `생산 예정 ${MATERIAL_DEFS[materialId]?.symbol ? `${MATERIAL_DEFS[materialId].symbol} ` : ""}${MATERIAL_DEFS[materialId]?.name || "물자"} · ` : ""}시설 비용 ${buildText} · 작업자 ${definition.workers}명`}</small></div></header>
      <p>${escapeHtml(site.lastEvent || "발견만 된 상태")}</p>
      ${definition.dungeon ? '<b class="site-note">원정 중 진입 가능한 숨겨진 전투 거점</b>' : developed ? `
        <div class="site-route-row"><span>수송 위험 <b class="risk-${riskLabel(risk)}">${risk}% · ${riskLabel(risk)}</b></span><span>누적 도착 <b>${site.delivered}</b></span></div>
        <div class="escort-control">
          <small>호위: ${escort ? `${escort.name} Lv.${escortLevel}` : "없음 · 약탈 가능"}</small>
          ${escort
            ? `<button class="ghost" data-action="assign-site-escort" data-site-id="${site.id}" data-unit-id="">호위 해제</button>`
            : freeUnits.map((unitId) => `<button class="unit-mini" data-action="assign-site-escort" data-site-id="${site.id}" data-unit-id="${unitId}">${UNIT_DEFS[unitId].glyph} ${UNIT_DEFS[unitId].name}</button>`).join("") || "<i>편성되지 않은 유닛이 필요</i>"}
        </div>
      ` : `<div class="site-dispatch-row"><small>${livingArea?.status === "inhabited" ? `${livingAreaDefinition.name} 가용 노동 ${availableLivingAreaPopulation(frontier, livingAreaDefinition.id)}명` : "이 지역에 주민 생활권이 없어 작업자를 보낼 수 없음"}</small><button class="primary" data-action="develop-frontier-site" data-site-id="${site.id}" ${canDispatchWorkers ? "" : "disabled"}>생활권에서 작업자 파견</button></div>`}
    </article>
  `;
}

function livingAreaCard(state, regionId) {
  const frontier = state.frontier;
  const definition = livingAreaDefinitionForRegion(regionId);
  const livingArea = definition ? frontier.livingAreas[definition.id] : null;
  if (!definition || !livingArea) return "";
  const inhabited = livingArea.status === "inhabited";
  const unlocked = livingAreaRequirementsMet(frontier, definition.id);
  const used = livingAreaWorkersUsed(frontier, definition.id);
  const available = availableLivingAreaPopulation(frontier, definition.id);
  const buildText = Object.entries(definition.build).map(([materialId, amount]) => `${MATERIAL_DEFS[materialId]?.name || materialId} ${amount}`).join(" · ");
  const unlockName = definition.unlockZoneId ? FRONTIER_ZONE_DEFS[definition.unlockZoneId]?.name : null;
  const discovered = Boolean(livingArea.discovered);
  return `
    <section class="frontier-living-area ${inhabited ? "inhabited" : unlocked ? "available" : "locked"}">
      <header><span>${definition.glyph}</span><div><p class="eyebrow">${definition.kind === "estate" ? "행정 중심 · 유일한 내 영지" : "별도 생활권 · 작은 촌락"}</p><h2>${definition.name}</h2><small>${definition.description}</small></div></header>
      ${inhabited ? `
        <div class="living-area-stats"><span>거주민 <b>${livingArea.residents}/${definition.capacity}</b></span><span>작업 파견 <b>${used}</b></span><span>가용 노동 <b>${available}</b></span><span>생활권 안전 <b>${livingArea.safety}</b></span></div>
        <p>${escapeHtml(livingArea.lastEvent)}</p>
      ` : unlocked ? `
        <p><b>생활권 후보지 확보.</b> 점령지 안에 사는 것이 아니라, 안전한 별도 마을을 만든 뒤 작업자를 오가게 한다.</p>
        <button class="primary" data-action="establish-living-area" data-living-area-id="${definition.id}">생활권 조성 · ${buildText} · 주민 ${definition.foundingResidents}명 이주</button>
      ` : `<p><b>${!discovered ? `${WORLD_REGION_DEFS[regionId].villageName} 방문 필요.` : `${unlockName} 점령 필요.`}</b> ${!discovered ? "지역 필드의 부락 타일까지 이동해 안으로 들어가야 생활권 후보지가 기록된다." : "길을 확보해도 자동으로 주민이 들어오지는 않는다."}</p>`}
      <small class="living-area-rule">점령지: 치안과 통행권 · 생활권: 주거와 인구 · 작업지: 생산과 수송</small>
    </section>
  `;
}

function monsterEcologyPanel(regionId) {
  const ecology = MONSTER_ECOLOGY_DEFS[regionId] || [];
  return `
    <section class="monster-ecology-panel">
      <div><p class="eyebrow">지역 위협 생태</p><h2>고블린·오크·늑대·곰</h2></div>
      <div class="monster-ecology-grid">${ecology.map((entry) => `
        <article><strong>${entry.name}</strong><small>${entry.role}</small><p>${entry.behavior}</p><em>대응: ${entry.counter}</em></article>
      `).join("")}</div>
    </section>
  `;
}

function frontierSquadCard(state, squad, zoneId) {
  const mission = squad.mission;
  const members = squad.memberIds.map((unitId) => UNIT_DEFS[unitId]).filter(Boolean);
  const freeUnits = freeFrontierUnits(state).slice(0, 7);
  if (!squad.unlocked) return `<article class="frontier-squad-card locked"><span>◇</span><div><strong>${squad.name} 잠김</strong><small>${squad.id === "wardens" ? "첫 동료가 추가 합류하면 해금" : "보유 유닛 10명에서 해금"}</small></div></article>`;
  return `
    <article class="frontier-squad-card ${mission ? "on-mission" : ""}">
      <header><div><strong>${squad.name}</strong><small>${squad.id === "vanguard" ? "직접 출정 · 현재 동료 2인 편성과 연동" : mission ? `${FRONTIER_ZONE_DEFS[mission.zoneId].name} ${mission.type === "survey" ? "탐사" : "토벌"} · ${mission.remaining}주기` : "자동 원정 대기"}</small></div><b>${members.length}/${PARTY_LIMIT}</b></header>
      <div class="squad-member-row">${members.map((unit) => `<button class="unit-mini selected" ${squad.id === "vanguard" || mission ? "disabled" : `data-action="assign-frontier-squad" data-unit-id="${unit.id}" data-squad-id="${squad.id}"`}>${unit.glyph} ${unit.name}</button>`).join("") || "<i>배치된 유닛 없음</i>"}</div>
      ${squad.id !== "vanguard" && !mission ? `
        <div class="squad-member-row free">${freeUnits.map((unitId) => `<button class="unit-mini" data-action="assign-frontier-squad" data-unit-id="${unitId}" data-squad-id="${squad.id}">+ ${UNIT_DEFS[unitId].name}</button>`).join("")}</div>
        <div class="squad-mission-actions"><button class="secondary" data-action="dispatch-frontier-mission" data-squad-id="${squad.id}" data-zone-id="${zoneId}" data-mission-type="survey" ${!members.length || !occupiedZone(state.frontier, zoneId) ? "disabled" : ""}>자동 탐사</button><button class="secondary" data-action="dispatch-frontier-mission" data-squad-id="${squad.id}" data-zone-id="${zoneId}" data-mission-type="suppress" ${!members.length || !occupiedZone(state.frontier, zoneId) ? "disabled" : ""}>자동 토벌</button></div>
      ` : ""}
    </article>
  `;
}

function frontierFactionCard(state, factionId) {
  const definition = FRONTIER_FACTION_DEFS[factionId];
  const faction = state.frontier.factions[factionId];
  if (!faction.met) return `<article class="frontier-faction-card unknown"><span>?</span><div><p class="eyebrow">미확인 문명</p><h3>현지 세력과 아직 접촉하지 않음</h3><small>첫 세부 구역에 출정하면 사절 또는 순찰대와 조우한다.</small></div></article>`;
  const freeUnits = freeFrontierUnits(state).slice(0, 6);
  return `
    <article class="frontier-faction-card">
      <header><span>♜</span><div><p class="eyebrow">${definition.ruler}</p><h3>${definition.name}</h3><small>${definition.description}</small></div></header>
      <div class="faction-metrics"><span>신뢰 <b>${faction.trust}</b></span><span>경계 <b>${faction.vigilance}</b></span><span>정보 <b>${faction.intel}</b></span><span>민심 <b>${faction.intel >= 20 ? faction.satisfaction : "미확인"}</b></span><span>불안 <b>${faction.intel >= 40 ? faction.unrest : "미확인"}</b></span></div>
      <p>${escapeHtml(faction.lastEvent || "서로의 의도를 살피고 있다.")}</p>
      <div class="faction-actions">
        <button class="primary" data-action="barter-frontier" data-faction-id="${factionId}">${MATERIAL_DEFS[definition.wantsMaterial].name} 2 → ${MATERIAL_DEFS[definition.exportMaterial].name} 1</button>
        <button class="danger" data-action="pressure-frontier" data-faction-id="${factionId}" ${state.estateDefense.pending ? "disabled" : ""}>개척 압박 · 보복 위험</button>
      </div>
      <div class="spy-row"><small>편성 밖 유닛으로 공작</small>${freeUnits.map((unitId) => `<span><b>${UNIT_DEFS[unitId].name}</b><button data-action="spy-frontier" data-faction-id="${factionId}" data-unit-id="${unitId}" data-operation="recon">정찰</button><button data-action="spy-frontier" data-faction-id="${factionId}" data-unit-id="${unitId}" data-operation="agitate">이간</button></span>`).join("") || "<i>가용 유닛 없음</i>"}</div>
    </article>
  `;
}

const FRONTIER_SITE_POSITIONS = [[19, 29], [47, 22], [79, 29], [75, 60], [21, 67]];

function frontierLocalEntries(definition, zone) {
  const actual = zone.sites.map((site) => ({ id: site.id, typeId: site.typeId, site, discovered: true }));
  const represented = new Set(actual.map((entry) => entry.typeId));
  const candidates = [...new Set(["mine", "dungeon", "cave", "ruin", "herb", ...definition.sitePool])];
  for (const typeId of candidates) {
    if (actual.length >= FRONTIER_SITE_POSITIONS.length) break;
    if (represented.has(typeId) || !DISCOVERY_SITE_DEFS[typeId]) continue;
    actual.push({ id: `unknown:${typeId}`, typeId, site: null, discovered: false });
    represented.add(typeId);
  }
  return actual.slice(0, FRONTIER_SITE_POSITIONS.length).map((entry, index) => ({ ...entry, position: FRONTIER_SITE_POSITIONS[index] }));
}

function frontierLocalNode(entry) {
  const definition = DISCOVERY_SITE_DEFS[entry.typeId];
  const selected = view.frontierSelectedSiteId === entry.id;
  return `
    <button class="frontier-local-node ${entry.discovered ? "discovered" : "unknown"} ${definition.dungeon ? "combat-site" : "work-site"} ${selected ? "selected" : ""}" data-action="select-frontier-site" data-site-id="${entry.id}" style="--site-x:${entry.position[0]}%;--site-y:${entry.position[1]}%">
      <i>${entry.discovered ? definition.glyph : "?"}</i>
      <span><strong>${entry.discovered ? definition.name : "미확인 장소"}</strong><small>${entry.discovered ? (definition.dungeon ? "탐험 가능" : `품질 ${entry.site.quality}`) : `${definition.name} 가능성`}</small></span>
    </button>
  `;
}

function frontierOperationCard(state, definition) {
  const frontier = state.frontier;
  const zone = frontier.zones[definition.id];
  const tier = ZONE_TIER_DEFS[definition.tier];
  const available = zoneRequirementsMet(frontier, definition.id) && zone.status === "available";
  const occupied = occupiedZone(frontier, definition.id);
  const suppressionLeft = suppressionCyclesRemaining(frontier, definition.id);
  const requirements = definition.requirements.map((zoneId) => FRONTIER_ZONE_DEFS[zoneId].name).join(definition.requireAny ? " 또는 " : " + ");
  return `
    <article class="frontier-operation-card">
      <header><span style="color:${tier.color}">${tier.glyph}</span><div><p class="eyebrow">${tier.name} 구역 · ${frontierStatusLabel(zone.status)}</p><h2>${definition.name}</h2></div></header>
      <p>${escapeHtml(definition.description)}</p>
      <div class="zone-stat-grid"><span>위협 <b>${zone.threat}</b></span><span>안정 <b>${zone.stability}</b></span><span>방치 <b>${zone.neglect || 0}</b></span><span>토벌 <b>${suppressionLeft === null ? "-" : `${suppressionLeft}주기`}</b></span></div>
      ${requirements ? `<p class="zone-requirement">진입 조건 · ${requirements}${definition.requireAny ? " 중 한 곳" : ""}</p>` : '<p class="zone-requirement ready">내 영지에서 바로 진입할 수 있는 개척로</p>'}
      <div class="zone-detail-actions">
        ${available ? `<button class="primary" data-action="start-frontier-adventure" data-zone-id="${definition.id}" data-purpose="conquest">필드 진입·점령</button>` : ""}
        ${occupied ? `<button class="primary" data-action="start-frontier-adventure" data-zone-id="${definition.id}" data-purpose="suppression">필드 토벌 출정</button><button class="secondary" data-action="upgrade-frontier-route" data-zone-id="${definition.id}" ${zone.routeLevel >= 3 ? "disabled" : ""}>수송로 ${zone.routeLevel}/3</button>` : ""}
      </div>
    </article>
  `;
}

function frontierSiteInspector(state, definition, entries) {
  if (view.frontierSelectedSiteId === "operation") return frontierOperationCard(state, definition);
  const entry = entries.find((candidate) => candidate.id === view.frontierSelectedSiteId) || entries[0];
  if (!entry) return frontierOperationCard(state, definition);
  const siteDefinition = DISCOVERY_SITE_DEFS[entry.typeId];
  const zone = state.frontier.zones[definition.id];
  const occupied = occupiedZone(state.frontier, definition.id);
  if (!entry.discovered) return `
    <article class="frontier-operation-card unknown-site-card">
      <header><span>?</span><div><p class="eyebrow">아직 발견되지 않음</p><h2>${siteDefinition.name} 가능성</h2></div></header>
      <p>점령·토벌 원정이나 자동 탐사를 보내면 이 위치의 정체와 품질이 드러난다.</p>
      <button class="primary" data-action="start-frontier-adventure" data-zone-id="${definition.id}" data-purpose="${occupied ? "suppression" : "conquest"}">${occupied ? "토벌하며 탐색" : "진입하며 탐색"}</button>
    </article>
  `;
  return `
    <article class="frontier-selected-site">
      <div class="selected-site-heading"><span>${siteDefinition.glyph}</span><div><p class="eyebrow">발견된 현장 · 품질 ${entry.site.quality}</p><h2>${siteDefinition.name}</h2></div></div>
      ${frontierSiteCard(state, definition.id, entry.site)}
      <button class="primary site-expedition-button" data-action="start-frontier-adventure" data-zone-id="${definition.id}" data-purpose="${occupied ? "suppression" : "conquest"}">${siteDefinition.dungeon ? "내부 탐험 출정" : "현장 조사 출정"}</button>
    </article>
  `;
}

function frontierLocalMap(state, definition) {
  const zone = state.frontier.zones[definition.id];
  const entries = frontierLocalEntries(definition, zone);
  const selectedExists = view.frontierSelectedSiteId === "operation" || entries.some((entry) => entry.id === view.frontierSelectedSiteId);
  if (!selectedExists) view.frontierSelectedSiteId = "operation";
  return `
    <section class="frontier-local-stage">
      <div class="frontier-local-map" data-map-layer="local" aria-label="${escapeHtml(definition.name)} 하위 탐사 지도">
        <div class="local-map-vignette"></div>
        <button class="frontier-operation-node ${view.frontierSelectedSiteId === "operation" ? "selected" : ""}" data-action="select-frontier-site" data-site-id="operation"><i>⚑</i><span><strong>${definition.name}</strong><small>진입·토벌 선택</small></span></button>
        ${entries.map(frontierLocalNode).join("")}
        <div class="local-map-route route-a"></div><div class="local-map-route route-b"></div><div class="local-map-route route-c"></div>
        <p class="local-map-hint">광산·동굴·던전을 눌러 현장 정보와 출정 명령을 확인</p>
        ${mapZoomControls("local")}
      </div>
      <aside class="frontier-site-inspector">${frontierSiteInspector(state, definition, entries)}</aside>
    </section>
  `;
}

function frontierMenuContent(state, menuId, definition) {
  const frontier = state.frontier;
  const zone = frontier.zones[definition.id];
  if (menuId === "settlement") return livingAreaCard(state, definition.regionId);
  if (menuId === "squads") return `<section class="frontier-management"><div><p class="eyebrow">여러 원정대</p><h2>직접 원정과 자동 순찰</h2></div><div class="frontier-squad-grid">${frontier.squads.map((squad) => frontierSquadCard(state, squad, definition.id)).join("")}</div></section>`;
  if (menuId === "ecology") return monsterEcologyPanel(definition.regionId);
  if (menuId === "logistics") return `<section class="frontier-zone-detail"><div><p class="eyebrow">작업지·호위·수송</p><h2>${definition.name} 물류</h2></div><div class="frontier-sites">${zone.sites.length ? zone.sites.map((site) => frontierSiteCard(state, definition.id, site)).join("") : "<p>아직 발견된 작업지가 없다. 필드 원정이나 자동 탐사를 보내야 한다.</p>"}</div></section>`;
  if (menuId === "diplomacy") return `<section class="frontier-diplomacy"><div><p class="eyebrow">문명 조우 · 물물교환 · 첩보</p><h2>${FRONTIER_FACTION_DEFS[definition.factionId].name}</h2></div>${frontierFactionCard(state, definition.factionId)}</section>`;
  return `<section class="frontier-events"><header><h2>개척 보고</h2><small>생산품은 주기를 넘길 때 이동하며, 호위가 없으면 약탈될 수 있다.</small></header>${frontier.eventLog.slice(0, 12).map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</section>`;
}

function frontierSideMenus(state, definition) {
  const menus = [
    ["settlement", "⌂", "생활권", "left"], ["squads", "♟", "원정대", "left"], ["ecology", "☠", "생태", "left"],
    ["logistics", "⚒", "물류", "right"], ["diplomacy", "♜", "외교", "right"], ["report", "▤", "보고", "right"]
  ];
  const buttons = (side) => menus.filter((entry) => entry[3] === side).map(([id, glyph, label]) => `<button class="${view.frontierMenuOpen === id ? "active" : ""}" data-action="toggle-frontier-menu" data-menu-id="${id}"><i>${glyph}</i><span>${label}</span></button>`).join("");
  return `
    <nav class="frontier-side-menu left" aria-label="개척 관리 메뉴">${buttons("left")}</nav>
    <nav class="frontier-side-menu right" aria-label="지역 운영 메뉴">${buttons("right")}</nav>
    ${view.frontierMenuOpen ? `<aside class="frontier-menu-drawer ${menus.find((entry) => entry[0] === view.frontierMenuOpen)?.[3] || "right"}"><button class="drawer-close" data-action="toggle-frontier-menu" data-menu-id="${view.frontierMenuOpen}">×</button>${frontierMenuContent(state, view.frontierMenuOpen, definition)}</aside>` : ""}
  `;
}

function frontierScreen(state) {
  const frontier = state.frontier;
  const regionId = state.adventure?.selectedRegionId || "central";
  const region = WORLD_REGION_DEFS[regionId];
  const zones = Object.values(FRONTIER_ZONE_DEFS).filter((zone) => zone.regionId === regionId);
  const selectedDefinition = zones.find((zone) => zone.id === (view.frontierZoneOpen || frontier.selectedZoneId)) || zones[0];
  const localOpen = Boolean(view.frontierZoneOpen);
  return `
    <main class="screen frontier-screen frontier-map-shell ${localOpen ? "local-layer" : "regional-layer"}" style="--region-color:${region.accent}">
      <header class="frontier-map-heading">
        <button class="map-back-button" data-action="${localOpen ? "close-frontier-zone-map" : "close-frontier"}">‹</button>
        <div><p class="eyebrow">${localOpen ? `${region.name} · 하위 필드` : "대륙 원정 · 지역 확대"}</p><h1>${localOpen ? selectedDefinition.name : region.name}</h1><small>${localOpen ? "현장을 선택해 진입·토벌·개발 명령" : "필드를 눌러 한 단계 더 확대"}</small></div>
      </header>
      <section class="frontier-map-summary"><span>주기 <b>${frontier.cycle}</b></span><span>노동 <b>${availableFrontierPopulation(frontier)}/${frontier.population.total}</b></span><span>파견 <b>${frontierPopulationUsed(frontier)}</b></span><button data-action="advance-frontier-cycle">주기 진행</button></section>
      ${localOpen ? frontierLocalMap(state, selectedDefinition) : `
        <section class="frontier-regional-map" data-map-layer="regional" aria-label="${escapeHtml(region.name)} 확대 지도">
          <div class="regional-map-shade region-${regionId}"></div>
          <div class="regional-map-title"><span>${region.glyph}</span><div><strong>${region.name}</strong><small>${zones.filter((zone) => occupiedZone(frontier, zone.id)).length}/${zones.length} 점령 · 안전 → 주의 → 위험</small></div></div>
          ${zones.map((zone, index) => frontierZoneNode(state, zone, index, zones.length)).join("")}
          <p class="regional-map-hint">거점 필드를 누르면 광산·동굴·던전 지도로 확대됩니다</p>
          ${mapZoomControls("regional")}
        </section>
      `}
      ${frontierSideMenus(state, selectedDefinition)}
    </main>
  `;
}

function zoneFeatureGlyph(feature) {
  if (!feature) return "";
  if (feature.type === "encounter" && feature.cleared) return "✓";
  return feature.glyph || "";
}

function zoneTileLabel(zone, run, x, y, known) {
  if (!known) return "미확인 지역";
  if (run.player.x === x && run.player.y === y) return "원정대 현재 위치";
  const feature = zone.features[keyOf(x, y)];
  if (feature) return `${feature.name}${feature.cleared ? " · 정리 완료" : ""}`;
  return zone.tiles[y][x] === "wall" ? (zone.kind === "field" ? "지형 장애물" : "던전 벽") : "이동 가능한 길";
}

function joystickControl(mode) {
  const active = view.joystickMode === mode;
  const x = active ? Math.round(view.joystickX * 34) : 0;
  const y = active ? Math.round(view.joystickY * 34) : 0;
  const position = active ? `--joystick-left:${view.joystickCenterX}px;--joystick-top:${view.joystickCenterY}px;` : "";
  return `
    <div class="movement-touch-zone ${mode}-movement-zone" data-control="joystick" data-control-mode="${mode}" aria-label="처음 누른 위치에서 이동 조이스틱 열기"><span>왼쪽 영역을 누른 채 밀어서 이동</span></div>
    <div class="virtual-joystick floating-joystick ${mode}-joystick ${active ? "active" : ""}" style="${position}--stick-x:${x}px;--stick-y:${y}px" aria-hidden="true">
      <span class="joystick-arrow up">▲</span><span class="joystick-arrow right">▶</span><span class="joystick-arrow down">▼</span><span class="joystick-arrow left">◀</span>
      <i class="joystick-knob"></i>
      <b>이동</b>
    </div>
  `;
}

function renderAdventureZone(run) {
  const zone = currentZone(run);
  const viewSize = zone.kind === "field" ? FIELD_VIEW_SIZE : DUNGEON_VIEW_SIZE;
  const half = Math.floor(viewSize / 2);
  const startX = Math.max(0, Math.min(zone.width - viewSize, run.player.x - half));
  const startY = Math.max(0, Math.min(zone.height - viewSize, run.player.y - half));
  const seen = new Set(zone.seen || []);
  const path = new Set(view.adventurePath.map((point) => keyOf(point.x, point.y)));
  const cells = [];
  for (let y = startY; y < startY + viewSize; y += 1) {
    for (let x = startX; x < startX + viewSize; x += 1) {
      const cellKey = keyOf(x, y);
      const known = seen.has(cellKey);
      const tile = zone.tiles[y]?.[x] || "wall";
      const feature = known ? zone.features[cellKey] : null;
      const playerHere = run.player.x === x && run.player.y === y;
      const target = view.adventureTarget?.x === x && view.adventureTarget?.y === y;
      const classes = [
        "zone-tile",
        known ? tile : "unknown",
        zone.kind,
        feature ? `feature-${feature.type}` : "",
        feature?.cleared ? "cleared" : "",
        playerHere ? "party-here" : "",
        path.has(cellKey) ? "travel-path" : "",
        target ? "travel-target" : ""
      ].filter(Boolean).join(" ");
      const marker = playerHere ? "⚑" : zoneFeatureGlyph(feature);
      const canMove = known && tile === "floor" && !playerHere;
      cells.push(`<button class="${classes}" data-action="zone-tile" data-x="${x}" data-y="${y}" aria-label="${escapeHtml(zoneTileLabel(zone, run, x, y, known))}" ${canMove ? "" : "disabled"}>${marker}</button>`);
    }
  }
  return `<section class="zone-control-wrap"><div class="zone-viewport ${zone.kind} region-${run.regionId}" style="--zone-view:${viewSize}" role="grid" aria-label="${zone.kind === "field" ? "넓은 지역 필드" : "좁은 던전"}">${cells.join("")}</div>${joystickControl("field")}<div class="field-stick-hint">조이스틱으로 이동</div></section>`;
}

function adventureScreen(state) {
  const run = state.adventure.run;
  const region = WORLD_REGION_DEFS[run.regionId];
  const zone = currentZone(run);
  const encounterTotal = Object.values(zone.features).filter((feature) => feature.type === "encounter").length;
  const encounterCleared = Object.values(zone.features).filter((feature) => feature.type === "encounter" && feature.cleared).length;
  const explored = Math.round(((zone.seen?.length || 0) / (zone.width * zone.height)) * 100);
  return `
    <main class="screen adventure-screen" style="--region-color:${region.accent}">
      <section class="adventure-heading">
        <div><p class="eyebrow">${region.danger} · ${region.pressure}</p><h1>${region.glyph} ${zone.kind === "field" ? region.name : zone.name}</h1><small>${zone.kind === "field" ? "41×41 광역 필드" : "15×15 밀집 던전"} · 발견 ${explored}%</small></div>
        <span class="zone-kind-badge ${zone.kind}">${zone.kind === "field" ? "FIELD" : "DUNGEON"}</span>
      </section>
      <section class="adventure-status-row">
        <span>조우 정리 <b>${encounterCleared}/${encounterTotal}</b></span>
        <span>불규칙 습격 <b>${run.irregularAmbushes || 0}</b></span>
        <span>원정 승리 <b>${run.encountersWon}</b></span>
        <span>고철 <b>${run.cargo.scrap}</b></span>
      </section>
      ${renderAdventureZone(run)}
      <div class="zone-objective">
        <span>${zone.kind === "field" ? `▤ ${region.villageName} 또는 ${region.dungeonGlyph} ${region.dungeonName} 좌표까지 이동` : `☠ 좁은 통로의 수문대를 돌파하고 던전 지배자 격파`}</span>
        <b>${view.adventureTarget ? "목표로 이동 중" : "왼쪽 조이스틱 이동 · 지도에서 장거리 지정"}</b>
      </div>
      ${squadPreview(state, true)}
      <div class="adventure-log">${state.log.slice(0, 4).map((entry) => `<p class="${entry.tone}">${escapeHtml(entry.text)}</p>`).join("")}</div>
      <nav class="adventure-actions">
        <button class="ghost" data-action="adventure-back">뒤로</button>
        <button class="secondary" data-action="open-zone-map">지역 지도</button>
        <button class="secondary" data-action="open-bag">가방</button>
        <button class="danger" data-action="request-adventure-retreat">원정 종료</button>
      </nav>
    </main>
  `;
}

function defenseReserveUnits(state) {
  return state.adventure.roster.filter((unitId) => !state.adventure.party.includes(unitId));
}

function defenseAssignedGate(state, unitId) {
  return Object.entries(state.estateDefense.deployments.gates).find(([, unitIds]) => unitIds.includes(unitId))?.[0] || null;
}

function defenseUnitButtons(state, gateId = null, remnants = false) {
  const reserve = defenseReserveUnits(state);
  if (!reserve.length) return '<p class="defense-empty-units">현재 가용 유닛은 모두 개척자 기동대 소속이다. 지역 점령으로 추가 합류한 유닛부터 고정 수비와 소탕에 배치할 수 있다.</p>';
  return `<div class="defense-unit-pool">${reserve.map((unitId) => {
    const unit = UNIT_DEFS[unitId];
    const assignedGate = defenseAssignedGate(state, unitId);
    const selected = remnants ? state.estateDefense.deployments.remnants.includes(unitId) : assignedGate === gateId;
    const unavailable = engine.frontierUnitBusy(unitId, null, true);
    const label = remnants
      ? `${unit.glyph} ${unit.name}`
      : `${unit.glyph} ${unit.name}${assignedGate && assignedGate !== gateId ? ` · ${ESTATE_GATE_DEFS[assignedGate].name}` : ""}`;
    return `<button class="defense-unit-chip ${selected ? "selected" : ""}" data-action="${remnants ? "assign-defense-remnant" : "assign-defense-gate"}" data-unit-id="${unitId}" ${gateId ? `data-gate-id="${gateId}"` : ""} ${unavailable ? "disabled" : ""}>${label}</button>`;
  }).join("")}</div>`;
}

function defensePlanningOverlay(state) {
  if (!view.defensePlanOpen || !state.estateDefense.pending || state.estateDefense.campaign) return "";
  const defense = state.estateDefense;
  const totalGarrison = Object.values(defense.deployments.gates).reduce((sum, ids) => sum + ids.length, 0);
  return `
    <div class="overlay defense-plan-overlay" role="dialog" aria-modal="true" aria-label="네 성문 수비 배치">
      <section class="defense-plan-sheet">
        <header class="sheet-header"><div><p class="eyebrow">동문·서문·남문·북문 동시 방어</p><h2>♜ 수성전 배치</h2></div><button class="secondary" data-action="close-defense-plan">내 영지로</button></header>
        <section class="defense-plan-intro">
          <div><span>개척자 기동대</span><strong>나 + 자동 동료 ${state.adventure.party.length}명</strong><small>이 부대는 한 문에 고정되지 않고 전황 지도에서 네 성문을 오간다.</small></div>
          <div><span>고정 수비대</span><strong>${totalGarrison}명 배치</strong><small>성문당 권장 5명, 최대 ${GATE_GARRISON_LIMIT}명. 빈자리는 기본 민병대가 버틴다.</small></div>
        </section>
        ${squadPreview(state, true)}
        <div class="defense-gate-plan-grid">${Object.values(ESTATE_GATE_DEFS).map((gate) => `
          <article class="defense-gate-plan-card">
            <header><span>${gate.glyph}</span><div><strong>${gate.name} · ${defense.deployments.gates[gate.id].length}/${GATE_GARRISON_LIMIT}</strong><small>${gate.description}</small></div></header>
            ${defenseUnitButtons(state, gate.id, false)}
          </article>
        `).join("")}</div>
        <section class="remnant-plan-card">
          <header><div><p class="eyebrow">성문 방어 뒤 별도 임무</p><h3>내부 잔당 소탕대 ${defense.deployments.remnants.length}/${REMNANT_TEAM_LIMIT}</h3></div><span>⌕</span></header>
          <p>성문을 모두 막아도 숨어든 잔당이 창고와 민가를 습격한다. 고정 수비 유닛을 소탕대에 중복 지정할 수 있다.</p>
          ${defenseUnitButtons(state, null, true)}
        </section>
        <div class="defense-plan-actions"><button class="secondary" data-action="close-defense-plan">배치 더 고민하기</button><button class="danger" data-action="begin-defense-campaign">네 성문 방어 시작</button></div>
      </section>
    </div>
  `;
}

function defenseGateCampaignNode(state, gateDef) {
  const campaign = state.estateDefense.campaign;
  const gate = campaign.gates[gateDef.id];
  const ratio = Math.max(0, gate.durability / gate.maxDurability) * 100;
  const active = campaign.activeGateId === gateDef.id;
  const canEnter = campaign.phase === "gates" && gate.status === "underAttack";
  return `
    <button class="defense-gate-node status-${gate.status} ${active ? "active" : ""}" style="--gate-x:${gateDef.mapX}%;--gate-y:${gateDef.mapY}%;--gate-hp:${ratio}%" data-action="enter-defense-gate" data-gate-id="${gateDef.id}" ${canEnter ? "" : "disabled"}>
      <span>${gateDef.glyph}</span><strong>${gateDef.name}</strong><small>${gateDurabilityGrade(gate)} · ${Math.ceil(gate.durability)}/${gate.maxDurability}</small><em><i></i></em><b>정예 ${gate.garrisonIds.length} · 민병 ${Math.max(0, 5 - gate.garrisonIds.length)}</b>
    </button>
  `;
}

function defenseRemnantPanel(state) {
  const defense = state.estateDefense;
  const campaign = defense.campaign;
  const assigned = defense.deployments.remnants;
  const power = Math.round(groupDefensePower(assigned, state.adventure.unitProgress, UNIT_DEFS));
  const required = campaign.breachedGateId ? 20 : 10;
  return `
    <section class="defense-remnant-panel">
      <header><span>⌕</span><div><p class="eyebrow">마지막 단계 · 내부 치안전</p><h2>성내 잔당 소탕</h2><small>${campaign.breachedGateId ? `${ESTATE_GATE_DEFS[campaign.breachedGateId].name} 돌파로 잔당 규모가 커졌다.` : "성문은 지켰지만 소수의 적이 민가와 창고에 숨어들었다."}</small></div></header>
      <div class="remnant-power"><span>배치 ${assigned.length}/${REMNANT_TEAM_LIMIT}</span><b>소탕력 ${power}/${required}</b><i style="--sweep:${Math.min(100, power / required * 100)}%"></i></div>
      <p>기동대는 부상자와 성문을 지킨다. 고정 수비대 중 최대 5명을 별도의 소탕대로 지정할 수 있다.</p>
      ${defenseUnitButtons(state, null, true)}
      <button class="danger" data-action="resolve-defense-remnants">잔당 소탕 실행</button>
    </section>
  `;
}

function defenseCampaignScreen(state) {
  const defense = state.estateDefense;
  const campaign = defense.campaign;
  if (!campaign) return hubScreen(state);
  const held = Object.values(campaign.gates).filter((gate) => gate.status === "held").length;
  const final = campaign.finalResult;
  return `
    <main class="screen defense-campaign-screen">
      <header class="defense-campaign-heading"><div><p class="eyebrow">${defense.pending.title}</p><h1>${campaign.phase === "gates" ? "♜ 네 성문 전황" : campaign.phase === "remnants" ? "⌕ 내부 잔당" : "⚑ 수성전 결과"}</h1><small>개척자 기동대는 네 문을 오가며 싸우고, 고정 수비대는 미지원 성문의 내구도를 지킨다.</small></div><span>${held}/4 방어</span></header>
      ${campaign.phase === "gates" ? `
        <section class="defense-war-summary"><span>경과 <b>${Math.floor(campaign.elapsed / 1000)}초</b></span><span>기동 ${campaign.switches}회</span><span>방어 시설 <b>${defense.fortification}/5</b></span><span>돌파 <b>${campaign.breachedGateId ? ESTATE_GATE_DEFS[campaign.breachedGateId].name : "없음"}</b></span></section>
        <section class="defense-castle-map">
          <div class="castle-wall north-wall"></div><div class="castle-wall east-wall"></div><div class="castle-wall south-wall"></div><div class="castle-wall west-wall"></div>
          <div class="castle-keep"><span>♜</span><strong>내 영지</strong><small>주민 대피 중</small></div>
          ${Object.values(ESTATE_GATE_DEFS).map((gate) => defenseGateCampaignNode(state, gate)).join("")}
        </section>
        <p class="defense-map-help">지원할 성문을 눌러 이동한다. 다른 문에서 싸우는 동안에도 미지원 성문은 공격받으며, 전투 도중 전황 지도로 돌아와 문을 바꿀 수 있다.</p>
        ${squadPreview(state, true)}
      ` : campaign.phase === "remnants" ? defenseRemnantPanel(state) : `
        <section class="defense-final-card ${final?.success ? "success" : "failure"}"><span>${final?.success ? "⚑" : "△"}</span><div><p class="eyebrow">다단계 수성전 종료</p><h2>${escapeHtml(final?.title || "방어 결과")}</h2><p>${escapeHtml(final?.description || "전황 정산 중")}</p></div><button class="primary" data-action="finish-defense-campaign">내 영지로 복귀</button></section>
      `}
      <section class="defense-operation-log"><h2>방어 작전 기록</h2>${campaign.eventLog.slice(0, 8).map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</section>
    </main>
  `;
}

function ensureBattleCamera(battle) {
  if (view.battleCameraBattle === battle) return;
  view.battleCameraBattle = battle;
  view.battleCameraYaw = BATTLE_CAMERA_YAW;
}

function battleProjection(entity, battle) {
  const player = battle.units.find((unit) => unit.id === battle.playerId) || entity;
  if (entity.id === battle.playerId) return { x: 50, y: 80, scale: 1.36, depth: 0, z: 900, visible: true };
  const dx = entity.x - player.x;
  const dy = entity.y - player.y;
  const forwardX = Math.cos(view.battleCameraYaw);
  const forwardY = Math.sin(view.battleCameraYaw);
  const rightX = -forwardY;
  const rightY = forwardX;
  const depth = dx * forwardX + dy * forwardY;
  const lateral = dx * rightX + dy * rightY;
  const frontDepth = Math.max(0, depth);
  const perspective = 1 / (1 + frontDepth / 82);
  const x = 50 + lateral * 2.22 * perspective;
  const y = 80 - frontDepth * 0.78 * perspective - Math.max(0, -depth) * 0.08;
  return {
    x,
    y,
    depth,
    z: Math.round(760 - Math.max(-48, Math.min(130, depth)) * 4.7),
    scale: Math.max(0.46, Math.min(1.2, 1.22 * perspective)),
    visible: depth >= -24 && x > -8 && x < 108 && y > 15 && y < 92
  };
}

function battleRadar(battle) {
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  if (!player) return "";
  const dots = [...battle.units, ...battle.enemies]
    .filter((entity) => entity.hp > 0)
    .map((entity) => {
      const dx = entity.x - player.x;
      const dy = entity.y - player.y;
      const forward = dx * Math.cos(view.battleCameraYaw) + dy * Math.sin(view.battleCameraYaw);
      const lateral = dx * -Math.sin(view.battleCameraYaw) + dy * Math.cos(view.battleCameraYaw);
      const x = Math.max(7, Math.min(93, 50 + lateral * 0.72));
      const y = Math.max(7, Math.min(93, 50 - forward * 0.72));
      const kind = entity.id === battle.playerId ? "player" : entity.team === "enemy" ? "enemy" : "ally";
      return `<i class="radar-dot ${kind}" style="--radar-x:${x}%;--radar-y:${y}%"></i>`;
    }).join("");
  return `<aside class="battle-radar"><strong>전장</strong><span class="radar-cone"></span>${dots}</aside>`;
}

function battlePartyRail(battle) {
  return `<aside class="battle-party-rail">${battle.units.filter((unit) => !unit.controlled && !unit.summonType).map((unit) => {
    const hp = Math.max(0, unit.hp / unit.maxHp) * 100;
    return `<div class="party-rail-unit"><i class="${portraitClass(portraitIndexForUnit(unit))}"></i><span><strong>${escapeHtml(unit.name)}</strong><em><b style="width:${hp}%"></b></em><small>${Math.ceil(unit.hp)}/${unit.maxHp} · 자동</small></span></div>`;
  }).join("")}</aside>`;
}

function battleEntity(entity, battle) {
  const hpRatio = Math.max(0, entity.hp / entity.maxHp);
  const targeted = battle.playerTargetId === entity.id;
  const projection = battleProjection(entity, battle);
  const portrait = entity.team === "unit" && !entity.summonType ? portraitClass(portraitIndexForUnit(entity)) : "";
  const playerArt = playerBattleArtClass(battle.playerKitId);
  const monsterArt = entity.team === "enemy" || entity.summonType ? monsterBattleArtClass(entity) : "";
  const companionRegion = entity.team === "unit" && !entity.controlled && !entity.summonType ? battleCompanionClass(entity) : "";
  const companionArt = companionRegion ? COMPANION_BATTLE_ART_CLASSES[companionRegion] : "";
  const speciesClass = monsterArt ? `species-${entity.species}` : "";
  const statuses = Object.values(entity.statuses || {})
    .filter((status) => status.expiresAt > battle.elapsed && STATUS_EFFECT_DEFS[status.id])
    .map((status) => `<u class="negative" title="${escapeHtml(STATUS_EFFECT_DEFS[status.id].name)}">${STATUS_EFFECT_DEFS[status.id].glyph}${status.stacks > 1 ? status.stacks : ""}</u>`);
  const positive = [
    entity.positiveEffects?.regeneration?.endsAt > battle.elapsed ? '<u class="positive" title="지속 회복">✚</u>' : "",
    entity.positiveEffects?.frostRetaliation?.endsAt > battle.elapsed ? '<u class="positive" title="피격 시 빙결">❄</u>' : "",
    entity.positiveEffects?.boneArmor?.endsAt > battle.elapsed ? '<u class="positive bone" title="뼈 갑옷">▣</u>' : ""
  ].filter(Boolean);
  const weaponGlyph = ({ greatsword: "⚔", warhammer: "◆", ironTeeth: "⌁", ironClaws: "Ψ" })[entity.weaponOverlay] || "";
  if (entity.controlled) {
    return `
      <div class="third-person-player ${playerArt ? `unit-art-player ${playerArt}` : "unit-art-fallback"} ${entity.lastHit ? "hit" : ""}" style="--entity-color:${entity.color};--entity-hp:${hpRatio * 100}%" aria-label="${escapeHtml(entity.name)} 체력 ${Math.ceil(entity.hp)}/${entity.maxHp}">
        <i class="player-shadow"></i>${playerArt
          ? `<i class="player-class-art ${playerArt}" aria-hidden="true"></i>`
          : '<i class="player-legs"></i><i class="player-torso"></i><i class="player-shoulders"></i><i class="player-head"></i><i class="player-weapon">†</i>'}
        ${statuses.length || positive.length ? `<small class="battle-status-row">${[...positive, ...statuses].join("")}</small>` : ""}
      </div>
    `;
  }
  return `
    <button class="battle-entity third-person-entity team-${entity.team} ${monsterArt ? "unit-art-monster" : companionArt ? "unit-art-companion" : "unit-art-portrait"} ${speciesClass} ${companionRegion ? `ally-region-${companionRegion}` : ""} ${entity.hp <= 0 ? "down" : ""} ${entity.lastHit ? "hit" : ""} ${targeted ? "focused" : ""} ${projection.visible ? "" : "off-camera"}"
      style="--entity-x:${projection.x}%;--entity-y:${projection.y}%;--entity-z:${projection.z};--entity-scale:${projection.scale.toFixed(2)};--entity-color:${entity.color};--entity-hp:${hpRatio * 100}%"
      data-action="${entity.team === "enemy" && entity.hp > 0 ? "battle-player-target" : "inspect-battle-unit"}"
      data-target-id="${entity.id}"
      ${entity.hp <= 0 ? "disabled" : ""}
      aria-label="${escapeHtml(entity.name)} 체력 ${Math.ceil(entity.hp)}/${entity.maxHp}"
    ><i class="${monsterArt || companionArt || portrait}">${entity.team === "enemy" || entity.summonType ? entity.glyph : ""}${weaponGlyph ? `<u class="summon-weapon weapon-${entity.weaponOverlay}">${weaponGlyph}</u>` : ""}</i><span>${entity.name}</span><em><b></b></em>${statuses.length || positive.length ? `<small class="battle-status-row">${[...positive, ...statuses].join("")}</small>` : ""}</button>
  `;
}

function commandCooldown(battle, command) {
  return Math.max(0, Math.ceil(((battle.commandReadyAt[command] || 0) - battle.elapsed) / 1000));
}

function playerActionCooldown(battle, action) {
  return Math.max(0, Math.ceil(((battle.playerReadyAt?.[action] || 0) - battle.elapsed) / 1000));
}

function battleScreen(state, defenseMode = false) {
  const run = state.adventure?.run;
  const battle = defenseMode ? state.estateDefense.battle : run.battle;
  ensureBattleCamera(battle);
  const regionId = defenseMode ? state.estateDefense.pending?.regionId : run.regionId;
  const region = WORLD_REGION_DEFS[regionId] || WORLD_REGION_DEFS.central;
  const unitHp = battle.units.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0);
  const unitMax = battle.units.reduce((sum, unit) => sum + unit.maxHp, 0);
  const enemyHp = battle.enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.hp), 0);
  const enemyMax = battle.enemies.reduce((sum, enemy) => sum + enemy.maxHp, 0);
  const elapsed = (battle.elapsed / 1000).toFixed(1);
  const attackCd = playerActionCooldown(battle, "attack");
  const dodgeCd = playerActionCooldown(battle, "dodge");
  const battleKit = playerKitDefinition(battle.playerKitId);
  const battleBaseClass = playerBaseClassDefinition(battle.playerBaseClassId || battleKit.baseClassId);
  const battleBasePassive = battle.playerBasePassive || battleBaseClass.passive;
  const battlePassive = battle.playerPassive || battleKit.passive;
  const battlePlayer = battle.units.find((unit) => unit.id === battle.playerId);
  const soulStacks = battle.basePassiveState?.soulStacks || 0;
  const soulSeconds = Math.max(0, Math.ceil(((battle.basePassiveState?.soulExpiresAt || 0) - battle.elapsed) / 1000));
  const basePassiveProgress = battleBasePassive.effect === "soulHarvest"
    ? ` · 영혼 ${soulStacks}/${battleBasePassive.maxStacks}${soulStacks ? ` · ${soulSeconds}초` : ""}`
    : battleBasePassive.effect === "hitCycleHeal"
      ? ` · 피격 ${battle.basePassiveState?.hitCount || 0}/${battleBasePassive.hitsRequired}`
      : "";
  const companionCount = Math.max(0, battle.units.filter((unit) => !unit.controlled && !unit.summonType).length);
  const summonCount = battle.units.filter((unit) => unit.summonType && unit.hp > 0).length;
  const adventureUnitLabel = `나 + 자동 동료 ${companionCount}${summonCount ? ` + 소환 ${summonCount}` : ""}`;
  const battleSkills = ["skill1", "skill2", "skill3"].map((action, index) => ({
    action,
    cooldown: playerActionCooldown(battle, action),
    definition: playerSkillDefinition(battleKit.id, battle.playerSkillIds?.[index])
  }));
  const defenseCampaign = defenseMode ? state.estateDefense.campaign : null;
  const defenseGate = defenseCampaign?.phase === "gates" ? ESTATE_GATE_DEFS[defenseCampaign.activeGateId] : null;
  const defenseTitle = defenseCampaign?.phase === "inner" ? "영지 내부전장" : defenseGate ? `${defenseGate.name} 지원전` : state.estateDefense?.pending?.title;
  const defenseDetail = defenseCampaign?.phase === "inner"
    ? `${ESTATE_GATE_DEFS[defenseCampaign.breachedGateId]?.name || "성문"} 돌파 · 내부 주력 저지`
    : `${defenseGate?.name || "성문"} 내구 ${Math.ceil(defenseCampaign?.gates?.[defenseCampaign.activeGateId]?.durability || 0)} · 고정 수비 ${defenseCampaign?.gates?.[defenseCampaign.activeGateId]?.garrisonIds.length || 0}명`;
  const defenseUnitLabel = defenseCampaign?.phase === "inner"
    ? `개척자 + 자동 동료 ${battle.units.length - 1}`
    : `개척자 기동대 + 고정 수비 ${Math.max(0, battle.units.length - 1 - (state.adventure?.party?.length || 0))}`;
  const defenseControlNote = defenseCampaign?.phase === "inner"
    ? "개척자는 직접 조작하고 동료 2명은 자동으로 싸운다. 성문 돌파 뒤에는 고정 수비대가 각 문과 주민 대피로를 지킨다."
    : "기동 동료 2명은 함께 이동하며, 현재 성문의 고정 수비대가 추가로 자동 전투한다.";
  const waitingForResult = !defenseMode && battle.status !== "active" && Boolean(run?.result)
    && Number(battle.resultRevealAt || 0) > Date.now();
  return `
    <main class="screen battle-screen" style="--region-color:${region.accent}">
      <header class="battle-heading"><div><p class="eyebrow">${defenseMode ? "다중 성문 수성전" : "직접 조작 + 동료 자동전투"} · ${elapsed}초</p><h1>${battle.boss ? "☠" : "⚔"} ${defenseMode ? defenseTitle : battle.encounterName}</h1><small>${defenseMode ? `${defenseDetail} · 방어 시설 ${state.estateDefense.fortification}/5` : `${region.hazard.glyph} ${region.hazard.name} 대응 ${run.hazardMitigation}`} · 고정 아이소메트릭 액션 전장</small></div>${defenseMode && defenseCampaign?.phase === "gates" ? '<button class="defense-map-toggle" data-action="open-defense-map">네 성문 전황</button>' : '<span class="live-indicator">● LIVE</span>'}</header>
      <section class="battle-score"><div><span>${defenseMode ? defenseUnitLabel : adventureUnitLabel}</span><b>${Math.ceil(unitHp)}/${unitMax}</b><i style="--score:${(unitHp / unitMax) * 100}%"></i></div><em>VS</em><div><span>${defenseMode && defenseCampaign?.phase === "inner" ? "성내 침입군" : "몬스터 무리"}</span><b>${Math.ceil(enemyHp)}/${enemyMax}</b><i style="--score:${(enemyHp / enemyMax) * 100}%"></i></div></section>
      <section class="battle-arena third-person-arena region-${region.id}" aria-label="고정된 아이소메트릭 시점의 실시간 전투장">
        <div class="battle-horizon"></div>
        <div class="battle-ground-plane"></div>
        <div class="battle-scenery prop-one"></div><div class="battle-scenery prop-two"></div><div class="battle-scenery prop-three"></div>
        <div class="battle-reticle"><i></i></div>
        ${battlePartyRail(battle)}
        ${battleRadar(battle)}
        ${[...battle.units, ...battle.enemies].map((entity) => battleEntity(entity, battle)).join("")}
        ${joystickControl("combat")}
        ${waitingForResult ? '<div class="battle-result-pause"><span>⚔</span><strong>전투 종료</strong><small>전장을 정리하고 있습니다…</small></div>' : ""}
      </section>
      <section class="battle-orders" aria-label="플레이어 직접 전투 행동">
        <button class="action-attack" data-action="player-battle-action" data-player-action="attack" ${attackCd ? "disabled" : ""}><span>⚔</span><strong>공격</strong><small>${attackCd ? `${attackCd}초` : "자동 조준"}</small></button>
        <button class="action-dodge" data-action="player-battle-action" data-player-action="dodge" ${dodgeCd ? "disabled" : ""}><span>↝</span><strong>회피</strong><small>${dodgeCd ? `${dodgeCd}초` : "피해 감소"}</small></button>
        ${battleSkills.map(({ action, cooldown, definition }, index) => definition ? `<button class="kit-skill-action action-skill action-skill-${index + 1}" data-action="player-battle-action" data-player-action="${action}" ${cooldown ? "disabled" : ""} title="${escapeHtml(definition.description)}"><span>${definition.glyph}</span><strong>${escapeHtml(definition.name)}</strong><small>${cooldown ? `${cooldown}초` : "기술"}</small></button>` : "").join("")}
      </section>
      <div class="battle-log">${battle.log.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>
      <section class="battle-hero-note active-control"><span class="${portraitClass(0)}"></span><div><strong>${escapeHtml(battleKit.shortName)} · ${Math.ceil(battlePlayer?.hp || 0)}/${battlePlayer?.maxHp || 0}</strong><em class="player-hp-bar"><b style="width:${Math.max(0, (battlePlayer?.hp || 0) / Math.max(1, battlePlayer?.maxHp || 1) * 100)}%"></b></em><small>${battleBasePassive.glyph} ${escapeHtml(battleBasePassive.name)}${basePassiveProgress} · ${battlePassive.glyph} ${escapeHtml(battlePassive.name)}</small></div></section>
    </main>
  `;
}

function defenseModal(state) {
  const defense = state.estateDefense;
  if (!defense?.battle || defense.battle.status === "active" || !defense.result || view.hubOpen) return "";
  const victory = ["gateHeld", "innerVictory"].includes(defense.result.type);
  const nextLabel = ({ gateHeld: "네 성문 전황으로", gateBreach: "내부전장으로", innerVictory: "잔당 소탕 준비", innerDefeat: "영지 피해 정산" })[defense.result.type] || "다음 단계";
  const nextDescription = ({
    gateHeld: "다른 세 문은 전투 중에도 계속 공격받는다.",
    gateBreach: "기동대와 생존 수비대가 성 안으로 후퇴한다.",
    innerVictory: "전투가 끝나도 숨어든 잔당을 별도 부대로 정리해야 한다.",
    innerDefeat: "주민 대피를 마치고 파손된 생산 시설과 물자 피해를 정산한다."
  })[defense.result.type] || "다음 방어 단계로 이동한다.";
  return `
    <div class="modal-wrap"><section class="modal ${victory ? "victory-modal" : ""}">
      <p class="eyebrow">${defense.result.type === "gateHeld" ? "성문 한 곳 방어" : defense.result.type === "gateBreach" ? "성문 내구도 소진" : defense.result.type === "innerVictory" ? "내부 주력 격퇴" : "내부 방어선 결과"}</p>
      <h2>${victory ? "⚑" : "△"} ${defense.result.title}</h2>
      <p>${defense.result.description}</p>
      <div class="reward-line">${nextDescription}</div>
      <div class="modal-actions single"><button class="primary" data-action="resolve-defense-stage">${nextLabel}</button></div>
    </section></div>
  `;
}

function zoneMapOverlay(state) {
  if (!view.zoneMapOpen || !state.adventure?.run) return "";
  const run = state.adventure.run;
  const zone = currentZone(run);
  const seen = new Set(zone.seen || []);
  const cells = [];
  for (let y = 0; y < zone.height; y += 1) {
    for (let x = 0; x < zone.width; x += 1) {
      const cellKey = keyOf(x, y);
      const known = seen.has(cellKey);
      const tile = zone.tiles[y][x];
      const feature = known ? zone.features[cellKey] : null;
      const playerHere = run.player.x === x && run.player.y === y;
      const marker = playerHere ? "◆" : zoneFeatureGlyph(feature);
      const classes = ["zone-map-cell", known ? tile : "unknown", feature ? `map-${feature.type}` : "", feature?.cleared ? "cleared" : "", playerHere ? "map-party" : ""].filter(Boolean).join(" ");
      cells.push(`<button class="${classes}" data-action="zone-map-tile" data-x="${x}" data-y="${y}" ${known && tile === "floor" && !playerHere ? "" : "disabled"}>${marker}</button>`);
    }
  }
  const region = WORLD_REGION_DEFS[run.regionId];
  return `
    <div class="overlay zone-map-overlay"><section class="zone-map-sheet">
      <header class="sheet-header"><div><p class="eyebrow">${zone.kind === "field" ? "41×41 지역 필드" : "15×15 밀집 던전"}</p><h2>${region.glyph} ${zone.kind === "field" ? region.name : zone.name}</h2></div><button class="primary" data-action="close-zone-map">뒤로</button></header>
      <p class="map-help">밝혀진 지점을 누르면 지도를 닫고 원정대가 그곳까지 이동한다.</p>
      <div class="zone-full-map ${zone.kind}" style="--zone-width:${zone.width}">${cells.join("")}</div>
      <div class="map-legend"><span><i class="legend-player">◆</i> 원정대</span><span><i class="legend-enemy">!</i> 몬스터 조우</span><span><i class="legend-settlement">▤</i> 부락지</span><span><i class="legend-core">${region.dungeonGlyph}</i> 던전/우두머리</span><span><i class="legend-beacon">✓</i> 정리 완료</span></div>
    </section></div>
  `;
}

function adventureModal(state) {
  if (view.hubOpen || view.worldOpen || view.frontierOpen) return "";
  const run = state.adventure?.run;
  if (!run) return "";
  const region = WORLD_REGION_DEFS[run.regionId];
  if (run.battle?.status === "active" && run.battle.awaitingPlayerStart) {
    const ambush = String(run.battle.sourceFeatureId || "").startsWith("roaming-ambush");
    return `
      <div class="modal-wrap battle-start-wrap"><section class="modal battle-start-modal">
        <p class="eyebrow">${ambush ? "불규칙 습격 발생" : "몬스터 조우"} · 확인 전 일시 정지</p>
        <h2>${ambush ? "!" : "⚔"} ${escapeHtml(run.battle.encounterName)}</h2>
        <p>${ambush ? "이동 중 습격을 받았다." : "앞길에서 적 무리를 발견했다."} 확인을 누르기 전에는 전투 시간이 흐르지 않는다.</p>
        <div class="reward-line">개척자 직접 조작 · 동료 ${run.party.length}명 자동 전투 · 이동과 공격 속도 완화</div>
        <div class="modal-actions single"><button class="primary" data-action="confirm-battle-start">확인 · 전투 시작</button></div>
      </section></div>
    `;
  }
  if (run.result) {
    if (Number(run.battle?.resultRevealAt || 0) > Date.now()) return "";
    const completed = run.result.type === "completed";
    const defeated = run.result.type === "defeated";
    return `
      <div class="modal-wrap"><section class="modal ${completed ? "victory-modal" : ""}">
        <p class="eyebrow">${completed ? "지역 던전 정복" : defeated ? "원정 실패" : "실시간 교전 종료"}</p>
        <h2>${completed ? region.dungeonGlyph : defeated ? "✕" : "⚔"} ${escapeHtml(run.result.title)}</h2>
        <p>${escapeHtml(run.result.description)}</p>
        <div class="reward-line">승리 조우 <b>${run.encountersWon}</b> · 원정 고철 <b>${run.cargo.scrap}</b>${completed ? " · 지역 핵 <b>1</b>" : ""}</div>
        <div class="modal-actions single"><button class="primary" data-action="${run.result.type === "battleVictory" ? "continue-after-battle" : "return-adventure-estate"}">${run.result.type === "battleVictory" ? "필드 탐사 계속" : "영지로 귀환·정산"}</button></div>
      </section></div>
    `;
  }
  if (run.pendingEntrance) return `
    <div class="modal-wrap"><section class="modal"><p class="eyebrow">필드 좌표에서 발견</p><h2>${region.dungeonGlyph} ${region.dungeonName}</h2><p>넓은 필드 아래로 좁은 전투 공간이 이어진다. 던전은 15×15이며 몬스터 밀도가 더 높다.</p><div class="modal-actions"><button class="secondary" data-action="cancel-adventure-prompt">필드에 남기</button><button class="primary" data-action="enter-dungeon">던전 진입</button></div></section></div>
  `;
  if (run.pendingSettlement) return `
    <div class="modal-wrap"><section class="modal"><p class="eyebrow">필드 좌표에서 발견</p><h2>▤ ${escapeHtml(run.pendingSettlement.name)}</h2><p>점령지와 분리된 주민 생활권 후보지다. 직접 들어가 길·우물·주거 상태를 확인해야 지도에 등록된다.</p><div class="modal-actions"><button class="secondary" data-action="cancel-adventure-prompt">지나가기</button><button class="primary" data-action="enter-settlement">부락지 들어가기</button></div></section></div>
  `;
  if (run.settlementVisit) return `
    <div class="modal-wrap"><section class="modal settlement-modal"><p class="eyebrow">부락 내부 · 안전 구간</p><h2>▤ ${escapeHtml(run.settlementVisit.name)}</h2><p>주민 거주지와 작업지는 분리된다. 이 부락은 향후 지역 작업자와 생활 인구를 공급하지만 광산이나 던전 자체가 되지는 않는다.</p><div class="reward-line">생활권 후보지 기록 완료${run.settlementVisit.firstVisit ? " · 고철 <b>1</b> 확보" : ""}</div><div class="modal-actions single"><button class="primary" data-action="leave-settlement">필드로 나가기</button></div></section></div>
  `;
  if (run.pendingExit) {
    const dungeonExit = run.location === "dungeon";
    return `<div class="modal-wrap"><section class="modal"><p class="eyebrow">${dungeonExit ? "던전 출구" : "영지 귀환로"}</p><h2>${dungeonExit ? "필드로 나갈까?" : "원정을 마칠까?"}</h2><p>${dungeonExit ? "던전 진행은 유지되며 같은 입구 앞으로 돌아간다." : "지금까지 확보한 전리품을 정산하고 영지로 돌아간다."}</p><div class="modal-actions"><button class="secondary" data-action="cancel-adventure-prompt">계속 탐사</button><button class="primary" data-action="${dungeonExit ? "leave-dungeon" : "return-adventure-estate"}">${dungeonExit ? "필드 복귀" : "영지 귀환"}</button></div></section></div>`;
  }
  if (view.retreatConfirm) return `<div class="modal-wrap"><section class="modal"><p class="eyebrow">원정 종료 확인</p><h2>지금 영지로 돌아갈까?</h2><p>필드와 던전 진행은 종료되며 고철 ${run.cargo.scrap}과 확보한 재료를 정산한다.</p><div class="modal-actions"><button class="secondary" data-action="cancel-adventure-retreat">계속 탐사</button><button class="danger" data-action="return-adventure-estate">원정 종료</button></div></section></div>`;
  return "";
}

function quickUseButton(state) {
  const herb = state.inventory.find((item) => item.x >= 0 && item.defId === "herbKit" && item.charges > 0);
  if (!herb) return '<button class="ghost" disabled>회복 없음</button>';
  return `<button class="secondary" data-action="use-item" data-uid="${herb.uid}">약초 ${herb.charges}</button>`;
}

function renderDungeon(state) {
  const { floor } = state.expedition;
  const seen = new Set(floor.seen);
  const cells = [];
  const half = Math.floor(VIEW_SIZE / 2);
  const originX = Math.max(0, Math.min(floor.tiles[0].length - VIEW_SIZE, state.player.x - half));
  const originY = Math.max(0, Math.min(floor.tiles.length - VIEW_SIZE, state.player.y - half));
  const autoPath = new Set(view.autoPath);
  const movingTarget = travelTarget();
  const autoTarget = movingTarget ? keyOf(movingTarget.x, movingTarget.y) : "";
  for (let screenY = 0; screenY < VIEW_SIZE; screenY += 1) {
    for (let screenX = 0; screenX < VIEW_SIZE; screenX += 1) {
      const x = originX + screenX;
      const y = originY + screenY;
      const tile = floor.tiles[y][x];
      const key = keyOf(x, y);
      const known = seen.has(key);
      const visible = known && engine.isTileVisible(x, y);
      const tappable = known && tile === "floor";
      const classes = ["tile", tile, `area-${state.expedition.areaId}`, known ? "seen" : "unseen", visible ? "visible" : "", tappable ? "tappable" : "", autoPath.has(key) ? "travel-path" : "", autoTarget === key ? "travel-target" : ""].filter(Boolean).join(" ");
      cells.push(`
        <button class="${classes}" data-action="tile" data-x="${x}" data-y="${y}" role="gridcell" aria-label="${tileLabel(state, x, y, known, visible)}">
          ${known ? renderFeature(state, x, y, visible) : ""}
          ${visible ? renderEntity(state, x, y) : ""}
        </button>
      `);
    }
  }
  return cells.join("");
}

function tileLabel(state, x, y, known, visible) {
  if (!known) return "알 수 없는 구역";
  if (state.player.x === x && state.player.y === y) return "플레이어 위치";
  const enemy = visible ? engine.enemyAt(x, y) : null;
  if (enemy) return `${ENEMY_DEFS[enemy.defId].name}, 체력 ${enemy.hp}`;
  const feature = state.expedition.floor.features[keyOf(x, y)];
  if (feature?.type === "cache" && !feature.opened) return "보급함";
  if (feature?.type === "camp") return "야영지";
  if (feature?.type === "hazard") return `${currentArea(state).pressure?.name || "환경"} 위험 지형`;
  if (feature?.type === "beacon") return feature.activated ? "재가동된 측량탑" : "꺼진 측량탑";
  if (feature?.type === "core") return state.expedition.beaconsActivated >= state.expedition.beaconGoal ? "노출된 보스 거점" : "장막에 싸인 보스 거점";
  if (feature?.type === "estateNode") return `${feature.name}${feature.collected ? " 순찰 완료" : ""}`;
  if (feature?.type === "estateHall") return feature.name;
  return state.expedition.floor.tiles[y][x] === "wall" ? "지형 장애물" : `${currentArea(state).name} 길`;
}

function renderEntity(state, x, y) {
  if (state.player.x === x && state.player.y === y) {
    return '<span class="entity player" aria-hidden="true">◆</span>';
  }
  const enemy = engine.enemyAt(x, y);
  if (!enemy) return "";
  const definition = ENEMY_DEFS[enemy.defId];
  const hp = Math.max(0, Math.round((enemy.hp / enemy.maxHp) * 100));
  const intent = enemy.intent === "strike" ? '<i class="intent" title="다음 턴 공격">!</i>' : "";
  return `
    <span class="entity enemy ${definition.boss ? "boss" : ""}" aria-hidden="true">
      ${definition.glyph}${intent}
      <span class="enemy-hp"><i style="width:${hp}%"></i></span>
    </span>
  `;
}

function renderFeature(state, x, y, visible) {
  const feature = state.expedition.floor.features[keyOf(x, y)];
  if (!feature) return "";
  if (feature.type === "cache" && !feature.opened) return '<span class="feature cache" aria-hidden="true">▤</span>';
  if (feature.type === "hazard" && visible) return '<span class="feature hazard" aria-hidden="true">⁙</span>';
  if (feature.type === "camp") return `<span class="feature camp" aria-hidden="true">${feature.used ? "·" : "⌂"}</span>`;
  if (feature.type === "beacon") return `<span class="feature beacon ${feature.activated ? "active" : ""}" aria-hidden="true">⌖</span>`;
  if (feature.type === "core") return `<span class="feature core ${state.expedition.beaconsActivated >= state.expedition.beaconGoal ? "open" : ""}" aria-hidden="true">◈</span>`;
  if (feature.type === "estateNode") return `<span class="feature estate-node ${feature.collected ? "active" : ""}" aria-hidden="true">${feature.glyph}</span>`;
  if (feature.type === "estateHall") return '<span class="feature estate-hall" aria-hidden="true">♜</span>';
  return "";
}

function renderTriggerStrip(state) {
  const placed = state.inventory.filter((item) => item.x >= 0);
  if (!placed.length) return '<span class="status-chip">활성 아이템 없음</span>';
  return placed.map((item) => {
    const definition = ITEM_DEFS[item.defId];
    const triggered = state.lastTriggered.includes(item.uid);
    return `<span class="trigger-chip ${triggered ? "triggered" : ""}" style="--item-color:${definition.color}" title="${escapeHtml(definition.name)}">${definition.glyph}</span>`;
  }).join("");
}

function bagOverlay(state) {
  if (!view.bagOpen) return "";
  const selected = state.inventory.find((item) => item.uid === view.selectedUid) || null;
  const selectedLinks = new Set(selected ? [selected.uid, ...engine.getLinkedUids(selected.uid)] : []);
  const cellToItem = new Map();
  for (const item of state.inventory) {
    for (const cell of itemCells(item)) cellToItem.set(keyOf(cell.x, cell.y), item);
  }
  const cells = [];
  for (let y = 0; y < state.meta.bagRows; y += 1) {
    for (let x = 0; x < BAG_COLS; x += 1) {
      const item = cellToItem.get(keyOf(x, y));
      if (!item) {
        cells.push(`<button class="bag-cell" data-action="bag-cell" data-x="${x}" data-y="${y}" aria-label="빈 가방 칸 ${x + 1}, ${y + 1}"></button>`);
        continue;
      }
      const definition = ITEM_DEFS[item.defId];
      const ownCells = new Set(itemCells(item).map((cell) => keyOf(cell.x, cell.y)));
      const same = {
        up: ownCells.has(keyOf(x, y - 1)),
        down: ownCells.has(keyOf(x, y + 1)),
        left: ownCells.has(keyOf(x - 1, y)),
        right: ownCells.has(keyOf(x + 1, y))
      };
      const firstCell = itemCells(item)[0];
      const isAnchor = firstCell.x === x && firstCell.y === y;
      const classes = [
        "bag-cell", "occupied",
        item.uid === view.selectedUid ? "selected" : "",
        selectedLinks.has(item.uid) && selectedLinks.size > 1 ? "linked" : "",
        state.lastTriggered.includes(item.uid) ? "triggered" : "",
        same.up ? "same-up" : "",
        same.down ? "same-down" : "",
        same.left ? "same-left" : "",
        same.right ? "same-right" : ""
      ].filter(Boolean).join(" ");
      cells.push(`
        <button class="${classes}" style="--item-color:${definition.color}" data-action="select-item" data-uid="${item.uid}" aria-label="${escapeHtml(definition.name)}">
          ${isAnchor ? `<span class="bag-glyph">${definition.glyph}</span>` : ""}
          ${isAnchor ? itemStatusBadge(item) : ""}
        </button>
      `);
    }
  }
  const unplaced = state.inventory.filter((item) => item.x < 0);
  return `
    <div class="overlay" role="dialog" aria-modal="true" aria-label="가방 편집">
      <section class="sheet">
        <header class="sheet-header">
          <div><p class="eyebrow">${BAG_COLS}×${state.meta.bagRows} 전투 엔진</p><h2>원정 가방</h2></div>
          <button class="primary" data-action="close-bag">뒤로</button>
        </header>
        <div class="bag-help">아이템을 선택한 뒤 빈 칸을 눌러 옮긴다. 맞닿은 아이템은 금색으로 표시된다.${state.expedition?.phase === "active" && !view.hubOpen ? " 전투 중 배치를 바꾸면 닫을 때 한 턴이 흐른다." : " 공방에서는 자유롭게 배치할 수 있다."}</div>
        <div class="bag-board" aria-label="가방 격자">${cells.join("")}</div>
        <div class="bag-toolbar">
          <button class="ghost" data-action="deselect-item" ${selected ? "" : "disabled"}>선택 해제</button>
          <button class="secondary" data-action="rotate-item" ${selected ? "" : "disabled"}>회전 ↻</button>
          <button class="danger" data-action="store-item" ${selected?.x >= 0 ? "" : "disabled"}>보관</button>
        </div>
        ${selectedItemPanel(state, selected)}
        <div class="section-heading"><h2>보관함</h2><span>${unplaced.length}개</span></div>
        <div class="inventory-tray">
          ${unplaced.length ? unplaced.map((item) => trayItem(item)).join("") : '<div class="empty-state">보관 중인 아이템이 없다.</div>'}
        </div>
      </section>
    </div>
  `;
}

function itemStatusBadge(item) {
  if (item.defId === "herbKit") return `<span class="bag-charge">${item.charges}</span>`;
  if (item.defId === "coil") return `<span class="bag-charge">${item.counters.charge || 0}</span>`;
  return "";
}

function trayItem(item) {
  const definition = ITEM_DEFS[item.defId];
  const selected = item.uid === view.selectedUid;
  return `
    <button class="tray-item ${selected ? "selected" : ""}" style="--item-color:${definition.color}" data-action="select-item" data-uid="${item.uid}">
      <span class="glyph">${definition.glyph}</span>
      <span><strong>${escapeHtml(definition.name)}</strong><small>장비 · 품질 ${item.quality || 50} · ${definition.mask[0].length}×${definition.mask.length} · ${definition.tags.map((tag) => TAG_LABELS[tag]).join(" · ")}</small></span>
    </button>
  `;
}

function selectedItemPanel(state, selected) {
  if (!selected) return '<div class="selected-item"><p>아이템을 선택하면 기본 효과와 연결 효과를 확인할 수 있다.</p></div>';
  const definition = ITEM_DEFS[selected.defId];
  const links = engine.getLinkedUids(selected.uid).map((uid) => ITEM_DEFS[state.inventory.find((item) => item.uid === uid).defId].name);
  const affixes = (selected.affixes || []).map((id) => AFFIX_DEFS[id]).filter(Boolean);
  const canUse = !view.hubOpen && selected.defId === "herbKit" && selected.x >= 0 && selected.charges > 0 && state.expedition?.phase === "active";
  return `
    <article class="selected-item">
      <div class="card-row">
        <div>
          <h3>${definition.glyph} ${escapeHtml(definition.name)}</h3>
          <p><b>제작 품질:</b> ${selected.quality || 50}</p>
          <p><b>기본:</b> ${escapeHtml(definition.baseText)}</p>
          <p><b>연결:</b> ${escapeHtml(definition.linkText)}</p>
        </div>
        ${canUse ? `<button class="primary research-action" data-action="use-item" data-uid="${selected.uid}">사용 ${selected.charges}</button>` : ""}
      </div>
      <div class="tag-list">
        <span class="tag category-tag">장비</span>
        ${definition.tags.map((tag) => `<span class="tag">${TAG_LABELS[tag]}</span>`).join("")}
        ${affixes.map((affix) => `<span class="tag affix-tag">${escapeHtml(affix.name)} · ${escapeHtml(affix.description)}</span>`).join("")}
        ${links.map((name) => `<span class="tag linked-tag">연결: ${escapeHtml(name)}</span>`).join("")}
      </div>
    </article>
  `;
}

function classOverlay(state) {
  if (!view.classOpen) return "";
  const commander = state.adventure?.commander || {};
  const selectedKit = playerKitDefinition(commander.combatKitId);
  const selectedBaseClass = playerBaseClassDefinition(selectedKit.baseClassId);
  const loadout = normalizedPlayerLoadout(commander, selectedKit.id, false);
  const combatStats = playerCombatStats(commander, selectedKit.id);
  return `
    <div class="overlay" role="dialog" aria-modal="true" aria-label="직업과 출신 특성 선택">
      <section class="sheet class-sheet">
        <header class="sheet-header">
          <div><p class="eyebrow">주 직업 전체 스킬 변형</p><h2>개척자 전승 설정</h2></div>
          <button class="primary" data-action="close-class">뒤로</button>
        </header>
        <p class="bag-help">기본 직업의 고유 패시브는 어떤 전승에서도 유지된다. 동료에게 익힌 계통은 전승 패시브 하나를 더하고 주 직업의 스킬 다섯 개를 전부 바꾼다.</p>
        <div class="class-choice-grid class-art-choice-grid">
          ${Object.values(PLAYER_KIT_DEFS).map((kit) => {
            const selected = kit.id === selectedKit.id;
            const baseClass = playerBaseClassDefinition(kit.baseClassId);
            const primary = BASIC_DISCIPLINE_DEFS[kit.primaryId];
            const inherited = BASIC_DISCIPLINE_DEFS[kit.inheritedId];
            const conceptArt = PLAYER_KIT_CONCEPT_ART[kit.id];
            return `
              <button class="class-choice class-choice-illustrated ${selected ? "selected" : ""}" style="--class-color:${kit.color}" data-action="select-commander-kit" data-kit-id="${kit.id}">
                <span class="class-choice-art" aria-hidden="true">${conceptArt ? `<img src="${conceptArt}" alt="" draggable="false">` : `<span class="class-glyph">${kit.glyph}</span>`}</span>
                <span class="class-choice-copy">
                  <span class="class-choice-title"><span class="class-glyph">${kit.glyph}</span><span><b>플레이 가능</b><strong>${escapeHtml(kit.shortName)}</strong></span></span>
                  <small>${escapeHtml(kit.description)}</small>
                  <i>${baseClass.glyph} ${baseClass.name} · ${primary.glyph} ${primary.name} + ${inherited.glyph} ${inherited.name}</i>
                  <em class="class-choice-state">${selected ? "현재 선택" : "눌러서 선택"}</em>
                </span>
              </button>
            `;
          }).join("")}
        </div>
        <div class="passive-card-grid">
          <div class="selected-skill-card kit-passive-card base-passive-card" style="--class-color:${selectedKit.color}">
            <b>${selectedBaseClass.passive.glyph} 기본 패시브 · ${escapeHtml(selectedBaseClass.passive.name)}</b>
            <span>${escapeHtml(selectedBaseClass.passive.description)}</span>
          </div>
          <div class="selected-skill-card kit-passive-card" style="--class-color:${selectedKit.color}">
            <b>${selectedKit.passive.glyph} 전승 패시브 · ${escapeHtml(selectedKit.passive.name)}</b>
            <span>${escapeHtml(selectedKit.passive.description)}</span>
          </div>
        </div>
        <div class="class-stat-grid">
          <span><small>힘</small><b>${Math.round(combatStats.strength)}</b></span>
          <span><small>민첩</small><b>${Math.round(combatStats.agility)}</b></span>
          <span><small>지능</small><b>${Math.round(combatStats.intelligence)}</b></span>
          <span><small>방어력</small><b>${Math.round(combatStats.defense)}</b></span>
          <span class="affinity holy"><small>신성 친화도</small><b>${Math.round(combatStats.divineAffinity)}</b></span>
          <span class="affinity nature"><small>자연 친화도</small><b>${Math.round(combatStats.natureAffinity)}</b></span>
          ${combatStats.statusResistance ? `<span><small>상태 저항 · 직업 전용</small><b>${Math.round(combatStats.statusResistance * 100)}%</b></span>` : ""}
          ${combatStats.criticalChance != null ? `<span><small>치명타 · 직업 전용</small><b>${Math.round(combatStats.criticalChance * 100)}%</b></span>` : ""}
        </div>
        <p class="facility-note">회복은 방어력·신성 친화도, 소환은 지능·자연 친화도에 비례한다. 중병기 망자는 방어력도 추가 반영한다. 상태이상 위력은 지능, 재사용 감소는 장비 효과로만 얻는다.</p>
        <div class="section-heading"><h2>변형 스킬 5개</h2><span>전투 버튼에는 3개 장착</span></div>
        <div class="kit-skill-grid">
          ${selectedKit.skills.map((skill) => {
            const slot = loadout.indexOf(skill.id);
            const level = masteryLevel(state.meta.skillMastery[skill.id] || 0);
            return `<button class="kit-skill-choice ${slot >= 0 ? "selected" : ""}" style="--class-color:${selectedKit.color}" data-action="toggle-commander-skill" data-skill-id="${skill.id}"><span>${skill.glyph}</span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.description)}</small><i>${slot >= 0 ? `장착 ${slot + 1}` : "대기"} · 숙련 ${level}</i></button>`;
          }).join("")}
        </div>
        <p class="facility-note">선택된 기술을 눌러 해제한 뒤 다른 기술을 장착할 수 있다. 출정 시 빈 슬롯은 기본 기술로 자동 보충된다.</p>
        <div class="section-heading"><h2>출신 특성</h2><span>직업과 자유롭게 조합</span></div>
        <div class="trait-choice-grid">
          ${Object.values(TRAIT_DEFS).map((trait) => `
            <button class="trait-choice ${trait.id === state.meta.traitId ? "selected" : ""}" data-action="select-trait" data-trait-id="${trait.id}">
              <strong>${escapeHtml(trait.name)}</strong><small>${escapeHtml(trait.description)}</small>
            </button>
          `).join("")}
        </div>
        <section class="inheritance-concept-codex" aria-labelledby="inheritance-concept-title">
          <div class="section-heading"><h2 id="inheritance-concept-title">전승 도감 · 준비 중</h2><span>컨셉 미리보기 · 현재 선택 불가</span></div>
          <div class="inheritance-concept-grid">
            <article class="inheritance-concept-card barbarian-concept" aria-disabled="true">
              <div class="inheritance-concept-art single-art"><img src="./assets/character-barbarian-webtoon-v1.png" alt="거대한 특대검을 든 바바리안 컨셉 원화" loading="lazy" draggable="false"></div>
              <div class="inheritance-concept-copy"><p class="eyebrow">준비 중 · 특대검 전승</p><h3>바바리안</h3><p>육중한 특대검으로 전열을 깨고, 받은 피해를 공격 기회로 바꾸는 근접 전투형.</p><span>선택 불가 · 컨셉 원화</span></div>
            </article>
            <article class="inheritance-concept-card shapeshifter-concept" aria-disabled="true">
              <div class="inheritance-concept-art dual-form-art" aria-label="변신술사의 인간형과 늑대형 크기 비교">
                <figure class="shapeshifter-form human-form"><img src="./assets/character-shapeshifter-human-webtoon-v1.png" alt="변신술사 인간형 컨셉 원화" loading="lazy" draggable="false"><figcaption><b>전투형 170cm</b><span>기술·공격 시 이족 전투</span></figcaption></figure>
                <figure class="shapeshifter-form wolf-form"><img src="./assets/character-shapeshifter-wolf-webtoon-v2.png" alt="변신술사 늑대형 컨셉 원화" loading="lazy" draggable="false"><figcaption><b>야수형 250cm</b><span>이동/회피 시 사족 질주</span></figcaption></figure>
              </div>
              <div class="inheritance-concept-copy"><p class="eyebrow">준비 중 · 정령 변신 전승</p><h3>변신술사</h3><p>전투할 때는 인간형을 유지하고, 이동하거나 회피할 때 거대한 늑대형으로 전환한다.</p><span>선택 불가 · 두 형태 비교</span></div>
            </article>
            <article class="inheritance-concept-card archmage-concept" aria-disabled="true">
              <div class="inheritance-concept-art single-art archmage-art"><img src="./assets/character-archmage-webtoon-v2.png" alt="아이보리와 짙은 남색 의상에 거대한 모자와 지팡이를 든 여성 대마법사 컨셉 원화" loading="lazy" draggable="false"></div>
              <div class="inheritance-concept-copy"><p class="eyebrow">준비 중 · 순수 마법 전승</p><h3>대마법사</h3><p>160cm의 작은 체구와 대비되는 거대한 모자와 지팡이를 든 원거리 마법 전투형. 아이보리와 짙은 남색을 바탕으로 마법광만 청록색으로 빛난다.</p><span>선택 불가 · 컨셉 원화</span></div>
            </article>
          </div>
        </section>
      </section>
    </div>
  `;
}

function phaseModal(state) {
  const phase = state.expedition?.phase;
  if (!phase || phase === "active") return "";
  if (phase === "victory") {
    const cargo = cargoSummary(state.expedition);
    const area = AREA_DEFS[state.expedition.areaId];
    return `
      <div class="modal-wrap"><section class="modal victory-modal">
        <p class="eyebrow">${escapeHtml(area.name)} 정복</p>
        <h2>${area.glyph} 지역 목표 완수</h2>
        <p>지역의 장막과 보스를 돌파했다. 가져온 재료는 대장간 제작에, 설계도는 새로운 장비 조합에 쓰인다.</p>
        <div class="reward-line">측량 <b>${state.expedition.beaconsActivated}/${state.expedition.beaconGoal}</b> · 고철 <b>${state.expedition.runScrap}</b> · 지역 핵 <b>1</b></div>
        <div class="cargo-line">원정 짐 · ${cargo || "없음"}</div>
        <div class="modal-actions single"><button class="primary" data-action="return-victory">공방으로 돌아가기</button></div>
      </section></div>
    `;
  }
  const cargo = cargoSummary(state.expedition);
  return `
    <div class="modal-wrap"><section class="modal">
      <p class="eyebrow">원정 실패 · 세계 진행 유지</p>
      <h2>야영지에서 구조됨</h2>
      <p>연구, 가방, 설계도와 개척 기록은 남는다. 미보관 고철과 원정 재료는 절반만 회수한다.</p>
      <div class="reward-line">회수 고철 <b>${Math.floor(state.expedition.runScrap / 2)}</b></div>
      <div class="cargo-line">설계도 전부 · 재료 절반 회수 · ${cargo || "짐 없음"}</div>
      <div class="modal-actions single"><button class="primary" data-action="return-defeated">공방 귀환</button></div>
    </section></div>
  `;
}

function cargoSummary(expedition) {
  const materials = Object.entries(expedition.cargo.materials)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => `${MATERIAL_DEFS[id]?.name || id} ${amount}`);
  const blueprints = expedition.cargo.blueprints.map((id) => `설계도 ${CRAFT_RECIPES.find((recipe) => recipe.id === id)?.name || id}`);
  return [...materials, ...blueprints].join(" · ");
}

function retreatModal(state) {
  if (!view.retreatConfirm || !state.expedition) return "";
  return `
    <div class="modal-wrap"><section class="modal">
      <p class="eyebrow">원정 종료 확인</p>
      <h2>지금 정산할까?</h2>
      <p>현재 원정 지도는 닫히고 새로 시작된다. 가방, 연구, 측량 기록은 남고 미보관 고철 ${state.expedition.runScrap}개와 원정 짐을 모두 공방으로 가져온다.</p>
      <div class="cargo-line">${cargoSummary(state.expedition) || "아직 확보한 원정 짐이 없다."}</div>
      <div class="modal-actions">
        <button class="secondary" data-action="cancel-retreat">뒤로</button>
        <button class="danger" data-action="confirm-retreat">원정 종료</button>
      </div>
    </section></div>
  `;
}

function worldMapOverlay(state) {
  if (!view.mapOpen || !state.expedition) return "";
  const floor = state.expedition.floor;
  const seen = new Set(floor.seen);
  const width = floor.tiles[0].length;
  const cells = [];
  for (let y = 0; y < floor.tiles.length; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cellKey = keyOf(x, y);
      const known = seen.has(cellKey);
      const tile = floor.tiles[y][x];
      const visible = known && engine.isTileVisible(x, y);
      const feature = known ? floor.features[cellKey] : null;
      const enemy = visible ? engine.enemyAt(x, y) : null;
      const playerHere = state.player.x === x && state.player.y === y;
      const marker = playerHere ? "◆"
        : enemy ? "!"
          : feature?.type === "beacon" ? (feature.activated ? "✦" : "⌖")
            : feature?.type === "core" ? "◈"
              : feature?.type === "estateNode" ? feature.glyph
                : feature?.type === "estateHall" ? "♜"
              : feature?.type === "camp" ? "▲"
                : feature?.type === "cache" && !feature.opened ? "▪"
                  : "";
      const markerClass = playerHere ? "map-player"
        : enemy ? "map-enemy"
          : feature ? `map-${feature.type}${feature.activated || feature.collected ? " active" : ""}`
            : "";
      const classes = ["world-map-cell", known ? tile : "unknown", known ? `area-${state.expedition.areaId}` : "", markerClass].filter(Boolean).join(" ");
      const canTravel = known && tile === "floor" && !playerHere;
      cells.push(`<button class="${classes}" data-action="map-tile" data-x="${x}" data-y="${y}" role="gridcell" aria-label="${tileLabel(state, x, y, known, visible)}" ${canTravel ? "" : "disabled"}>${marker}</button>`);
    }
  }
  const explored = Math.round((seen.size / (floor.tiles.length * width)) * 100);
  return `
    <div class="overlay map-overlay" role="dialog" aria-modal="true" aria-label="원정 지도">
      <section class="map-sheet">
        <header class="sheet-header">
          <div><p class="eyebrow">개척도 ${explored}%${state.expedition.beaconGoal ? ` · 측량 ${state.expedition.beaconsActivated}/${state.expedition.beaconGoal}` : ""}</p><h2>${currentArea(state).glyph} ${escapeHtml(currentArea(state).name)} 전도</h2></div>
          <button class="primary" data-action="close-map">뒤로</button>
        </header>
        <p class="map-help">밝혀진 칸을 누르면 지도를 닫고 그곳까지 연속 이동한다.</p>
        <div class="world-map" style="--world-size:${width}" role="grid" aria-label="발견한 세계 지도">${cells.join("")}</div>
        <div class="map-legend" aria-label="지도 범례">
          <span><i class="legend-player">◆</i> 현재 위치</span>
          <span><i class="legend-beacon">✦</i> 측량탑</span>
          <span><i class="legend-enemy">!</i> 시야 내 적</span>
          <span><i class="legend-core">◈</i> 감시자의 심장</span>
        </div>
      </section>
    </div>
  `;
}

function render() {
  const state = engine.state;
  const adventureRun = state.adventure?.run;
  const battleActive = Boolean((state.estateDefense?.battle || adventureRun?.battle) && !view.hubOpen);
  document.body.classList.toggle("battle-active", battleActive);
  document.body.classList.toggle("adventure-active", Boolean(adventureRun && !adventureRun.battle && !view.hubOpen));
  document.body.classList.toggle("map-active", Boolean((view.worldOpen || view.frontierOpen) && !battleActive));
  if (!battleActive) view.battleCameraBattle = null;
  const body = view.frontierOpen ? frontierScreen(state)
    : view.worldOpen ? worldScreen(state)
    : state.estateDefense?.campaign && !view.hubOpen && (view.defenseMapOpen || !state.estateDefense.battle) ? defenseCampaignScreen(state)
    : state.estateDefense?.battle && !view.hubOpen ? battleScreen(state, true)
      : adventureRun && !view.hubOpen ? (adventureRun.battle ? battleScreen(state) : adventureScreen(state))
      : state.expedition && !view.hubOpen ? expeditionScreen(state)
        : hubScreen(state);
  app.innerHTML = `
    <div class="app-shell">
      ${topbar(state)}
      ${body}
      ${facilityOverlay(state)}
      ${defensePlanningOverlay(state)}
      ${rosterOverlay(state)}
      ${bagOverlay(state)}
      ${classOverlay(state)}
      ${worldMapOverlay(state)}
      ${zoneMapOverlay(state)}
      ${phaseModal(state)}
      ${retreatModal(state)}
      ${adventureModal(state)}
      ${defenseModal(state)}
      ${view.toast ? `<div class="toast" role="status">${escapeHtml(view.toast)}</div>` : ""}
    </div>
  `;
  syncCombatTimer();
}

function openBag() {
  view.bagOpen = true;
  view.selectedUid = null;
  view.bagFingerprint = engine.getBagFingerprint();
  render();
}

function closeBag() {
  view.bagOpen = false;
  view.selectedUid = null;
  const before = view.bagFingerprint;
  view.bagFingerprint = "";
  const consumed = !view.hubOpen && engine.consumeRearrangeTurn(before);
  if (!consumed) render();
}

function handleBagCell(x, y) {
  if (!view.selectedUid) {
    showToast("먼저 옮길 아이템을 선택해줘.");
    return;
  }
  const selected = engine.state.inventory.find((item) => item.uid === view.selectedUid);
  if (!selected) return;
  if (!engine.placeInventoryItem(selected.uid, x, y, view.selectedRotation)) {
    showToast("그 위치에는 아이템이 들어가지 않아.");
  }
}

function clearAutoMove(renderNow = false) {
  if (view.autoTimer) clearTimeout(view.autoTimer);
  const changed = Boolean(view.autoMove || view.autoPath.length);
  view.autoTimer = null;
  view.autoMove = null;
  view.autoPath = [];
  if (changed && renderNow) render();
  return changed;
}

function stopAutoMove(message = "") {
  const changed = clearAutoMove(false);
  if (message) showToast(message);
  else if (changed) render();
}

function travelTarget() {
  if (!view.autoMove) return null;
  if (!view.autoMove.enemyId) return { x: view.autoMove.x, y: view.autoMove.y };
  const enemy = engine.state.expedition?.floor.enemies.find((entry) => entry.id === view.autoMove.enemyId && entry.hp > 0);
  return enemy ? { x: enemy.x, y: enemy.y } : null;
}

function calculateTravelPath(target) {
  const { expedition, player } = engine.state;
  if (!expedition || !target) return [];
  const floor = expedition.floor;
  const targetKey = keyOf(target.x, target.y);
  const noticed = new Set(view.autoMove?.noticedEnemyIds || []);
  const known = new Set(floor.seen);
  const blocked = new Set(
    floor.enemies
      .filter((enemy) => enemy.hp > 0 && enemy.id !== view.autoMove?.enemyId && !noticed.has(enemy.id) && engine.isTileVisible(enemy.x, enemy.y))
      .map((enemy) => keyOf(enemy.x, enemy.y))
  );
  for (const [featureKey, feature] of Object.entries(floor.features)) {
    if (feature.type === "hazard" && featureKey !== targetKey && known.has(featureKey)) blocked.add(featureKey);
  }
  return findPath(floor.tiles, player, target, blocked, known);
}

function newlyVisibleEnemies() {
  const enemies = engine.state.expedition?.floor.enemies || [];
  const noticed = new Set(view.autoMove?.noticedEnemyIds || []);
  return enemies.filter((enemy) => (
    enemy.hp > 0
    && enemy.id !== view.autoMove?.enemyId
    && !noticed.has(enemy.id)
    && engine.isTileVisible(enemy.x, enemy.y)
  ));
}

function pauseForEnemies(enemies) {
  if (!view.autoMove || !enemies.length) return false;
  const noticed = new Set(view.autoMove.noticedEnemyIds || []);
  for (const enemy of enemies) noticed.add(enemy.id);
  view.autoMove.noticedEnemyIds = [...noticed];
  view.autoMove.paused = true;
  const names = [...new Set(enemies.map((enemy) => ENEMY_DEFS[enemy.defId].name))].join(", ");
  engine.addLog(`${names} 발견. 한 턴 경계한 뒤 이동을 계속한다.`, "bad");
  if (!engine.wait() || engine.state.expedition?.phase !== "active") {
    clearAutoMove(true);
    return true;
  }
  queueTravelStep(520);
  return true;
}

function queueTravelStep(delay = 130) {
  if (view.autoTimer) clearTimeout(view.autoTimer);
  view.autoTimer = setTimeout(runTravelStep, delay);
}

function runTravelStep() {
  view.autoTimer = null;
  const { expedition, player } = engine.state;
  if (!view.autoMove || view.bagOpen || view.hubOpen || expedition?.phase !== "active") {
    clearAutoMove(true);
    return;
  }

  const target = travelTarget();
  if (!target) {
    stopAutoMove("대상이 사라져 이동을 멈췄어.");
    return;
  }
  view.autoMove.paused = false;
  const targetIsAdjacent = Math.abs(target.x - player.x) + Math.abs(target.y - player.y) === 1;
  if (!targetIsAdjacent && pauseForEnemies(newlyVisibleEnemies())) return;
  const path = calculateTravelPath(target);
  if (path.length < 2) {
    stopAutoMove(path.length ? "" : "갈 수 있는 길이 없어.");
    return;
  }
  const next = path[1];
  const encounter = engine.enemyAt(next.x, next.y);
  const reachesTarget = next.x === target.x && next.y === target.y;
  const reachesTargetEnemy = encounter && encounter.id === view.autoMove.enemyId;
  if (reachesTarget || reachesTargetEnemy) clearAutoMove(false);
  else if (encounter) view.autoPath = path.slice(1).map((point) => keyOf(point.x, point.y));
  else view.autoPath = path.slice(2).map((point) => keyOf(point.x, point.y));

  const moved = engine.playerAct(next.x - player.x, next.y - player.y);
  if (!moved || !view.autoMove || engine.state.expedition?.phase !== "active") {
    clearAutoMove(true);
    return;
  }
  if (pauseForEnemies(newlyVisibleEnemies())) return;
  queueTravelStep();
}

function handleTile(x, y) {
  clearAutoMove(false);
  const { expedition, player } = engine.state;
  if (!expedition || expedition.phase !== "active") return;
  const floor = expedition.floor;
  const targetKey = keyOf(x, y);
  if (!floor.seen.includes(targetKey)) {
    showToast("아직 밝혀지지 않은 곳이야.");
    return;
  }
  if (floor.tiles[y]?.[x] !== "floor") {
    showToast("그곳으로는 갈 수 없어.");
    return;
  }
  if (player.x === x && player.y === y) {
    showToast("현재 위치야. 대기는 아래 버튼을 눌러줘.");
    return;
  }

  const enemy = engine.enemyAt(x, y);
  view.autoMove = { x, y, enemyId: enemy?.id || null, noticedEnemyIds: [], paused: false };
  const path = calculateTravelPath({ x, y });
  if (path.length < 2) {
    clearAutoMove(false);
    showToast("갈 수 있는 길이 없어.");
    return;
  }
  view.autoPath = path.slice(1).map((point) => keyOf(point.x, point.y));
  render();
  queueTravelStep(90);
}

function clearAdventureTravel(renderNow = false) {
  if (view.adventureTimer) clearTimeout(view.adventureTimer);
  const changed = Boolean(view.adventureTarget || view.adventurePath.length);
  view.adventureTimer = null;
  view.adventureTarget = null;
  view.adventurePath = [];
  if (changed && renderNow) render();
}

function calculateAdventurePath(target) {
  const run = engine.state.adventure?.run;
  const zone = currentZone(run);
  if (!run || !zone || !target) return [];
  return explorationPath(zone.tiles, run.player, target);
}

function queueAdventureStep(delay = 180) {
  if (view.adventureTimer) clearTimeout(view.adventureTimer);
  view.adventureTimer = setTimeout(runAdventureStep, delay);
}

function runAdventureStep() {
  view.adventureTimer = null;
  const run = engine.state.adventure?.run;
  if (!run || !view.adventureTarget || view.bagOpen || view.zoneMapOpen || view.hubOpen || view.worldOpen || view.frontierOpen || run.battle || run.status !== "active") {
    clearAdventureTravel(true);
    return;
  }
  const path = calculateAdventurePath(view.adventureTarget);
  if (path.length < 2) {
    clearAdventureTravel(true);
    return;
  }
  const next = path[1];
  view.adventurePath = path.slice(1);
  const result = engine.moveAdventureStep(next.x, next.y);
  if (!result.moved || result.type === "encounter" || result.type === "ambush" || result.type === "settlement" || result.type === "dungeonEntrance" || result.type === "dungeonExit" || result.type === "fieldExit") {
    clearAdventureTravel(true);
    return;
  }
  if (next.x === view.adventureTarget.x && next.y === view.adventureTarget.y) {
    clearAdventureTravel(true);
    return;
  }
  queueAdventureStep();
}

function handleAdventureTile(x, y) {
  clearAdventureTravel(false);
  const run = engine.state.adventure?.run;
  const zone = currentZone(run);
  if (!run || !zone || run.battle || run.status !== "active") return;
  const cellKey = keyOf(x, y);
  if (!zone.seen.includes(cellKey)) {
    showToast("아직 밝혀지지 않은 지점이야.");
    return;
  }
  const path = calculateAdventurePath({ x, y });
  if (path.length < 2) {
    showToast("그 지점까지 이어지는 길이 없어.");
    return;
  }
  view.adventureTarget = { x, y };
  view.adventurePath = path.slice(1);
  render();
  queueAdventureStep(180);
}

function syncCombatTimer() {
  const adventureBattle = engine.state.adventure?.run?.battle;
  const defenseBattle = engine.state.estateDefense?.battle;
  const battle = defenseBattle || adventureBattle;
  const waitingForConfirmation = battle === adventureBattle && Boolean(adventureBattle?.awaitingPlayerStart);
  const active = battle?.status === "active" && !waitingForConfirmation && !view.hubOpen && !view.worldOpen && !view.frontierOpen && !view.defenseMapOpen;
  if (active && !view.combatTimer) {
    view.lastCombatAt = performance.now();
    view.combatTimer = setInterval(() => {
      const now = performance.now();
      const delta = now - view.lastCombatAt;
      view.lastCombatAt = now;
      if (engine.state.estateDefense?.battle?.status === "active") engine.advanceEstateDefense(delta * COMBAT_TIME_SCALE);
      else engine.advanceRealtimeBattle(delta * COMBAT_TIME_SCALE);
    }, 120);
  }
  if (!active && view.combatTimer) {
    clearInterval(view.combatTimer);
    view.combatTimer = null;
    view.lastCombatAt = 0;
  }
  const adventureRun = engine.state.adventure?.run;
  const revealAt = Number(adventureRun?.battle?.resultRevealAt || 0);
  const resultPending = Boolean(adventureRun?.result && revealAt > Date.now() && !view.hubOpen);
  if (resultPending && !view.battleResultTimer) {
    view.battleResultTimer = setTimeout(() => {
      view.battleResultTimer = null;
      render();
    }, Math.max(16, revealAt - Date.now()));
  }
  if (!resultPending && view.battleResultTimer) {
    clearTimeout(view.battleResultTimer);
    view.battleResultTimer = null;
  }
}

function handleAppBack() {
  if (engine.state.adventure?.run?.battle?.status === "active" || (engine.state.estateDefense?.battle?.status === "active" && !view.defenseMapOpen)) {
    showToast("실시간 교전 중이야. 개척자를 직접 조작해 전투를 마쳐줘.");
    return true;
  }
  if (view.defensePlanOpen) {
    view.defensePlanOpen = false;
    render();
    return true;
  }
  if (view.defenseMapOpen && engine.state.estateDefense?.battle?.status === "active") {
    view.defenseMapOpen = false;
    render();
    return true;
  }
  if (engine.state.estateDefense?.campaign && !view.hubOpen) {
    showToast("수성 작전 중에는 내 영지로 이탈할 수 없어. 현재 단계를 마쳐줘.");
    return true;
  }
  if (view.zoneMapOpen) {
    view.zoneMapOpen = false;
    render();
    return true;
  }
  if (view.rosterOpen) {
    view.rosterOpen = false;
    render();
    return true;
  }
  if (view.frontierMenuOpen) {
    view.frontierMenuOpen = null;
    render();
    return true;
  }
  if (view.frontierOpen && view.frontierZoneOpen) {
    view.frontierZoneOpen = null;
    view.frontierSelectedSiteId = "operation";
    render();
    return true;
  }
  if (view.frontierOpen) {
    view.frontierOpen = false;
    view.frontierMenuOpen = null;
    view.worldOpen = true;
    render();
    return true;
  }
  if (view.worldOpen) {
    view.worldOpen = false;
    render();
    return true;
  }
  if (view.classOpen) {
    view.classOpen = false;
    render();
    return true;
  }
  if (view.mapOpen) {
    view.mapOpen = false;
    render();
    return true;
  }
  if (view.autoMove) {
    stopAutoMove();
    return true;
  }
  if (view.retreatConfirm) {
    view.retreatConfirm = false;
    render();
    return true;
  }
  if (view.bagOpen) {
    closeBag();
    return true;
  }
  if (view.facilityOpen) {
    view.facilityOpen = null;
    render();
    return true;
  }
  const phase = engine.state.expedition?.phase;
  if (phase === "victory") {
    engine.returnToHub("victory");
    view.hubOpen = false;
    return true;
  }
  if (phase === "defeated") {
    engine.returnToHub("defeated");
    view.hubOpen = false;
    return true;
  }
  if (engine.state.expedition && !view.hubOpen) {
    view.hubOpen = true;
    render();
    return true;
  }
  if (engine.state.adventure?.run && !view.hubOpen) {
    clearAdventureTravel(false);
    view.hubOpen = true;
    render();
    return true;
  }
  return false;
}

globalThis.handleAndroidBack = handleAppBack;

function steerCombatFromJoystick() {
  if (view.joystickMode !== "combat") return;
  const forward = -view.joystickY;
  const side = view.joystickX;
  const worldX = forward * Math.cos(view.battleCameraYaw) + side * -Math.sin(view.battleCameraYaw);
  const worldY = forward * Math.sin(view.battleCameraYaw) + side * Math.cos(view.battleCameraYaw);
  if (engine.state.estateDefense?.battle) engine.steerDefensePlayer(worldX, worldY);
  else engine.steerRealtimePlayer(worldX, worldY);
}

function stepFieldJoystick() {
  if (view.joystickMode !== "field" || Math.hypot(view.joystickX, view.joystickY) < 0.32) return;
  const run = engine.state.adventure?.run;
  if (!run || run.battle || run.status !== "active" || view.hubOpen) {
    stopJoystickControl();
    return;
  }
  clearAdventureTravel(false);
  const horizontal = Math.abs(view.joystickX) > Math.abs(view.joystickY);
  const dx = horizontal ? Math.sign(view.joystickX) : 0;
  const dy = horizontal ? 0 : Math.sign(view.joystickY);
  const result = engine.moveAdventureStep(run.player.x + dx, run.player.y + dy);
  if (result.moved && !["move", "landmark"].includes(result.type)) stopJoystickControl();
}

function updateJoystick(clientX, clientY) {
  const dx = clientX - view.joystickCenterX;
  const dy = clientY - view.joystickCenterY;
  const length = Math.hypot(dx, dy);
  const radius = 43;
  const scale = length > radius ? radius / length : 1;
  view.joystickX = (dx * scale) / radius;
  view.joystickY = (dy * scale) / radius;
  const joystick = app.querySelector(`.virtual-joystick.${view.joystickMode}-joystick`);
  if (joystick) {
    joystick.style.setProperty("--stick-x", `${Math.round(view.joystickX * 34)}px`);
    joystick.style.setProperty("--stick-y", `${Math.round(view.joystickY * 34)}px`);
  }
  if (view.joystickMode === "combat") steerCombatFromJoystick();
  else if (view.joystickMode === "field" && Math.hypot(view.joystickX, view.joystickY) >= 0.32 && performance.now() - view.lastFieldMoveAt > 260) {
    view.lastFieldMoveAt = performance.now();
    stepFieldJoystick();
  }
}

function stopJoystickControl() {
  if (view.fieldMoveTimer) clearInterval(view.fieldMoveTimer);
  view.fieldMoveTimer = null;
  if (view.joystickMode === "combat") {
    if (engine.state.estateDefense?.battle) engine.steerDefensePlayer(0, 0);
    else engine.steerRealtimePlayer(0, 0);
  }
  const joystick = app.querySelector(".virtual-joystick");
  if (joystick) {
    joystick.style.setProperty("--stick-x", "0px");
    joystick.style.setProperty("--stick-y", "0px");
    joystick.classList.remove("active");
  }
  view.joystickPointerId = null;
  view.joystickMode = null;
  view.joystickX = 0;
  view.joystickY = 0;
  view.lastFieldMoveAt = 0;
}

function beginJoystickControl(pointerId, mode, clientX, clientY) {
  stopJoystickControl();
  view.joystickPointerId = pointerId;
  view.joystickMode = mode;
  view.joystickCenterX = clientX;
  view.joystickCenterY = clientY;
  // 첫 방향 입력은 즉시 한 칸 반응하고, 이후부터 느린 반복 간격을 적용한다.
  view.lastFieldMoveAt = Number.NEGATIVE_INFINITY;
  const joystick = app.querySelector(`.virtual-joystick.${mode}-joystick`);
  if (joystick) {
    joystick.classList.add("active");
    joystick.style.setProperty("--joystick-left", `${clientX}px`);
    joystick.style.setProperty("--joystick-top", `${clientY}px`);
  }
  updateJoystick(clientX, clientY);
  if (mode === "field") view.fieldMoveTimer = setInterval(stepFieldJoystick, 300);
}

function openFrontierRegion(regionId) {
  const resolvedRegionId = WORLD_REGION_DEFS[regionId] && !WORLD_REGION_DEFS[regionId].locked ? regionId : "central";
  const regionZones = Object.values(FRONTIER_ZONE_DEFS).filter((zone) => zone.regionId === resolvedRegionId);
  const current = engine.state.frontier.selectedZoneId;
  const zoneId = regionZones.some((zone) => zone.id === current) ? current : regionZones[0]?.id;
  view.worldOpen = false;
  view.frontierOpen = true;
  view.frontierZoneOpen = null;
  view.frontierSelectedSiteId = "operation";
  view.frontierMenuOpen = null;
  view.hubOpen = false;
  engine.selectWorldRegion(resolvedRegionId);
  if (zoneId) engine.selectFrontierZone(zoneId);
  else render();
  resetScreenScroll();
}

function openFrontierZoneMap(zoneId) {
  const definition = FRONTIER_ZONE_DEFS[zoneId];
  const zone = engine.state.frontier.zones[zoneId];
  if (!definition || !zone || zone.status === "locked") {
    showToast("아직 진입 조건이 충족되지 않은 구역이야.");
    return false;
  }
  view.frontierZoneOpen = zoneId;
  view.frontierSelectedSiteId = "operation";
  view.frontierMenuOpen = null;
  engine.selectFrontierZone(zoneId);
  resetScreenScroll();
  return true;
}

function resetMapGesture() {
  view.mapPointers.clear();
  view.mapPinchLayer = null;
  view.mapPinchDistance = 0;
}

function performMapZoom(direction, layer = null) {
  if (Date.now() - view.mapGestureLastAt < 360) return false;
  const activeLayer = layer || (view.worldOpen ? "world" : view.frontierZoneOpen ? "local" : view.frontierOpen ? "regional" : null);
  if (!activeLayer) return false;
  view.mapGestureLastAt = Date.now();
  resetMapGesture();
  if (direction === "in" && activeLayer === "world") {
    openFrontierRegion(engine.state.adventure?.selectedRegionId || "central");
    return true;
  }
  if (direction === "in" && activeLayer === "regional") {
    const regionId = engine.state.adventure?.selectedRegionId || "central";
    const zones = Object.values(FRONTIER_ZONE_DEFS).filter((zone) => zone.regionId === regionId);
    const selected = zones.find((zone) => zone.id === engine.state.frontier.selectedZoneId && engine.state.frontier.zones[zone.id]?.status !== "locked")
      || zones.find((zone) => engine.state.frontier.zones[zone.id]?.status !== "locked");
    return selected ? openFrontierZoneMap(selected.id) : false;
  }
  if (direction === "out" && activeLayer === "local") {
    view.frontierZoneOpen = null;
    view.frontierSelectedSiteId = "operation";
    view.frontierMenuOpen = null;
    render();
    return true;
  }
  if (direction === "out" && activeLayer === "regional") {
    view.frontierOpen = false;
    view.frontierZoneOpen = null;
    view.frontierMenuOpen = null;
    view.worldOpen = true;
    render();
    resetScreenScroll();
    return true;
  }
  showToast(direction === "in" ? "현재 가장 가까운 하위 필드 지도야." : "현재 가장 넓은 대륙 지도야.");
  return false;
}

function mapPointerDistance() {
  const pointers = [...view.mapPointers.values()];
  if (pointers.length < 2) return 0;
  return Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
}

app.addEventListener("pointerdown", (event) => {
  const mapSurface = event.target.closest("[data-map-layer]");
  if (mapSurface && !event.target.closest("button,[data-action]")) {
    event.preventDefault();
    view.mapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY, layer: mapSurface.dataset.mapLayer });
    if (view.mapPointers.size === 2) {
      const layers = [...view.mapPointers.values()].map((pointer) => pointer.layer);
      if (layers[0] === layers[1]) {
        view.mapPinchLayer = layers[0];
        view.mapPinchDistance = mapPointerDistance();
      }
    }
    return;
  }
  const control = event.target.closest("[data-control]");
  if (!control) return;
  event.preventDefault();
  if (control.dataset.control === "joystick") {
    beginJoystickControl(event.pointerId, control.dataset.controlMode, event.clientX, event.clientY);
  }
});

app.addEventListener("mousedown", (event) => {
  const control = event.target.closest("[data-control]");
  if (!control) return;
  event.preventDefault();
  if (control.dataset.control === "joystick") {
    if (view.joystickPointerId !== null) return;
    beginJoystickControl("mouse", control.dataset.controlMode, event.clientX, event.clientY);
  }
});

window.addEventListener("pointermove", (event) => {
  if (view.mapPointers.has(event.pointerId)) {
    event.preventDefault();
    const pointer = view.mapPointers.get(event.pointerId);
    view.mapPointers.set(event.pointerId, { ...pointer, x: event.clientX, y: event.clientY });
    if (view.mapPinchLayer && view.mapPointers.size >= 2) {
      const distance = mapPointerDistance();
      const delta = distance - view.mapPinchDistance;
      if (Math.abs(delta) >= 58) performMapZoom(delta > 0 ? "in" : "out", view.mapPinchLayer);
    }
  }
  if (event.pointerId === view.joystickPointerId) {
    event.preventDefault();
    updateJoystick(event.clientX, event.clientY);
  }
}, { passive: false });

function releasePointerControl(event) {
  if (view.mapPointers.has(event.pointerId)) {
    view.mapPointers.delete(event.pointerId);
    if (view.mapPointers.size < 2) {
      view.mapPinchLayer = null;
      view.mapPinchDistance = 0;
    }
  }
  if (event.pointerId === view.joystickPointerId) stopJoystickControl();
}

window.addEventListener("pointerup", releasePointerControl);
window.addEventListener("pointercancel", releasePointerControl);

window.addEventListener("mousemove", (event) => {
  if (view.joystickPointerId === "mouse") updateJoystick(event.clientX, event.clientY);
});

window.addEventListener("mouseup", () => {
  if (view.joystickPointerId === "mouse") stopJoystickControl();
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action !== "tile") clearAutoMove(false);
  if (action === "open-facility") {
    if (button.dataset.facilityId === "gate") {
      view.facilityOpen = null;
      view.worldOpen = true;
    } else {
      view.facilityOpen = button.dataset.facilityId;
    }
    render();
  }
  if (action === "open-roster") {
    view.facilityOpen = null;
    view.rosterOpen = true;
    render();
  }
  if (action === "close-roster") {
    view.rosterOpen = false;
    render();
  }
  if (action === "toggle-party-unit") {
    if (!engine.togglePartyUnit(button.dataset.unitId)) showToast("동행 동료는 1~2명으로 편성할 수 있어.");
  }
  if (action === "assign-technique") {
    if (!engine.assignUnitTechnique(button.dataset.unitId, button.dataset.techniqueId || null)) showToast("지금은 보조 특성을 바꿀 수 없어.");
  }
  if (action === "train-unit") {
    if (!engine.trainUnit(button.dataset.unitId)) showToast("훈련에 필요한 고철이 부족해.");
  }
  if (action === "fortify-estate") {
    if (!engine.fortifyEstate()) showToast("고철 3개가 필요하거나 최대 단계야.");
  }
  if (action === "start-defense") {
    view.defensePlanOpen = true;
    render();
  }
  if (action === "resume-defense") {
    view.hubOpen = false;
    view.defenseMapOpen = true;
    render();
    resetScreenScroll();
  }
  if (action === "close-defense-plan") {
    view.defensePlanOpen = false;
    render();
  }
  if (action === "assign-defense-gate") {
    if (!engine.assignDefenseGateUnit(button.dataset.unitId, button.dataset.gateId)) showToast("기동대·원정 임무와 겹치지 않는 유닛만 성문에 배치할 수 있어.");
  }
  if (action === "assign-defense-remnant") {
    if (!engine.assignDefenseRemnantUnit(button.dataset.unitId)) showToast("소탕대는 기동대 밖의 가용 유닛 최대 5명까지 배치할 수 있어.");
  }
  if (action === "begin-defense-campaign") {
    if (engine.startEstateDefense()) {
      view.defensePlanOpen = false;
      view.defenseMapOpen = true;
      view.hubOpen = false;
      render();
      resetScreenScroll();
    } else showToast("진행 중인 원정을 마치고 기동대를 편성해줘.");
  }
  if (action === "enter-defense-gate") {
    if (engine.enterEstateDefenseGate(button.dataset.gateId)) {
      view.defenseMapOpen = false;
      render();
      resetScreenScroll();
    } else showToast("이미 방어가 끝났거나 돌파된 성문이야.");
  }
  if (action === "open-defense-map") {
    view.defenseMapOpen = true;
    render();
    resetScreenScroll();
  }
  if (action === "open-world") {
    clearAdventureTravel(false);
    view.facilityOpen = null;
    view.frontierOpen = false;
    view.worldOpen = true;
    render();
  }
  if (action === "close-world") {
    view.worldOpen = false;
    view.hubOpen = true;
    render();
  }
  if (action === "select-world-region") engine.selectWorldRegion(button.dataset.regionId);
  if (action === "open-frontier") {
    openFrontierRegion(button.dataset.regionId);
  }
  if (action === "close-frontier") {
    view.frontierOpen = false;
    view.frontierZoneOpen = null;
    view.frontierMenuOpen = null;
    view.worldOpen = true;
    render();
    resetScreenScroll();
  }
  if (action === "select-frontier-zone") engine.selectFrontierZone(button.dataset.zoneId);
  if (action === "open-frontier-zone-map") {
    openFrontierZoneMap(button.dataset.zoneId);
  }
  if (action === "close-frontier-zone-map") {
    view.frontierZoneOpen = null;
    view.frontierSelectedSiteId = "operation";
    view.frontierMenuOpen = null;
    render();
  }
  if (action === "map-zoom-in") performMapZoom("in", button.dataset.mapLayerAction);
  if (action === "map-zoom-out") performMapZoom("out", button.dataset.mapLayerAction);
  if (action === "select-frontier-site") {
    view.frontierSelectedSiteId = button.dataset.siteId;
    render();
  }
  if (action === "toggle-frontier-menu") {
    view.frontierMenuOpen = view.frontierMenuOpen === button.dataset.menuId ? null : button.dataset.menuId;
    render();
  }
  if (action === "start-frontier-adventure") {
    if (engine.startFrontierAdventure(button.dataset.zoneId, button.dataset.purpose)) {
      view.frontierOpen = false;
      view.hubOpen = false;
      clearAdventureTravel(false);
      render();
      resetScreenScroll();
    } else showToast("진입 조건과 원정대 편성을 확인해줘.");
  }
  if (action === "advance-frontier-cycle") {
    if (!engine.advanceFrontierCycle()) showToast("원정이나 전투 중에는 개척 주기를 넘길 수 없어.");
  }
  if (action === "establish-living-area") {
    if (!engine.establishLivingArea(button.dataset.livingAreaId)) showToast("선행 점령지, 건설 물자, 내 영지의 가용 주민을 확인해줘.");
  }
  if (action === "develop-frontier-site") {
    if (!engine.developFrontierSite(button.dataset.siteId)) showToast("이 지역의 생활권, 가용 작업자, 시설 재료를 확인해줘.");
  }
  if (action === "upgrade-frontier-route") {
    if (!engine.upgradeFrontierRoute(button.dataset.zoneId)) showToast("수송로 정비에 필요한 목재와 철광석을 확인해줘.");
  }
  if (action === "assign-site-escort") {
    if (!engine.assignSiteEscort(button.dataset.siteId, button.dataset.unitId || null)) showToast("원정대 밖의 가용 유닛만 호위로 보낼 수 있어.");
  }
  if (action === "assign-frontier-squad") {
    if (!engine.assignUnitToFrontierSquad(button.dataset.unitId, button.dataset.squadId)) showToast("다른 임무에 배치되지 않은 유닛만 옮길 수 있어.");
  }
  if (action === "dispatch-frontier-mission") {
    if (!engine.dispatchFrontierMission(button.dataset.squadId, button.dataset.zoneId, button.dataset.missionType)) showToast("점령지와 자동 원정대 편성을 확인해줘.");
  }
  if (action === "barter-frontier") {
    if (!engine.barterWithFaction(button.dataset.factionId)) showToast("교환에 필요한 물자가 부족해.");
  }
  if (action === "spy-frontier") {
    if (!engine.sendFrontierSpy(button.dataset.factionId, button.dataset.unitId, button.dataset.operation)) showToast("공작에 보낼 가용 유닛이 아니야.");
  }
  if (action === "pressure-frontier") {
    if (!engine.pressureFrontierFaction(button.dataset.factionId)) showToast("이미 공격이 다가오거나 다른 전투가 진행 중이야.");
  }
  if (action === "start-region") {
    if (engine.startRegionAdventure(button.dataset.regionId)) {
      view.worldOpen = false;
      view.hubOpen = false;
      clearAdventureTravel(false);
      render();
    }
  }
  if (action === "resume-adventure") {
    view.worldOpen = false;
    view.frontierOpen = false;
    view.hubOpen = false;
    clearAdventureTravel(false);
    render();
  }
  if (action === "close-facility") {
    view.facilityOpen = null;
    render();
  }
  if (action === "set-warehouse-category" && ITEM_CATEGORY_DEFS[button.dataset.categoryId]) {
    view.warehouseCategory = button.dataset.categoryId;
    render();
  }
  if (action === "select-area") engine.selectArea(button.dataset.areaId);
  if (action === "start-expedition") {
    view.facilityOpen = null;
    view.hubOpen = false;
    engine.startExpedition();
  }
  if (action === "resume-expedition") {
    view.facilityOpen = null;
    view.hubOpen = false;
    render();
  }
  if (action === "open-bag") openBag();
  if (action === "close-bag") closeBag();
  if (action === "open-class") {
    view.classOpen = true;
    render();
  }
  if (action === "close-class") {
    view.classOpen = false;
    render();
  }
  if (action === "select-commander-kit") engine.selectCommanderKit(button.dataset.kitId);
  if (action === "toggle-commander-skill") {
    if (!engine.toggleCommanderSkill(button.dataset.skillId)) showToast("장착 기술은 최대 3개야. 먼저 기술 하나를 해제해줘.");
  }
  if (action === "select-class") engine.selectClass(button.dataset.classId);
  if (action === "select-trait") engine.selectTrait(button.dataset.traitId);
  if (action === "open-map") {
    view.mapOpen = true;
    render();
  }
  if (action === "close-map") {
    view.mapOpen = false;
    render();
  }
  if (action === "map-tile") {
    view.mapOpen = false;
    handleTile(Number(button.dataset.x), Number(button.dataset.y));
  }
  if (action === "back-hub") {
    view.facilityOpen = null;
    view.hubOpen = true;
    render();
  }
  if (action === "adventure-back") {
    clearAdventureTravel(false);
    view.hubOpen = true;
    render();
  }
  if (action === "zone-tile") handleAdventureTile(Number(button.dataset.x), Number(button.dataset.y));
  if (action === "open-zone-map") {
    clearAdventureTravel(false);
    view.zoneMapOpen = true;
    render();
  }
  if (action === "close-zone-map") {
    view.zoneMapOpen = false;
    render();
  }
  if (action === "zone-map-tile") {
    view.zoneMapOpen = false;
    handleAdventureTile(Number(button.dataset.x), Number(button.dataset.y));
  }
  if (action === "enter-dungeon") {
    clearAdventureTravel(false);
    if (engine.enterAdventureDungeon()) render();
  }
  if (action === "enter-settlement") engine.enterAdventureSettlement();
  if (action === "leave-settlement") engine.leaveAdventureSettlement();
  if (action === "leave-dungeon") {
    clearAdventureTravel(false);
    if (engine.leaveAdventureDungeon()) render();
  }
  if (action === "cancel-adventure-prompt") engine.cancelAdventurePrompt();
  if (action === "request-adventure-retreat") {
    clearAdventureTravel(false);
    view.retreatConfirm = true;
    render();
  }
  if (action === "cancel-adventure-retreat") {
    view.retreatConfirm = false;
    render();
  }
  if (action === "battle-ground") {
    const bounds = button.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    const accepted = engine.state.estateDefense?.battle
      ? engine.moveDefensePlayer(x, y)
      : engine.moveRealtimePlayer(x, y);
    if (!accepted) showToast("지금은 개척자를 이동시킬 수 없어.");
  }
  if (action === "battle-player-target") {
    const accepted = engine.state.estateDefense?.battle
      ? engine.targetDefenseEnemy(button.dataset.targetId)
      : engine.targetRealtimeEnemy(button.dataset.targetId);
    if (!accepted) showToast("목표로 지정할 수 없는 적이야.");
  }
  if (action === "player-battle-action") {
    const accepted = engine.state.estateDefense?.battle
      ? engine.playerDefenseAction(button.dataset.playerAction)
      : engine.playerRealtimeAction(button.dataset.playerAction);
    if (!accepted) showToast("재사용 대기시간이나 적과의 거리를 확인해줘.");
    else if (button.dataset.playerAction === "attack") render();
  }
  if (action === "confirm-battle-start") {
    if (engine.confirmRealtimeBattleStart()) {
      stopJoystickControl();
      render();
    }
  }
  if (action === "battle-command") {
    const accepted = engine.state.estateDefense?.battle
      ? engine.commandEstateDefense(button.dataset.command)
      : engine.commandRealtimeBattle(button.dataset.command);
    if (!accepted) showToast("명령 재사용 대기 중이야.");
  }
  if (action === "inspect-battle-unit") {
    const unit = (engine.state.estateDefense?.battle || engine.state.adventure?.run?.battle)?.units.find((entry) => entry.id === button.dataset.targetId);
    if (unit) showToast(`${unit.name} · 체력 ${Math.ceil(unit.hp)}/${unit.maxHp}`);
  }
  if (action === "continue-after-battle") {
    if (engine.continueAfterBattle()) render();
  }
  if (action === "return-adventure-estate") {
    clearAdventureTravel(false);
    view.retreatConfirm = false;
    view.worldOpen = false;
    view.hubOpen = true;
    const status = engine.state.adventure?.run?.status;
    engine.returnAdventureToEstate(status === "completed" ? "completed" : status === "defeated" ? "defeated" : "retreat");
  }
  if (action === "resolve-defense-stage") {
    if (engine.resolveEstateDefense()) {
      const phase = engine.state.estateDefense.campaign?.phase;
      view.defenseMapOpen = phase === "gates" || phase === "remnants" || phase === "resolved";
      render();
      resetScreenScroll();
    }
  }
  if (action === "resolve-defense-remnants") {
    if (engine.resolveEstateRemnants()) {
      view.defenseMapOpen = true;
      render();
      resetScreenScroll();
    }
  }
  if (action === "finish-defense-campaign") {
    if (engine.finishEstateDefenseCampaign()) {
      view.defenseMapOpen = false;
      view.hubOpen = true;
      render();
      resetScreenScroll();
    }
  }
  if (action === "move") engine.playerAct(Number(button.dataset.dx), Number(button.dataset.dy));
  if (action === "tile") handleTile(Number(button.dataset.x), Number(button.dataset.y));
  if (action === "wait") engine.wait();
  if (action === "class-skill") {
    if (!engine.useClassSkill()) showToast("대상, 직업 자원 또는 재사용 대기를 확인해줘.");
  }
  if (action === "request-retreat") {
    view.retreatConfirm = true;
    render();
  }
  if (action === "cancel-retreat") {
    view.retreatConfirm = false;
    render();
  }
  if (action === "confirm-retreat") {
    view.retreatConfirm = false;
    view.hubOpen = false;
    engine.returnToHub("retreat");
  }
  if (action === "return-victory") {
    view.facilityOpen = null;
    view.hubOpen = false;
    engine.returnToHub("victory");
  }
  if (action === "return-defeated") {
    view.facilityOpen = null;
    view.hubOpen = false;
    engine.returnToHub("defeated");
  }
  if (action === "research") {
    if (!engine.purchaseResearch(button.dataset.researchId)) showToast("고철이 부족해.");
  }
  if (action === "hire-worker") {
    if (!engine.hireWorker(button.dataset.workerId)) showToast("고철, 최대 인원 또는 원정 상태를 확인해줘.");
  }
  if (action === "craft-recipe") {
    if (!engine.craftRecipe(button.dataset.recipeId)) showToast("설계도와 제작 재료를 확인해줘.");
  }
  if (action === "select-item") {
    const item = engine.state.inventory.find((entry) => entry.uid === button.dataset.uid);
    view.selectedUid = item?.uid || null;
    view.selectedRotation = item?.rotation || 0;
    render();
  }
  if (action === "deselect-item") {
    view.selectedUid = null;
    render();
  }
  if (action === "bag-cell") handleBagCell(Number(button.dataset.x), Number(button.dataset.y));
  if (action === "rotate-item") {
    const item = engine.state.inventory.find((entry) => entry.uid === view.selectedUid);
    if (!item) return;
    const rotation = (view.selectedRotation + 1) % 4;
    view.selectedRotation = rotation;
    if (item.x >= 0 && !engine.placeInventoryItem(item.uid, item.x, item.y, rotation)) {
      view.selectedRotation = item.rotation;
      showToast("현재 위치에서는 회전할 공간이 부족해.");
    } else if (item.x < 0) {
      render();
    }
  }
  if (action === "store-item") {
    if (view.selectedUid) engine.removeInventoryItem(view.selectedUid);
  }
  if (action === "use-item") {
    const uid = button.dataset.uid;
    view.bagOpen = false;
    view.selectedUid = null;
    if (!engine.useInventoryItem(uid)) showToast("지금은 사용할 수 없어.");
  }
  if (action === "inspect") {
    const placed = engine.state.inventory.filter((item) => item.x >= 0).length;
    const linked = engine.state.inventory.filter((item) => item.x >= 0 && engine.getLinkedUids(item.uid).length).length;
    showToast(`작동 아이템 ${placed}개 · 연결된 아이템 ${linked}개`);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (handleAppBack()) event.preventDefault();
    return;
  }
  if (view.bagOpen || view.classOpen || view.hubOpen || !engine.state.expedition || engine.state.expedition.phase !== "active") return;
  const moves = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0]
  };
  if (moves[event.key]) {
    event.preventDefault();
    clearAutoMove(false);
    engine.playerAct(...moves[event.key]);
  }
  if (event.key === " " || event.key === ".") {
    event.preventDefault();
    clearAutoMove(false);
    engine.wait();
  }
});

engine.subscribe(render);
render();

const isNativeApp = Boolean(globalThis.Capacitor?.isNativePlatform?.());

if (!isNativeApp && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
