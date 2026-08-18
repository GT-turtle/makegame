import { AFFIX_DEFS, AREA_DEFS, CLASS_DEFS, CRAFT_RECIPES, ENEMY_DEFS, ITEM_DEFS, MATERIAL_DEFS, RESEARCH_DEFS, TRAIT_DEFS, WORKER_DEFS } from "./data.js";
import {
  addMaterial,
  advanceEstate,
  bagFingerprint,
  createCraftedItem,
  createExpedition,
  createInitialState,
  createItem,
  createUid,
  distance,
  environmentMitigation,
  hasAdjacentTag,
  isVisible,
  keyOf,
  masteryGainMultiplier,
  masteryLevel,
  migrateState,
  pathStepToward,
  placeItem,
  removeItem,
  resolveBagTrigger,
  revealFloor,
  synergyItemUids,
  useHerbKit
} from "./core.js";

const SAVE_KEY = "packforge-expedition-save-v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

  emit() {
    this.save();
    for (const listener of this.listeners) listener(this.state);
  }

  addLog(text, tone = "") {
    this.state.log.unshift({ text, tone });
    this.state.log = this.state.log.slice(0, 12);
  }

  startExpedition(areaIdOrSeed = this.state.meta.selectedAreaId, seed) {
    if (this.state.expedition) return false;
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
    if (this.state.expedition || !AREA_DEFS[areaId]) return false;
    this.state.meta.selectedAreaId = areaId;
    this.addLog(`다음 목적지 선택: ${AREA_DEFS[areaId].name}`, "item");
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

  selectClass(classId) {
    if (this.state.expedition || !CLASS_DEFS[classId]) return false;
    this.state.meta.classId = classId;
    this.state.player.classResource = Math.min(2, CLASS_DEFS[classId].resourceMax);
    this.addLog(`전투 계통 선택: ${CLASS_DEFS[classId].name}`, "item");
    this.emit();
    return true;
  }

  selectTrait(traitId) {
    if (this.state.expedition || !TRAIT_DEFS[traitId]) return false;
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
    if (this.state.expedition || !definition || this.state.meta.research.includes(researchId)) return false;
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
    if (this.state.expedition || !definition || workerId === "steward") return false;
    const current = this.state.meta.estate.workers[workerId] || 0;
    if (current >= definition.max || this.state.meta.scrap < definition.cost) return false;
    this.state.meta.scrap -= definition.cost;
    this.state.meta.estate.workers[workerId] = current + 1;
    this.addLog(`${definition.name} 고용 완료. 자동 생산 인원 ${current + 1}명.`, "item");
    this.emit();
    return true;
  }

  craftRecipe(recipeId, random = Math.random) {
    const recipe = CRAFT_RECIPES.find((entry) => entry.id === recipeId);
    const workers = this.state.meta.estate.workers;
    if (this.state.expedition || !recipe || workers.blacksmith < 1) return false;
    if (!this.state.meta.blueprints.includes(recipe.id)) return false;
    for (const [materialId, amount] of Object.entries(recipe.materials)) {
      if ((this.state.meta.materials[materialId] || 0) < amount) return false;
    }
    for (const [materialId, amount] of Object.entries(recipe.materials)) this.state.meta.materials[materialId] -= amount;
    const item = createCraftedItem(recipe.itemDefId, createUid(this.state), random);
    this.state.inventory.push(item);
    const affixes = item.affixes.map((affixId) => AFFIX_DEFS[affixId].name).join(" · ");
    this.addLog(`제작 완료: ${ITEM_DEFS[item.defId].name} 품질 ${item.quality}${affixes ? ` · ${affixes}` : ""}`, "item");
    this.emit();
    return item;
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
