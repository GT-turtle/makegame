import { AFFIX_DEFS, AREA_DEFS, BAG_COLS, CLASS_DEFS, CRAFT_RECIPES, ENEMY_DEFS, ITEM_DEFS, MATERIAL_DEFS, RESEARCH_DEFS, TAG_LABELS, TRAIT_DEFS, VIEW_SIZE, WORKER_DEFS } from "./data.js";
import { findPath, itemCells, keyOf, masteryLevel } from "./core.js";
import { GameEngine } from "./game.js";

const app = document.querySelector("#app");
const engine = new GameEngine();

const view = {
  bagOpen: false,
  selectedUid: null,
  selectedRotation: 0,
  bagFingerprint: "",
  hubOpen: false,
  classOpen: false,
  mapOpen: false,
  retreatConfirm: false,
  autoMove: null,
  autoPath: [],
  autoTimer: null,
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

function showToast(message) {
  view.toast = message;
  clearTimeout(view.toastTimer);
  render();
  view.toastTimer = setTimeout(() => {
    view.toast = "";
    render();
  }, 1800);
}

function currentArea(state) {
  return AREA_DEFS[state.expedition?.areaId || state.meta.selectedAreaId] || AREA_DEFS.estate;
}

function topbar(state) {
  const location = state.expedition && !view.hubOpen ? currentArea(state).name : "개척 영지";
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
      </div>
    </header>
  `;
}

function hubScreen(state) {
  const activeCount = state.inventory.filter((item) => item.x >= 0).length;
  const linkedItems = state.inventory.filter((item) => item.x >= 0 && engine.getLinkedUids(item.uid).length > 0).length;
  const ongoing = state.expedition;
  const selectedArea = AREA_DEFS[ongoing?.areaId || state.meta.selectedAreaId] || AREA_DEFS.estate;
  const selectedRecord = state.meta.areaRecords[selectedArea.id];
  const beaconRecord = selectedArea.beaconGoal ? `${selectedRecord.bestSurvey}/${selectedArea.beaconGoal}` : "안전";
  const classDef = CLASS_DEFS[state.meta.classId];
  const traitDef = TRAIT_DEFS[state.meta.traitId];
  const mastery = masteryLevel(state.meta.skillMastery[classDef.skill.id] || 0);
  const unlockedRecipes = CRAFT_RECIPES.filter((recipe) => state.meta.blueprints.includes(recipe.id));
  return `
    <main class="screen hub-screen">
      <section class="hero">
        <p class="eyebrow">지역 선택형 개척 RPG · 구조 시제품 0.4.0</p>
        <h1>한 세계를 준비하고,<br>각 지역을 정복한다.</h1>
        <p>월드맵에서 내 영지·사막·설산을 선택한다. 각 지역은 독립된 턴제 지도, 환경 압력, 적, 희귀 재료와 목표를 가진다.</p>
        <div class="hero-actions">
          <button class="primary" data-action="${ongoing ? "resume-expedition" : "start-expedition"}">${ongoing ? `${selectedArea.name} 이어가기` : `${selectedArea.glyph} ${selectedArea.name} 들어가기`}</button>
          ${ongoing ? '<button class="ghost" data-action="request-retreat">원정 종료·정산</button>' : ""}
        </div>
      </section>

      <div class="summary-grid">
        <article class="summary-stat"><span>최고 측량</span><b>${beaconRecord}</b></article>
        <article class="summary-stat"><span>완료 원정</span><b>${state.meta.victories}</b></article>
        <article class="summary-stat"><span>작동 아이템</span><b>${activeCount}</b></article>
        <article class="summary-stat"><span>연결 아이템</span><b>${linkedItems}</b></article>
      </div>

      <div class="section-heading">
        <h2>개척 지도</h2>
        <span>지역마다 별도의 턴제 맵과 규칙</span>
      </div>
      <section class="area-grid" aria-label="탐험 지역 선택">
        ${Object.values(AREA_DEFS).map((area) => areaCard(state, area, selectedArea.id, ongoing)).join("")}
      </section>

      <div class="section-heading">
        <h2>개척자</h2>
        <span>직업의 전투 방식 · 출신의 환경 적응</span>
      </div>
      <article class="card class-summary" style="--class-color:${classDef.color}">
        <div class="class-glyph">${classDef.glyph}</div>
        <div class="class-copy">
          <p class="eyebrow">${escapeHtml(traitDef.name)} · ${classDef.skill.name} 숙련 ${mastery}</p>
          <h3>${escapeHtml(classDef.name)}</h3>
          <p>${escapeHtml(classDef.description)}</p>
        </div>
        <button class="secondary" data-action="open-class" ${ongoing ? "disabled" : ""}>${ongoing ? "원정 중 고정" : "직업·특성"}</button>
      </article>

      <div class="section-heading">
        <h2>현재 가방</h2>
        <span>${BAG_COLS}×${state.meta.bagRows} · ${state.inventory.length}개 보유</span>
      </div>
      <article class="card bag-summary-card">
        <div>
          <h3>${ongoing ? `진행 중 · ${selectedArea.name}${ongoing.beaconGoal ? ` · 측량 ${ongoing.beaconsActivated}/${ongoing.beaconGoal}` : ""}` : `${selectedArea.name} 출발 전 배치`}</h3>
          <p>${ongoing ? `미보관 고철 ${ongoing.runScrap}. 가방을 바꾸면 원정 시간 한 턴이 흐른다.` : "공방에서는 시간이 흐르지 않는다. 장비를 자유롭게 옮기고 조합을 확인할 수 있다."}</p>
        </div>
        <button class="secondary" data-action="open-bag">가방 열기</button>
      </article>

      <div class="section-heading">
        <h2>영지 생산</h2>
        <span>원정의 한 턴마다 일꾼도 움직인다</span>
      </div>
      <div class="material-grid">
        ${Object.values(MATERIAL_DEFS).map((material) => `
          <article class="material-stock ${material.common ? "common" : "rare"}">
            <span>${material.glyph}</span><small>${escapeHtml(material.name)}</small><b>${state.meta.materials[material.id] || 0}</b>
          </article>
        `).join("")}
      </div>
      <section class="worker-grid">
        ${Object.values(WORKER_DEFS).map((worker) => workerCard(state, worker, ongoing)).join("")}
      </section>

      <div class="section-heading">
        <h2>대장간 제작</h2>
        <span>설계도 ${unlockedRecipes.length}/${CRAFT_RECIPES.length} · 제작 품질과 옵션은 매번 변동</span>
      </div>
      <section class="cards forge-cards">
        ${unlockedRecipes.map((recipe) => craftCard(state, recipe, ongoing)).join("") || '<div class="empty-state">원정에서 설계도를 찾아오면 제작 목록이 열린다.</div>'}
      </section>

      <div class="section-heading">
        <h2>공방 연구</h2>
        <span>공용 룬·연금 장비의 설계도를 해금한다</span>
      </div>
      <section class="cards">
        ${RESEARCH_DEFS.map((research) => researchCard(state, research)).join("")}
      </section>
    </main>
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

function workerCard(state, worker, ongoing) {
  const count = state.meta.estate.workers[worker.id] || 0;
  const isSteward = worker.id === "steward";
  const disabled = isSteward || ongoing || count >= worker.max || state.meta.scrap < worker.cost;
  return `
    <article class="worker-card">
      <span class="worker-glyph">${worker.glyph}</span>
      <div><strong>${escapeHtml(worker.name)} ${count}/${worker.max}</strong><small>${escapeHtml(worker.description)}</small></div>
      <button class="ghost" data-action="hire-worker" data-worker-id="${worker.id}" ${disabled ? "disabled" : ""}>${isSteward ? "재직 중" : count >= worker.max ? "최대" : `고용 ${worker.cost}`}</button>
    </article>
  `;
}

function materialCost(materials) {
  return Object.entries(materials).map(([id, amount]) => `${MATERIAL_DEFS[id].glyph} ${MATERIAL_DEFS[id].name} ${amount}`).join(" · ");
}

function craftCard(state, recipe, ongoing) {
  const definition = ITEM_DEFS[recipe.itemDefId];
  const affordable = Object.entries(recipe.materials).every(([id, amount]) => (state.meta.materials[id] || 0) >= amount);
  const classLabel = recipe.classId ? CLASS_DEFS[recipe.classId].name : "공용";
  return `
    <article class="card recipe-card" style="--item-color:${definition.color}">
      <div class="research-icon">${definition.glyph}</div>
      <div class="research-main">
        <p class="eyebrow">${classLabel} 설계도</p>
        <h3>${escapeHtml(recipe.name)}</h3>
        <p>${materialCost(recipe.materials)}</p>
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
      <span><strong>${escapeHtml(definition.name)}</strong><small>품질 ${item.quality || 50} · ${definition.mask[0].length}×${definition.mask.length} · ${definition.tags.map((tag) => TAG_LABELS[tag]).join(" · ")}</small></span>
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
        ${definition.tags.map((tag) => `<span class="tag">${TAG_LABELS[tag]}</span>`).join("")}
        ${affixes.map((affix) => `<span class="tag affix-tag">${escapeHtml(affix.name)} · ${escapeHtml(affix.description)}</span>`).join("")}
        ${links.map((name) => `<span class="tag linked-tag">연결: ${escapeHtml(name)}</span>`).join("")}
      </div>
    </article>
  `;
}

function classOverlay(state) {
  if (!view.classOpen) return "";
  const selectedClass = CLASS_DEFS[state.meta.classId];
  return `
    <div class="overlay" role="dialog" aria-modal="true" aria-label="직업과 출신 특성 선택">
      <section class="sheet class-sheet">
        <header class="sheet-header">
          <div><p class="eyebrow">전투 계통과 환경 대응</p><h2>개척자 설정</h2></div>
          <button class="primary" data-action="close-class">뒤로</button>
        </header>
        <p class="bag-help">직업은 자원 획득 방식과 고유 기술을, 출신은 환경 대응 또는 성장 속도를 결정한다. 원정 전에는 언제든 바꿀 수 있다.</p>
        <div class="class-choice-grid">
          ${Object.values(CLASS_DEFS).map((classDef) => {
            const selected = classDef.id === state.meta.classId;
            const level = masteryLevel(state.meta.skillMastery[classDef.skill.id] || 0);
            return `
              <button class="class-choice ${selected ? "selected" : ""}" style="--class-color:${classDef.color}" data-action="select-class" data-class-id="${classDef.id}">
                <span class="class-glyph">${classDef.glyph}</span>
                <strong>${escapeHtml(classDef.name)}</strong>
                <small>${escapeHtml(classDef.description)}</small>
                <i>${classDef.skill.glyph} ${escapeHtml(classDef.skill.name)} · 숙련 ${level}</i>
              </button>
            `;
          }).join("")}
        </div>
        <div class="selected-skill-card" style="--class-color:${selectedClass.color}">
          <b>${selectedClass.skill.glyph} ${escapeHtml(selectedClass.skill.name)}</b>
          <span>${escapeHtml(selectedClass.skill.description)} · ${selectedClass.resourceName} ${selectedClass.skill.cost} · 재사용 ${selectedClass.skill.cooldown}턴</span>
        </div>
        <div class="section-heading"><h2>출신 특성</h2><span>직업과 자유롭게 조합</span></div>
        <div class="trait-choice-grid">
          ${Object.values(TRAIT_DEFS).map((trait) => `
            <button class="trait-choice ${trait.id === state.meta.traitId ? "selected" : ""}" data-action="select-trait" data-trait-id="${trait.id}">
              <strong>${escapeHtml(trait.name)}</strong><small>${escapeHtml(trait.description)}</small>
            </button>
          `).join("")}
        </div>
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
  const body = state.expedition && !view.hubOpen ? expeditionScreen(state) : hubScreen(state);
  app.innerHTML = `
    <div class="app-shell">
      ${topbar(state)}
      ${body}
      ${bagOverlay(state)}
      ${classOverlay(state)}
      ${worldMapOverlay(state)}
      ${phaseModal(state)}
      ${retreatModal(state)}
      ${view.toast ? `<div class="toast" role="status">${escapeHtml(view.toast)}</div>` : ""}
    </div>
  `;
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

function handleAppBack() {
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
  return false;
}

globalThis.handleAndroidBack = handleAppBack;

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action !== "tile") clearAutoMove(false);
  if (action === "select-area") engine.selectArea(button.dataset.areaId);
  if (action === "start-expedition") {
    view.hubOpen = false;
    engine.startExpedition();
  }
  if (action === "resume-expedition") {
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
    view.hubOpen = true;
    render();
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
    view.hubOpen = false;
    engine.returnToHub("victory");
  }
  if (action === "return-defeated") {
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
