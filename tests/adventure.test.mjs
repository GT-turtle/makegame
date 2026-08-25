import test from "node:test";
import assert from "node:assert/strict";

import {
  DUNGEON_SIZE,
  ENCOUNTER_DEFS,
  FIELD_SIZE,
  MONSTER_ECOLOGY_DEFS,
  PARTY_LIMIT,
  STATUS_EFFECT_DEFS,
  STARTING_PARTY,
  STARTING_ROSTER,
  UNIT_DEFS,
  WORLD_REGION_DEFS,
  applyCombatStatus,
  adventureZoneIsConnected,
  completeBattle,
  createAutoBattle,
  createDungeon,
  createField,
  createRegionRun,
  enterRunDungeon,
  enterRunSettlement,
  explorationPath,
  BOSS_PATTERN_DEFS,
  ENEMY_COMBATANTS,
  PLAYER_DODGE_DEFS,
  playerDodgeDefinition,
  issuePlayerAction,
  issueBattleCommand,
  leaveRunSettlement,
  moveBattlePlayer,
  steerBattlePlayer,
  moveRunPlayer,
  dungeonClearRewards,
  selectPlayerTarget,
  tickAutoBattle,
  ARENA_BOUNDS,
  FIELD_AGGRO_RADIUS,
  FIELD_BOUNDS,
  consumeFieldTrigger,
  resolveObstacles,
  createFieldBattle,
  REGION_ARMOR_SET
} from "../src/adventure.js";
import { MATERIAL_DEFS } from "../src/data.js";
import { ARMOR_SET_DEFS, EQUIPMENT_DEFS, LEGENDARY_CLEAR_REQUIREMENT, LEGENDARY_DEFS, PLAYER_BASE_CLASS_DEFS, PLAYER_KIT_DEFS, createDefaultCommander, legendariesForRegion, legendaryCollection, playerCombatStats } from "../src/classes.js";
import { GameEngine } from "../src/game.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) || null; }
  setItem(key, value) { this.values.set(key, value); }
}


// 장비를 끼운 지휘관을 만든다. 장비가 인스턴스(uid)로 바뀌면서 픽스처가
// 장황해져서, 정의 id만 넘기면 인스턴스를 만들어 장착까지 해주는 헬퍼를 둔다.
function gearUp(commander, bySlot, grade = "common") {
  let n = 0;
  for (const [slot, defId] of Object.entries(bySlot)) {
    if (!defId) continue;
    n += 1;
    const uid = "fixture" + n;
    commander.equipmentOwned.push({ uid, defId, grade, options: [] });
    commander.equipped[slot] = uid;
  }
  return commander;
}

test("다섯 지역 필드는 41×41이고 모든 조우와 던전 입구가 연결된다", () => {
  for (const regionId of Object.keys(WORLD_REGION_DEFS)) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const field = createField(seed * 1777, regionId);
      assert.equal(field.width, FIELD_SIZE);
      assert.equal(field.height, FIELD_SIZE);
      assert.equal(adventureZoneIsConnected(field), true, `${regionId} seed ${seed}`);
      assert.equal(Object.values(field.features).filter((feature) => feature.type === "settlement").length, 1);
      const path = explorationPath(field.tiles, field.start, field.entrance);
      assert.ok(path.length > 20, `${regionId} 필드의 던전이 충분히 멀리 있어야 한다`);
    }
  }
});

test("전투 조이스틱 입력은 플레이어를 연속 이동시키고 놓으면 멈춘다", () => {
  const battle = createAutoBattle("duneRaiders", "joystick", "field", [], {}, { commander: createDefaultCommander() });
  const player = battle.units.find((unit) => unit.controlled);
  const startX = player.x;
  assert.equal(steerBattlePlayer(battle, 2, 0), true);
  assert.equal(battle.playerMoveInput.x, 1);
  tickAutoBattle(battle, 120);
  assert.ok(player.x > startX);
  assert.equal(steerBattlePlayer(battle, 0, 0), true);
  const stoppedX = player.x;
  tickAutoBattle(battle, 120);
  assert.equal(player.x, stoppedX);
});

test("원정 전장의 몬스터는 2~3마리로 제한해 영혼 수확 상한을 통제한다", () => {
  for (const encounter of Object.values(ENCOUNTER_DEFS)) {
    // 지역 보스는 단독 전투다. 기믹과 페이즈로 싸우는 보스라 잡몹을 섞으면
    // 무엇을 보고 대응해야 하는지가 흐려진다(docs/BOSS_DESIGN.md §2).
    // 이 규칙은 "적이 많을 때"의 영혼 수확 상한을 막는 게 목적이므로
    // 단독 전투는 애초에 문제가 되지 않는다.
    if (!encounter.regionBoss) assert.ok(encounter.enemies.length >= 2, `${encounter.name} 최소 2마리`);
    assert.ok(encounter.enemies.length <= 3, `${encounter.name} 최대 3마리`);
  }
});

test("비점령지 이동 중 던전 진입 전까지 불규칙 습격이 발생한다", () => {
  const run = createRegionRun("central", 8181, STARTING_ROSTER, {}, {}, { purpose: "conquest", ambushInterval: [2, 2] });
  assert.equal(moveRunPlayer(run, 4, 20).type, "move");
  const ambush = moveRunPlayer(run, 5, 20);
  assert.equal(ambush.type, "ambush");
  assert.ok(run.battle);
  assert.equal(run.battle.awaitingPlayerStart, true);
  assert.equal(run.irregularAmbushes, 1);

  run.battle.status = "victory";
  completeBattle(run);
  run.battle = null;
  run.result = null;
  run.dungeonEntered = true;
  run.nextAmbushStep = run.fieldSteps + 1;
  assert.equal(moveRunPlayer(run, 6, 20).type, "move");
});

test("필드의 부락 타일까지 이동해 안으로 들어갔다가 다시 나올 수 있다", () => {
  const run = createRegionRun("north", 4422);
  const [settlementKey, settlement] = Object.entries(run.field.features).find(([, feature]) => feature.type === "settlement");
  const [targetX, targetY] = settlementKey.split(",").map(Number);
  const path = explorationPath(run.field.tiles, run.player, { x: targetX, y: targetY });
  let result = null;
  for (const point of path.slice(1)) {
    result = moveRunPlayer(run, point.x, point.y);
    if (result.type === "encounter") {
      run.battle.status = "victory";
      completeBattle(run);
      run.battle = null;
      run.result = null;
    }
  }
  assert.equal(result.type, "settlement");
  assert.equal(enterRunSettlement(run).id, settlement.id);
  assert.equal(settlement.visited, true);
  assert.equal(run.settlementVisit.name, WORLD_REGION_DEFS.north.villageName);
  assert.equal(leaveRunSettlement(run), true);
  assert.equal(run.settlementVisit, null);
});

test("각 지역 위협 생태는 고블린·오크·늑대·곰 4종의 지역 변종으로 시작한다", () => {
  for (const regionId of Object.keys(WORLD_REGION_DEFS)) {
    assert.equal(MONSTER_ECOLOGY_DEFS[regionId].length, 4);
    const roles = MONSTER_ECOLOGY_DEFS[regionId].map((entry) => entry.role).join(" ");
    for (const species of ["고블린", "오크", "늑대", "곰"]) assert.match(roles, new RegExp(species));
  }
});

test("던전은 15×15 밀집 구조이며 수문대와 우두머리까지 연결된다", () => {
  for (const regionId of Object.keys(WORLD_REGION_DEFS)) {
    const dungeon = createDungeon(9001, regionId);
    assert.equal(dungeon.width, DUNGEON_SIZE);
    assert.equal(dungeon.height, DUNGEON_SIZE);
    assert.equal(adventureZoneIsConnected(dungeon), true);
    assert.equal(Object.values(dungeon.features).filter((feature) => feature.type === "encounter").length, 3);
  }
});

test("필드의 실제 입구 좌표에 도달한 뒤에만 던전에 들어간다", () => {
  const run = createRegionRun("central", 321);
  assert.equal(enterRunDungeon(run), false);
  const path = explorationPath(run.field.tiles, run.player, run.field.entrance);
  for (const point of path.slice(1)) {
    const result = moveRunPlayer(run, point.x, point.y);
    if (result.type === "encounter") {
      run.battle.status = "victory";
      completeBattle(run);
      run.battle = null;
      run.result = null;
    }
  }
  assert.equal(run.pendingEntrance, true);
  assert.equal(enterRunDungeon(run), true);
  assert.equal(run.location, "dungeon");
  assert.equal(run.player.x, run.dungeon.start.x);
});

test("플레이어 1명은 직접 조작하고 동료 2명은 진형 구분 없이 자동으로 싸운다", () => {
  const battle = createAutoBattle("sandHunters", "encounter", "field");
  assert.equal(battle.units.length, 3);
  assert.equal(battle.units.filter((unit) => unit.controlled).length, 1);
  assert.equal(battle.units.filter((unit) => !unit.controlled).length, 2);
  assert.ok(battle.units.filter((unit) => !unit.controlled).every((unit) => unit.x === 14));
  const player = battle.units.find((unit) => unit.controlled);
  const startX = player.x;
  assert.equal(moveBattlePlayer(battle, 62, 48), true);
  tickAutoBattle(battle, 250);
  assert.ok(player.x > startX);
  assert.equal(selectPlayerTarget(battle, battle.enemies[0].id), true);
  player.x = battle.enemies[0].x - 5;
  player.y = battle.enemies[0].y;
  assert.equal(issuePlayerAction(battle, "attack"), true);
  assert.equal(issuePlayerAction(battle, "dodge"), true);
  assert.equal(issuePlayerAction(battle, "skill1"), true);
  let ticks = 0;
  while (battle.status === "active" && ticks < 800) {
    if (ticks === 45) issueBattleCommand(battle, "focus", battle.enemies[0].id);
    const target = battle.enemies.find((enemy) => enemy.hp > 0);
    if (target && player.hp > 0) {
      player.x = target.x - 5;
      player.y = target.y;
      issuePlayerAction(battle, "attack");
      issuePlayerAction(battle, "skill2");
    }
    tickAutoBattle(battle, 120);
    ticks += 1;
  }
  assert.equal(battle.status, "victory");
  assert.ok(battle.elapsed > 0);
  assert.ok(battle.enemies.every((enemy) => enemy.hp === 0));
});

test("게임 저장에는 직접 조작 개척자와 기본 자동전투 동료가 유지된다", () => {
  const storage = new MemoryStorage();
  const engine = new GameEngine(storage);
  assert.equal(engine.state.adventure.commander.name, "개척자");
  assert.equal(engine.state.adventure.commander.level, 1);
  assert.deepEqual(engine.state.adventure.roster, STARTING_ROSTER);
  assert.deepEqual(engine.state.adventure.party, STARTING_PARTY);
  assert.equal(engine.startRegionAdventure("north", 7788), true);
  // 지역 탐험은 이제 격자 필드가 아니라 광역 전투 아레나로 시작한다.
  assert.equal(engine.state.adventure.run.field, null);
  assert.ok(engine.state.adventure.run.battle?.fieldMode);
  const restored = new GameEngine(storage);
  assert.equal(restored.state.adventure.run.regionId, "north");
  assert.equal(restored.state.adventure.commander.name, "개척자");
  assert.equal(Object.keys(WORLD_REGION_DEFS).length, 5);
});

test("v15 진행 중 전투에도 새 피격·영혼 시간 규칙을 보강해 그대로 복구한다", () => {
  const storage = new MemoryStorage();
  const engine = new GameEngine(storage);
  assert.equal(engine.selectCommanderKit("heavyNecromancer"), true);
  assert.equal(engine.startRegionAdventure("central", 9911), true);
  engine.state.adventure.run.battle = createAutoBattle(
    "duneRaiders",
    "migration-battle",
    "field",
    STARTING_PARTY,
    {},
    { commander: engine.state.adventure.commander }
  );
  engine.state.adventure.run.battle.playerBasePassive = {
    id: "soulHarvest",
    name: "영혼 수확",
    effect: "soulHarvest",
    maxStacks: 3,
    summonDamagePerStack: 0.08
  };
  engine.state.adventure.run.battle.basePassiveState = { soulStacks: 1, harvestedEnemyIds: ["old-corpse"] };
  engine.state.version = 15;
  engine.save();

  const restored = new GameEngine(storage);
  assert.ok(restored.state.adventure.run?.battle);
  assert.equal(restored.state.adventure.run.battle.playerBaseClassId, "necromancer");
  assert.equal(restored.state.adventure.run.battle.playerBasePassive.id, "soulHarvest");
  assert.equal(restored.state.adventure.run.battle.playerBasePassive.durationMs, 12000);
  assert.deepEqual(restored.state.adventure.run.battle.basePassiveState, {
    hitCount: 0,
    soulStacks: 1,
    soulExpiresAt: 12000,
    harvestedEnemyIds: ["old-corpse"]
  });
});

test("필드 조우부터 던전 우두머리와 영지 정산까지 한 원정으로 이어진다", () => {
  const engine = new GameEngine(new MemoryStorage());
  assert.equal(engine.startRegionAdventure("central", 4455), true);
  const fightToEnd = () => {
    const battle = engine.state.adventure.run.battle;
    assert.equal(battle.awaitingPlayerStart, true);
    assert.equal(engine.advanceRealtimeBattle(120), "waiting");
    assert.equal(engine.confirmRealtimeBattleStart(), true);
    engine.commandRealtimeBattle("charge");
    engine.commandRealtimeBattle("guard");
    let guard = 0;
    while (battle.status === "active" && guard < 800) {
      const player = battle.units.find((unit) => unit.controlled && unit.hp > 0);
      const target = battle.enemies.find((enemy) => enemy.hp > 0);
      if (player && target) {
        // 보스 예고 장판 위에 있으면 먼저 빠져나온다. 붙어서 때리기만 하면 광역기를
        // 전부 맞는 게 설계 의도라, 안 피하게 두면 이 통합 테스트가 전투 난이도에
        // 따라 들쭉날쭉해진다(원정 흐름을 보는 테스트지 밸런스 테스트가 아니다).
        const danger = (battle.zones || []).find((zone) => zone.kind !== "summon"
          && battle.elapsed >= zone.bornAt
          && Math.hypot(player.x - zone.x, player.y - zone.y) <= (zone.radius || zone.width || 12) + 2);
        if (danger) {
          const angle = Math.atan2(player.y - danger.y, player.x - danger.x) || 0;
          player.x = danger.x + Math.cos(angle) * ((danger.radius || 12) + 10);
          player.y = danger.y + Math.sin(angle) * ((danger.radius || 12) + 10);
        } else {
          player.x = target.x - 5;
          player.y = target.y;
        }
        engine.playerRealtimeAction("attack");
        engine.playerRealtimeAction("skill1");
        engine.playerRealtimeAction("skill2");
        engine.playerRealtimeAction("skill3");
      }
      engine.advanceRealtimeBattle(120);
      guard += 1;
    }
    assert.equal(battle.status, "victory");
    if (engine.state.adventure.run.result.type === "battleVictory") engine.continueAfterBattle();
  };
  const walkTo = (target) => {
    let safety = 0;
    while (safety < 80) {
      const run = engine.state.adventure.run;
      const zone = run.location === "dungeon" ? run.dungeon : run.field;
      const path = explorationPath(zone.tiles, run.player, target);
      assert.ok(path.length >= 1);
      if (path.length === 1) return;
      const result = engine.moveAdventureStep(path[1].x, path[1].y);
      if (result.type === "encounter") fightToEnd();
      safety += 1;
    }
    assert.fail("목적지 이동 횟수 초과");
  };

  let run = engine.state.adventure.run;

  // 1단계: 광역 필드 — 화면 전환 없이 그 자리에서 무리를 정리한다.
  const fieldBattle = run.battle;
  assert.ok(fieldBattle?.fieldMode, "지역 탐험은 광역 전투로 시작한다");
  let fieldGuard = 0;
  while (fieldBattle.enemies.some((enemy) => enemy.hp > 0) && fieldGuard < 2000) {
    const player = fieldBattle.units.find((unit) => unit.controlled && unit.hp > 0);
    const target = fieldBattle.enemies.find((enemy) => enemy.hp > 0);
    if (player && target) {
      player.x = target.x - 5;
      player.y = target.y;
      target.dormant = false;
      engine.playerRealtimeAction("attack");
      engine.playerRealtimeAction("skill1");
      engine.playerRealtimeAction("skill2");
      engine.playerRealtimeAction("skill3");
    }
    engine.advanceRealtimeBattle(120);
    fieldGuard += 1;
  }
  assert.ok(fieldBattle.fieldCleared, "필드의 무리를 전부 정리했다");
  assert.equal(fieldBattle.status, "active", "필드를 비워도 전투 자체는 끝나지 않는다");

  // 2단계: 던전 입구로 걸어가면 그대로 던전으로 이어진다.
  const entrance = fieldBattle.triggers[0];
  const fieldPlayer = fieldBattle.units.find((unit) => unit.controlled);
  fieldPlayer.x = entrance.x;
  fieldPlayer.y = entrance.y;
  assert.equal(engine.advanceRealtimeBattle(120), "dungeonEntrance");
  assert.equal(run.pendingEntrance, true);
  assert.equal(engine.enterAdventureDungeon(), true);
  for (const target of [{ x: 7, y: 7 }, { x: 11, y: 5 }, { x: 11, y: 11 }]) walkTo(target);
  run = engine.state.adventure.run;
  assert.equal(run.status, "completed");
  assert.equal(run.bossDefeated, true);
  const beforeGlassSand = engine.state.meta.materials.glassSand;
  assert.equal(engine.returnAdventureToEstate("completed"), true);
  assert.equal(engine.state.adventure.run, null);
  assert.equal(engine.state.adventure.records.central.victories, 1);
  assert.ok(engine.state.meta.materials.glassSand > beforeGlassSand);
  assert.equal(engine.state.meta.essence, 1);
  assert.equal(engine.state.adventure.commander.storedBoss.species, "bear");
});

test("보유 유닛은 최대 2명까지 편성하고 보조 특성을 교체할 수 있다", () => {
  const engine = new GameEngine(new MemoryStorage());
  assert.equal(engine.togglePartyUnit("oath_knight"), true);
  assert.equal(engine.state.adventure.party.length, 1);
  assert.equal(engine.togglePartyUnit("desert_lancer"), true);
  assert.equal(engine.state.adventure.party.length, PARTY_LIMIT);
  assert.equal(engine.togglePartyUnit("venom_tracker"), false);
  assert.equal(engine.assignUnitTechnique("snow_guard", "oath"), true);
  assert.equal(engine.state.adventure.unitProgress.snow_guard.secondaryId, "oath");
});

test("직업은 패시브 1개·스킬 4개·궁 1개를 가지며 전승은 패시브 1개를 더하고 스킬 4개와 궁을 바꾼다", () => {
  for (const baseClass of Object.values(PLAYER_BASE_CLASS_DEFS)) {
    assert.ok(baseClass.passive?.id);
    assert.equal(baseClass.skills.length, 4);
    assert.ok(baseClass.ultimate?.id);
  }
  for (const kit of Object.values(PLAYER_KIT_DEFS)) {
    assert.ok(PLAYER_BASE_CLASS_DEFS[kit.baseClassId]);
    assert.equal(kit.skills.length, 4);
    assert.ok(kit.ultimate?.id);
    assert.ok(kit.passive?.id);
    assert.equal(kit.defaultLoadout.length, 3);
  }
  const commander = createDefaultCommander();
  commander.combatKitId = "heavyNecromancer";
  const battle = createAutoBattle("duneRaiders", "class-test", "field", STARTING_PARTY, {}, { commander });
  assert.equal(battle.playerSkillIds.length, 3);
  assert.equal(battle.playerBasePassive.id, "soulHarvest");
  assert.equal(battle.playerPassive.id, "armoredDead");
  battle.enemies[0].hp = 0;
  assert.equal(issuePlayerAction(battle, "skill2"), true); // spiritRaise (default loadout order 2)
  assert.equal(battle.units.filter((unit) => unit.summonType === "raisedDead").length, 1);

  const engine = new GameEngine(new MemoryStorage());
  assert.equal(engine.selectCommanderKit("heavyNecromancer"), true);
  assert.equal(engine.state.adventure.commander.combatKitId, "heavyNecromancer");
  assert.equal(engine.toggleCommanderSkill("spiritRaise"), true); // already in default loadout -> toggles off
  assert.equal(engine.state.adventure.commander.skillLoadouts.heavyNecromancer.length, 2);
  assert.equal(engine.toggleCommanderSkill("spiritBolt"), true); // not in loadout -> toggles on
  assert.ok(engine.state.adventure.commander.skillLoadouts.heavyNecromancer.includes("spiritBolt"));
  assert.equal(engine.toggleCommanderSkill("storedApex"), false);
});

test("기본 직업 패시브는 전승 패시브와 별도로 실제 전투에 적용된다", () => {
  // rollSeed를 고정한다: 기본 킷(spiritCrusader)의 패시브가 피격 시 확률로
  // 화상/빙결을 걸어 적을 먼저 죽여버리면 피격 횟수가 4가 아니라 3에서 끊긴다.
  // 시드가 없으면 전역 Math.random() 소비 순서에 따라 간헐적으로 실패했다.
  const cycle = createAutoBattle("duneRaiders", "cycle", "field", [], {}, { commander: createDefaultCommander(), rollSeed: 1234 });
  const noCycle = createAutoBattle("duneRaiders", "no-cycle", "field", [], {}, { commander: createDefaultCommander(), rollSeed: 1234 });
  for (const battle of [cycle, noCycle]) {
    const player = battle.units.find((unit) => unit.controlled);
    player.hp = 30;
    for (const enemy of battle.enemies.slice(1)) enemy.hp = 0;
    const enemy = battle.enemies[0];
    enemy.x = player.x;
    enemy.y = player.y;
    enemy.damage = 1;
    enemy.attackMs = 16;
    enemy.cooldown = 0;
  }
  const cyclePlayer = cycle.units.find((unit) => unit.controlled);
  const noCyclePlayer = noCycle.units.find((unit) => unit.controlled);
  noCycle.playerBasePassive = null;
  noCyclePlayer.basePassive = null;
  for (let hit = 0; hit < 4; hit += 1) {
    tickAutoBattle(cycle, 20);
    tickAutoBattle(noCycle, 20);
  }
  assert.equal(cycle.passiveState[cyclePlayer.id].hitCount, 4);
  tickAutoBattle(cycle, 20);
  tickAutoBattle(noCycle, 20);
  assert.equal(cycle.passiveState[cyclePlayer.id].hitCount, 0);
  assert.ok(cyclePlayer.hp > noCyclePlayer.hp);

  const commander = createDefaultCommander();
  commander.combatKitId = "heavyNecromancer";
  const harvest = createAutoBattle("duneRaiders", "harvest", "field", STARTING_PARTY, {}, { commander });
  const harvestPlayer = harvest.units.find((unit) => unit.controlled);
  harvest.enemies[0].hp = 0;
  tickAutoBattle(harvest, 20);
  assert.equal(issuePlayerAction(harvest, "skill2"), true);
  const summon = harvest.units.find((unit) => unit.summonType === "raisedDead");
  assert.equal(harvest.passiveState[harvestPlayer.id].soulStacks, 1);
  assert.equal(summon.passiveDamageMultiplier, 1.08);
  harvest.elapsed = harvest.passiveState[harvestPlayer.id].soulExpiresAt;
  tickAutoBattle(harvest, 20);
  assert.equal(harvest.passiveState[harvestPlayer.id].soulStacks, 0);
  assert.equal(summon.passiveDamageMultiplier, 1);
});

test("동료는 기본 직업의 패시브를 얻고 스펙이 플레이어 레벨을 따라간다", () => {
  const definition = UNIT_DEFS.winter_berserker;
  assert.equal(definition.baseClassId, "barbarian");

  const lowCommander = createDefaultCommander();
  const lowBattle = createAutoBattle("duneRaiders", "low", "field", ["winter_berserker"], {}, { commander: lowCommander });
  const lowCompanion = lowBattle.units.find((unit) => !unit.controlled);
  assert.equal(lowCompanion.baseClassId, "barbarian");
  assert.equal(lowCompanion.basePassive.effect, "rageScaling");

  const highCommander = createDefaultCommander();
  highCommander.level = 10;
  const highBattle = createAutoBattle("duneRaiders", "high", "field", ["winter_berserker"], {}, { commander: highCommander });
  const highCompanion = highBattle.units.find((unit) => !unit.controlled);
  assert.ok(highCompanion.maxHp > lowCompanion.maxHp);
  assert.ok(highCompanion.damage > lowCompanion.damage);

  lowCompanion.hp = Math.max(1, Math.round(lowCompanion.maxHp * 0.2));
  tickAutoBattle(lowBattle, 20);
  assert.ok(lowCompanion.passiveDamageMultiplier > 1);
});

test("두 전승의 액티브 10개(스킬 4개+궁 1개 × 2)가 실제 전투 효과로 모두 실행된다", () => {
  const spiritCommander = createDefaultCommander();
  const spiritFront = createAutoBattle("duneRaiders", "spirit-front", "field", STARTING_PARTY, {}, { commander: spiritCommander });
  const spiritPlayer = spiritFront.units.find((unit) => unit.controlled);
  spiritPlayer.x = spiritFront.enemies[0].x - 5;
  spiritPlayer.y = spiritFront.enemies[0].y;
  selectPlayerTarget(spiritFront, spiritFront.enemies[0].id);
  assert.equal(issuePlayerAction(spiritFront, "skill1"), true); // spiritMending
  assert.equal(issuePlayerAction(spiritFront, "skill2"), true); // winterAegis
  assert.equal(issuePlayerAction(spiritFront, "skill3"), true); // thunderLance
  assert.equal(issuePlayerAction(spiritFront, "ultimate"), true); // spiritConflagration

  spiritCommander.skillLoadouts.spiritCrusader = ["spiritBulwark"];
  const spiritBack = createAutoBattle("duneRaiders", "spirit-back", "field", STARTING_PARTY, {}, { commander: spiritCommander });
  const spiritBackPlayer = spiritBack.units.find((unit) => unit.controlled);
  spiritBackPlayer.x = spiritBack.enemies[0].x - 8;
  spiritBackPlayer.y = spiritBack.enemies[0].y;
  selectPlayerTarget(spiritBack, spiritBack.enemies[0].id);
  assert.equal(issuePlayerAction(spiritBack, "skill1"), true); // spiritBulwark

  const heavyCommander = createDefaultCommander();
  heavyCommander.combatKitId = "heavyNecromancer";
  const heavyFront = createAutoBattle("duneRaiders", "heavy-front", "field", STARTING_PARTY, {}, { commander: heavyCommander });
  const heavyPlayer = heavyFront.units.find((unit) => unit.controlled);
  heavyPlayer.x = heavyFront.enemies[0].x - 5;
  heavyPlayer.y = heavyFront.enemies[0].y;
  selectPlayerTarget(heavyFront, heavyFront.enemies[0].id);
  assert.equal(issuePlayerAction(heavyFront, "skill1"), true); // spiritDecay
  heavyFront.enemies[0].hp = 0;
  assert.equal(issuePlayerAction(heavyFront, "skill2"), true); // spiritRaise
  assert.equal(issuePlayerAction(heavyFront, "skill3"), true); // spiritWard

  heavyCommander.storedBoss = { defId: "testBear", name: "시험 큰곰", species: "bear", glyph: "B", color: "#999", maxHp: 80, damage: 9, range: 9, speed: 5, attackMs: 1500, armor: 0.12 };
  heavyCommander.skillLoadouts.heavyNecromancer = ["spiritBolt"];
  const heavyBack = createAutoBattle("duneRaiders", "heavy-back", "field", STARTING_PARTY, {}, { commander: heavyCommander });
  heavyBack.enemies[0].hp = 0;
  const heavyBackPlayer = heavyBack.units.find((unit) => unit.controlled);
  heavyBackPlayer.x = heavyBack.enemies[1].x - 8;
  heavyBackPlayer.y = heavyBack.enemies[1].y;
  selectPlayerTarget(heavyBack, heavyBack.enemies[1].id);
  assert.equal(issuePlayerAction(heavyBack, "skill1"), true); // spiritBolt (non-default, forced into loadout)
  assert.equal(issuePlayerAction(heavyBack, "ultimate"), true); // storedApex
  assert.equal(heavyBack.units.filter((unit) => unit.summonType === "storedBoss").length, 1);
  assert.equal(issuePlayerAction(heavyBack, "skill3"), true); // spiritRaise (default-filled)
  assert.equal(heavyBack.consumedCorpseIds.length, 1);
});

test("정령크루는 피격당하면 확률적으로 상대에게 화상이나 빙결을 되돌린다", () => {
  const commander = createDefaultCommander();
  const battle = createAutoBattle("duneRaiders", "spiritcru-proc", "field", [], {}, { commander });
  const player = battle.units.find((unit) => unit.controlled);
  const enemy = battle.enemies[0];
  enemy.x = player.x;
  enemy.y = player.y;
  enemy.damage = 1;
  enemy.attackMs = 16;
  enemy.cooldown = 0;
  const originalRandom = Math.random;
  Math.random = () => 0; // always proc, always pick "burn"
  try {
    tickAutoBattle(battle, 20);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(Boolean(enemy.statuses?.burn), true);
});

test("크루세이더·네크로맨서 기본 직업 스킬 4개+궁 1개가 문서 스펙대로 실행된다", () => {
  const crusaderCommander = createDefaultCommander();
  crusaderCommander.combatKitId = "crusader";
  const crusaderFront = createAutoBattle("duneRaiders", "crusader-front", "field", STARTING_PARTY, {}, { commander: crusaderCommander });
  const crusaderPlayer = crusaderFront.units.find((unit) => unit.controlled);
  crusaderPlayer.x = crusaderFront.enemies[0].x - 5;
  crusaderPlayer.y = crusaderFront.enemies[0].y;
  selectPlayerTarget(crusaderFront, crusaderFront.enemies[0].id);
  assert.equal(issuePlayerAction(crusaderFront, "skill1"), true); // holyBlessing
  assert.equal(issuePlayerAction(crusaderFront, "skill2"), true); // holyWard
  assert.equal(issuePlayerAction(crusaderFront, "skill3"), true); // holyLance (stun)
  assert.equal(issuePlayerAction(crusaderFront, "ultimate"), true); // holyJudgment

  crusaderCommander.skillLoadouts.crusader = ["holyBulwark"];
  const crusaderBack = createAutoBattle("duneRaiders", "crusader-back", "field", STARTING_PARTY, {}, { commander: crusaderCommander });
  const crusaderBackPlayer = crusaderBack.units.find((unit) => unit.controlled);
  crusaderBackPlayer.x = crusaderBack.enemies[0].x - 5;
  crusaderBackPlayer.y = crusaderBack.enemies[0].y;
  selectPlayerTarget(crusaderBack, crusaderBack.enemies[0].id);
  assert.equal(issuePlayerAction(crusaderBack, "skill1"), true); // holyBulwark
  assert.equal(crusaderBack.enemies.some((enemy) => enemy.forcedTargetId === crusaderBackPlayer.id), true);

  const necromancerCommander = createDefaultCommander();
  necromancerCommander.combatKitId = "necromancer";
  necromancerCommander.storedBoss = { defId: "testBear", name: "시험 큰곰", species: "bear", glyph: "B", color: "#999", maxHp: 80, damage: 9, range: 9, speed: 5, attackMs: 1500, armor: 0.12 };
  const necroFront = createAutoBattle("duneRaiders", "necro-front", "field", STARTING_PARTY, {}, { commander: necromancerCommander });
  const necroPlayer = necroFront.units.find((unit) => unit.controlled);
  necroPlayer.x = necroFront.enemies[0].x - 5;
  necroPlayer.y = necroFront.enemies[0].y;
  selectPlayerTarget(necroFront, necroFront.enemies[0].id);
  assert.equal(issuePlayerAction(necroFront, "skill1"), true); // spiritDecay (AoE)
  assert.equal(issuePlayerAction(necroFront, "ultimate"), true); // spiritApex (storedApex)
  assert.equal(necroFront.units.some((unit) => unit.summonType === "storedBoss"), true);
  necroFront.enemies[0].hp = 0;
  assert.equal(issuePlayerAction(necroFront, "skill2"), true); // spiritRaise (up to 3, one-time)
  assert.equal(necroFront.spiritRaiseUsed, true);
  assert.equal(issuePlayerAction(necroFront, "skill3"), true); // spiritWard (self)

  necromancerCommander.skillLoadouts.necromancer = ["spiritBolt"];
  const necroBack = createAutoBattle("duneRaiders", "necro-back", "field", STARTING_PARTY, {}, { commander: necromancerCommander });
  const necroBackPlayer = necroBack.units.find((unit) => unit.controlled);
  necroBackPlayer.x = necroBack.enemies[0].x - 8;
  necroBackPlayer.y = necroBack.enemies[0].y;
  selectPlayerTarget(necroBack, necroBack.enemies[0].id);
  assert.equal(issuePlayerAction(necroBack, "skill1"), true); // spiritBolt
});

test("바바리안 스킬 4개+궁 1개가 실제 전투 효과로 모두 실행된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "barbarian";
  const front = createAutoBattle("duneRaiders", "barbarian-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // battleRoar
  assert.equal(issuePlayerAction(front, "skill2"), true); // earthSlam
  assert.equal(issuePlayerAction(front, "skill3"), true); // cleave
  assert.equal(issuePlayerAction(front, "ultimate"), true); // berserkerRage

  commander.skillLoadouts.barbarian = ["recklessCharge"];
  const back = createAutoBattle("duneRaiders", "barbarian-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  selectPlayerTarget(back, back.enemies[0].id);
  assert.equal(issuePlayerAction(back, "skill1"), true); // recklessCharge
});

test("추적자 스킬 4개+궁 1개가 실제 전투 효과로 모두 실행된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "tracker";
  const front = createAutoBattle("duneRaiders", "tracker-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // aimedShot
  assert.equal(issuePlayerAction(front, "skill2"), true); // scatterShot
  assert.equal(issuePlayerAction(front, "skill3"), true); // shadowStrike
  assert.equal(issuePlayerAction(front, "ultimate"), true); // arrowStorm

  commander.skillLoadouts.tracker = ["vanish"];
  const back = createAutoBattle("duneRaiders", "tracker-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  assert.equal(issuePlayerAction(back, "skill1"), true); // vanish
  assert.equal(Boolean(backPlayer.positiveEffects?.stealth), true);
});

test("매화 스킬 4개+궁 1개가 실제 전투 효과로 모두 실행된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "maehwa";
  const front = createAutoBattle("duneRaiders", "maehwa-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // swiftStrike
  assert.equal(issuePlayerAction(front, "skill2"), true); // whirlwindSlash
  assert.equal(issuePlayerAction(front, "skill3"), true); // phantomCut
  assert.equal(issuePlayerAction(front, "ultimate"), true); // plumBlossomDance(낙화)

  commander.skillLoadouts.maehwa = ["fleetStep"];
  const marksBack = createAutoBattle("duneRaiders", "maehwa-marks", "field", STARTING_PARTY, {}, { commander });
  const marksPlayer = marksBack.units.find((unit) => unit.controlled);
  marksPlayer.x = marksBack.enemies[0].x - 5;
  marksPlayer.y = marksBack.enemies[0].y;
  selectPlayerTarget(marksBack, marksBack.enemies[0].id);
  assert.equal(issuePlayerAction(marksBack, "skill1"), true); // fleetStep(개화), 표식 부여 시작
  assert.equal(issuePlayerAction(marksBack, "attack"), true);
  assert.ok(marksBack.enemies[0].maehwaMarks > 0);
  assert.equal(issuePlayerAction(marksBack, "ultimate"), true); // plumBlossomDance, 표식 소모
  assert.equal(marksBack.enemies[0].maehwaMarks, 0);
});

test("바바리안의 정령 전사 전승은 스킬 4개+궁 1개가 모두 실행되고 출혈·늑대 변신 보너스가 적용된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "spiritBarbarian";
  const front = createAutoBattle("duneRaiders", "spiritbarbarian-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // battleRoar
  assert.equal(issuePlayerAction(front, "skill2"), true); // earthSlam (+ 출혈)
  assert.equal(Boolean(front.enemies[0].statuses?.bleed), true);
  assert.equal(issuePlayerAction(front, "skill3"), true); // recklessCharge (+ 돌격 강화)
  assert.equal(issuePlayerAction(front, "ultimate"), true); // berserkerRage (+ 늑대 변신)
  assert.equal(Boolean(player.positiveEffects?.wolfForm), true);
  assert.equal(player.positiveEffects?.berserk?.bonus, 0.5);

  commander.skillLoadouts.spiritBarbarian = ["cleave"];
  const back = createAutoBattle("duneRaiders", "spiritbarbarian-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  backPlayer.x = back.enemies[0].x - 5;
  backPlayer.y = back.enemies[0].y;
  selectPlayerTarget(back, back.enemies[0].id);
  assert.equal(issuePlayerAction(back, "skill1"), true); // cleave (+ 공격력 대폭 증가)
});

test("아크메이지 스킬 4개+궁 1개가 실제 전투 효과로 모두 실행된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "archmage";
  const front = createAutoBattle("duneRaiders", "archmage-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  front.enemies[1].x = front.enemies[0].x + 15;
  front.enemies[1].y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // fireBolt
  assert.equal(issuePlayerAction(front, "skill2"), true); // frostNova
  const beforeX = front.enemies[1].x;
  assert.equal(issuePlayerAction(front, "skill3"), true); // gravityWell
  assert.ok(front.enemies[1].x < beforeX); // 끌려와서 target 쪽으로 이동
  assert.equal(issuePlayerAction(front, "ultimate"), true); // manaBurst
  assert.equal(Boolean(front.enemies[0].statuses?.stun), false); // 무속성 - 상태이상 없음

  commander.skillLoadouts.archmage = ["lightningRicochet"];
  const back = createAutoBattle("duneRaiders", "archmage-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  backPlayer.x = back.enemies[0].x - 5;
  backPlayer.y = back.enemies[0].y;
  back.enemies[1].x = back.enemies[0].x;
  back.enemies[1].y = back.enemies[0].y;
  selectPlayerTarget(back, back.enemies[0].id);
  const secondEnemyHpBefore = back.enemies[1].hp;
  assert.equal(issuePlayerAction(back, "skill1"), true); // lightningRicochet
  assert.ok(back.enemies[1].hp < secondEnemyHpBefore); // 연쇄로 두 번째 적까지 피해
  assert.equal(Boolean(back.enemies[0].statuses?.stun), true); // 감전(기절) 부여
  assert.equal(Boolean(back.enemies[1].statuses?.stun), true);
});

test("중갑크루 전승은 스킬 4개+궁 1개가 실행되고 복수치가 쌓이고 소모된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "heavyCrusader";
  const front = createAutoBattle("duneRaiders", "heavycrusader-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  front.vengeanceStored = 40;
  assert.equal(issuePlayerAction(front, "skill1"), true); // heavyBlessing
  assert.ok(front.vengeanceStored < 40);
  assert.equal(issuePlayerAction(front, "skill2"), true); // heavyWard
  assert.equal(issuePlayerAction(front, "skill3"), true); // heavyLance
  front.vengeanceStored = 40;
  assert.equal(issuePlayerAction(front, "ultimate"), true); // heavyJudgment
  assert.equal(front.vengeanceStored, 0);

  commander.skillLoadouts.heavyCrusader = ["heavyBulwark"];
  const back = createAutoBattle("duneRaiders", "heavycrusader-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  backPlayer.x = back.enemies[0].x - 5;
  backPlayer.y = back.enemies[0].y;
  assert.equal(issuePlayerAction(back, "skill1"), true); // heavyBulwark
  assert.equal(back.enemies.some((enemy) => enemy.forcedTargetId === backPlayer.id), true);
  assert.ok(back.vengeanceGainBoostUntil > back.elapsed);
});

test("궁사네크 전승은 스킬 4개+궁 1개가 모두 실행된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "archeryNecromancer";
  commander.storedBoss = { defId: "testBear", name: "시험 큰곰", species: "bear", glyph: "B", color: "#999", maxHp: 80, damage: 9, range: 9, speed: 5, attackMs: 1500, armor: 0.12 };
  const front = createAutoBattle("duneRaiders", "archerynecro-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // spiritDecay
  assert.equal(issuePlayerAction(front, "skill2"), true); // spiritBolt
  front.enemies[1].hp = 0;
  assert.equal(issuePlayerAction(front, "skill3"), true); // spiritRaise
  assert.equal(issuePlayerAction(front, "ultimate"), true); // storedApex + berserk
  assert.equal(Boolean(player.positiveEffects?.berserk), true);

  commander.skillLoadouts.archeryNecromancer = ["spiritWard"];
  const back = createAutoBattle("duneRaiders", "archerynecro-back", "field", STARTING_PARTY, {}, { commander });
  assert.equal(issuePlayerAction(back, "skill1"), true); // spiritWard
  const backPlayer = back.units.find((unit) => unit.controlled);
  assert.equal(Boolean(backPlayer.positiveEffects?.spiritSurge), true);
});

test("암살자(궁사매화) 전승은 스킬 4개+궁 1개가 모두 실행되고 은신 연계가 작동한다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "archeryMaehwa";
  const front = createAutoBattle("duneRaiders", "archerymaehwa-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  player.positiveEffects = { stealth: { endsAt: front.elapsed + 4000 } };
  assert.equal(issuePlayerAction(front, "skill1"), true); // swiftStrike(암살), 은신 중 치명타
  assert.equal(Boolean(player.positiveEffects?.stealth), false);
  assert.equal(issuePlayerAction(front, "skill2"), true); // whirlwindSlash(연막탄), 후퇴 + 재은신
  assert.equal(Boolean(player.positiveEffects?.stealth), true);
  assert.equal(issuePlayerAction(front, "skill3"), true); // phantomCut(일섬)
  assert.equal(issuePlayerAction(front, "ultimate"), true); // plumBlossomDance(일격필살)

  commander.skillLoadouts.archeryMaehwa = ["fleetStep"];
  const back = createAutoBattle("duneRaiders", "archerymaehwa-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  assert.equal(issuePlayerAction(back, "skill1"), true); // fleetStep(은신 개화)
  assert.equal(Boolean(backPlayer.positiveEffects?.stealth), true);
});

test("마검사(마법매화) 전승은 스킬 4개+궁 1개가 모두 실행되고 화염·냉기·원거리 검기가 적용된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "magicMaehwa";
  const front = createAutoBattle("duneRaiders", "magicmaehwa-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 24;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill3"), true); // phantomCut(검기), 기본 매화라면 실패할 사거리(24)에서도 명중
  assert.equal(issuePlayerAction(front, "skill1"), true); // swiftStrike(화염검 일섬) + 화상
  assert.equal(Boolean(front.enemies[0].statuses?.burn), true);
  assert.equal(issuePlayerAction(front, "skill2"), true); // whirlwindSlash(빙결검 선풍) + 빙결
  assert.equal(Boolean(front.enemies[0].statuses?.frost), true);
  assert.equal(issuePlayerAction(front, "ultimate"), true); // plumBlossomDance(마력 낙화)

  commander.skillLoadouts.magicMaehwa = ["fleetStep"];
  const back = createAutoBattle("duneRaiders", "magicmaehwa-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  backPlayer.x = back.enemies[0].x - 5;
  backPlayer.y = back.enemies[0].y;
  selectPlayerTarget(back, back.enemies[0].id);
  assert.equal(issuePlayerAction(back, "skill1"), true); // fleetStep(마력 개화)
  assert.equal(issuePlayerAction(back, "attack"), true);
  assert.equal(Boolean(back.enemies[0].statuses?.frost), true); // 냉기 둔화 부여
});

test("정령아크 전승은 스킬 4개+궁 1개가 모두 실행되고 상태이상 상한 2배·정령 피격불가·상태이상 폭주 피해가 적용된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "spiritArchmage";
  const front = createAutoBattle("duneRaiders", "spiritarchmage-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  front.enemies[1].x = front.enemies[0].x;
  front.enemies[1].y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);

  // 패시브(자연 친화): 플레이어가 거는 상태이상의 중첩 상한이 2배(독 기본 상한 5 → 10)로 늘어난다
  for (let i = 0; i < 7; i += 1) applyCombatStatus(front, front.enemies[0], "poison", player, { stacks: 1 });
  assert.equal(front.enemies[0].statuses.poison.stacks, 7);
  assert.ok(front.enemies[0].statuses.poison.stacks > 5); // 기본 상한(5)을 넘어선다

  assert.equal(issuePlayerAction(front, "skill1"), true); // fireBolt(폭염창) + 주변 폭발
  assert.equal(Boolean(front.enemies[1].statuses?.burn), true);

  const wisp = front.units.find((unit) => unit.summonType === "spiritWisp");
  assert.ok(wisp); // 패시브가 정령을 자동 소환한다(더 이상 액티브 스킬이 아니다)
  assert.equal(wisp.invulnerable, true);

  assert.equal(issuePlayerAction(front, "skill2"), true); // frostNova(빙결 폭발)
  assert.equal(Boolean(front.enemies[0].statuses?.frost), true);

  assert.equal(issuePlayerAction(front, "skill3"), true); // gravityWell(원소 소용돌이)
  assert.equal(Boolean(player.positiveEffects?.elementalSurge), true); // 상태이상 위력 폭증

  assert.equal(issuePlayerAction(front, "ultimate"), true); // triElementJudgment(삼원소 심판)
  assert.equal(Boolean(front.enemies[0].statuses?.frost), true);
  assert.equal(Boolean(front.enemies[0].statuses?.stun), true);
  assert.equal(Boolean(front.enemies[0].statuses?.burn), true); // 빙결·감전·화상이 한 번에 모두 적용된다

  // 정령은 적에게 인접해도 체력이 줄지 않는다(피격불가) - 별도 전투로 격리 검증
  const wispBattle = createAutoBattle("duneRaiders", "spiritarchmage-wisp", "field", STARTING_PARTY, {}, { commander });
  const wispPlayer = wispBattle.units.find((unit) => unit.controlled);
  wispPlayer.x = wispBattle.enemies[0].x - 5;
  wispPlayer.y = wispBattle.enemies[0].y;
  selectPlayerTarget(wispBattle, wispBattle.enemies[0].id);
  assert.equal(issuePlayerAction(wispBattle, "skill1"), true); // fireBolt - 패시브가 정령을 소환한다
  const wisp2 = wispBattle.units.find((unit) => unit.summonType === "spiritWisp");
  assert.ok(wisp2);
  const attacker = wispBattle.enemies[0];
  attacker.x = wisp2.x;
  attacker.y = wisp2.y;
  attacker.cooldown = 0;
  for (let i = 0; i < 5; i += 1) tickAutoBattle(wispBattle, 200);
  assert.equal(wisp2.hp, wisp2.maxHp);

  // held-out 4번째 스킬(과부화/lightningRicochet): 상태이상 중첩만큼 추가 피해가 들어간다
  commander.skillLoadouts.spiritArchmage = ["lightningRicochet"];
  const back = createAutoBattle("duneRaiders", "spiritarchmage-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  backPlayer.x = back.enemies[0].x - 5;
  backPlayer.y = back.enemies[0].y;
  selectPlayerTarget(back, back.enemies[0].id);
  assert.equal(issuePlayerAction(back, "skill1"), true); // lightningRicochet(과부화)
  assert.equal(Boolean(back.enemies[0].statuses?.stun), true);
  const baselineDamage = back.enemies[0].maxHp - back.enemies[0].hp;

  const back2 = createAutoBattle("duneRaiders", "spiritarchmage-back2", "field", STARTING_PARTY, {}, { commander });
  const back2Player = back2.units.find((unit) => unit.controlled);
  back2Player.x = back2.enemies[0].x - 5;
  back2Player.y = back2.enemies[0].y;
  selectPlayerTarget(back2, back2.enemies[0].id);
  for (let i = 0; i < 4; i += 1) applyCombatStatus(back2, back2.enemies[0], "poison", back2Player, { stacks: 1 });
  assert.equal(issuePlayerAction(back2, "skill1"), true); // lightningRicochet(과부화), 상태이상 4중첩 상태
  const overloadDamage = back2.enemies[0].maxHp - back2.enemies[0].hp;
  assert.ok(overloadDamage > baselineDamage); // 상태이상 중첩이 있을 때 추가 피해가 더 들어간다
});

test("신성아크 전승은 스킬 4개+궁 1개가 모두 실행되고 성역 속박·성광 연쇄 아군 회복이 적용된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "holyArchmage";
  const front = createAutoBattle("duneRaiders", "holyarchmage-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  for (const unit of front.units) unit.hp = Math.round(unit.maxHp * 0.5);

  assert.equal(issuePlayerAction(front, "skill1"), true); // fireBolt(성스러운 화살) - 범위 신성 피해 + 자힐
  assert.equal(issuePlayerAction(front, "skill2"), true); // frostNova(정화의 파동) - 빙결 대신 지속 피해
  assert.equal(Boolean(front.enemies[0].statuses?.decay), true);
  assert.equal(Boolean(front.enemies[0].statuses?.frost), false);

  delete front.enemies[0].statuses.decay;
  const hpBeforeGravityWell = front.enemies[0].hp;
  assert.equal(issuePlayerAction(front, "skill3"), true); // gravityWell(성역) - 즉발 피해 대신 속박 + 지속 피해
  assert.equal(front.enemies[0].hp, hpBeforeGravityWell); // 즉시 피해는 없다
  assert.equal(front.enemies[0].rootedUntil > front.elapsed, true); // 속박
  assert.equal(Boolean(front.enemies[0].statuses?.decay), true); // 지속 피해

  assert.equal(issuePlayerAction(front, "ultimate"), true); // heavenlyJudgment(천벌)
  assert.equal(Boolean(player.positiveEffects?.shield), true);

  // held-out 4번째 스킬(성광 연쇄/lightningRicochet): 적 대신 아군을 회복·보호한다
  commander.skillLoadouts.holyArchmage = ["lightningRicochet"];
  const back = createAutoBattle("duneRaiders", "holyarchmage-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  backPlayer.x = back.enemies[0].x - 5;
  backPlayer.y = back.enemies[0].y;
  selectPlayerTarget(back, back.enemies[0].id);
  for (const unit of back.units) unit.hp = Math.round(unit.maxHp * 0.3);
  const enemyHpBefore = back.enemies[0].hp;
  assert.equal(issuePlayerAction(back, "skill1"), true); // lightningRicochet(성광 연쇄)
  assert.equal(back.enemies[0].hp, enemyHpBefore); // 적에게는 피해가 가지 않는다
  assert.equal(Boolean(backPlayer.positiveEffects?.shield), true); // 연쇄가 자신부터 아군을 회복·보호막
});

test("정령추적 전승은 스킬 4개+궁 1개가 모두 실행되고 속성 상태이상을 남긴다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "spiritTracker";
  const front = createAutoBattle("duneRaiders", "spirittracker-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // aimedShot(짜릿한 헤드샷) + 기절
  assert.equal(Boolean(front.enemies[0].statuses?.stun), true);
  assert.equal(issuePlayerAction(front, "skill2"), true); // scatterShot(화끈한 폭발화살) + 화상
  assert.equal(Boolean(front.enemies[0].statuses?.burn), true);
  assert.equal(issuePlayerAction(front, "skill3"), true); // shadowStrike(차가운 후퇴) + 빙결
  assert.equal(issuePlayerAction(front, "ultimate"), true); // arrowStorm(정령 일제 사격) + 상태이상

  commander.skillLoadouts.spiritTracker = ["vanish"];
  const back = createAutoBattle("duneRaiders", "spirittracker-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  assert.equal(issuePlayerAction(back, "skill1"), true); // vanish(빠른 은신) + 이속 증가
  assert.equal(Boolean(backPlayer.positiveEffects?.haste), true);
});

test("대궁병(중갑추적)은 관통·기절·넉백을 갖추고 저격 태세에서 화력이 강해진다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "heavyTracker";
  const front = createAutoBattle("duneRaiders", "heavytracker-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // aimedShot(관통샷)
  assert.equal(issuePlayerAction(front, "skill2"), true); // scatterShot(충격화살) + 기절
  assert.equal(Boolean(front.enemies[0].statuses?.stun), true);
  const enemy = front.enemies[0];
  const beforeX = enemy.x;
  const beforeY = enemy.y;
  assert.equal(issuePlayerAction(front, "skill3"), true); // shadowStrike(방어사격) + 넉백(후퇴 대신)
  assert.ok(enemy.x !== beforeX || enemy.y !== beforeY);
  assert.equal(issuePlayerAction(front, "ultimate"), true); // piercingShot

  commander.skillLoadouts.heavyTracker = ["vanish"];
  const back = createAutoBattle("duneRaiders", "heavytracker-back", "field", STARTING_PARTY, {}, { commander });
  const backPlayer = back.units.find((unit) => unit.controlled);
  assert.equal(issuePlayerAction(back, "skill1"), true); // vanish(저격) -> 은신 대신 저격 태세
  assert.equal(Boolean(backPlayer.positiveEffects?.siegeMode), true);
  assert.ok(backPlayer.positiveEffects.haste.speedMultiplier < 1);
  assert.ok(backPlayer.positiveEffects.haste.attackSpeedMultiplier < 1);
});

test("친화도·직업 전용 능력치와 출혈·화상·크루세이더 해제가 구분된다", () => {
  const crusaderCommander = createDefaultCommander();
  crusaderCommander.level = 5;
  const crusaderStats = playerCombatStats(crusaderCommander, "spiritCrusader");
  const necromancerCommander = createDefaultCommander();
  necromancerCommander.combatKitId = "heavyNecromancer";
  necromancerCommander.level = 5;
  const necromancerStats = playerCombatStats(necromancerCommander, "heavyNecromancer");
  assert.ok(crusaderStats.divineAffinity > crusaderStats.natureAffinity);
  assert.ok(necromancerStats.natureAffinity > necromancerStats.divineAffinity);
  assert.ok(crusaderStats.statusResistance > 0);
  assert.equal(necromancerStats.statusResistance, 0);
  assert.equal(crusaderStats.criticalChance, null);
  assert.equal(necromancerStats.criticalChance, null);

  const battle = createAutoBattle("duneRaiders", "status", "field", [], {}, { commander: crusaderCommander });
  const player = battle.units.find((unit) => unit.controlled);
  const enemy = battle.enemies[0];
  player.hp = Math.round(player.maxHp * 0.5);
  applyCombatStatus(battle, player, "poison", enemy, { stacks: 3 });
  assert.equal(player.statuses.poison.stacks, 3);
  assert.equal(issuePlayerAction(battle, "skill1"), true);
  assert.equal(player.statuses.poison, undefined);

  for (let index = 0; index < 6; index += 1) applyCombatStatus(battle, enemy, "bleed", player);
  applyCombatStatus(battle, enemy, "burn", player);
  applyCombatStatus(battle, enemy, "burn", player);
  assert.equal(enemy.statuses.bleed.stacks, STATUS_EFFECT_DEFS.bleed.maxStacks);
  assert.equal(enemy.statuses.burn.stacks, 1);
  assert.ok(enemy.statuses.bleed.expiresAt > enemy.statuses.burn.expiresAt);
  assert.ok(enemy.statuses.burn.tickDamage > enemy.statuses.bleed.tickDamage);
});

test("장착한 룬은 해당 스탯만 올리고 다른 룬 효과와는 섞이지 않는다", () => {
  const bare = createDefaultCommander();
  const bareStats = playerCombatStats(bare, bare.combatKitId);

  const withGreen = createDefaultCommander();
  withGreen.equippedRuneId = "greenRune";
  const greenStats = playerCombatStats(withGreen, withGreen.combatKitId);
  assert.ok(greenStats.damage > bareStats.damage);
  assert.equal(greenStats.armor, bareStats.armor);
  assert.equal(greenStats.maxHp, bareStats.maxHp);

  const withYellow = createDefaultCommander();
  withYellow.equippedRuneId = "yellowRune";
  const yellowStats = playerCombatStats(withYellow, withYellow.combatKitId);
  assert.ok(yellowStats.armor > bareStats.armor);
  assert.equal(yellowStats.damage, bareStats.damage);

  const withPurple = createDefaultCommander();
  withPurple.equippedRuneId = "purpleRune";
  const purpleStats = playerCombatStats(withPurple, withPurple.combatKitId);
  assert.ok(purpleStats.attackMs < bareStats.attackMs);
});

test("직업과 일치하는 무기는 보너스를 주지만, 다른 직업 무기는 무시된다", () => {
  const bare = createDefaultCommander(); // combatKitId 기본값 spiritCrusader -> baseClassId crusader
  const bareStats = playerCombatStats(bare, bare.combatKitId);

  const withOwnWeapon = createDefaultCommander();
  gearUp(withOwnWeapon, { weapon: "crusaderBastardSword" });
  const ownWeaponStats = playerCombatStats(withOwnWeapon, withOwnWeapon.combatKitId);
  assert.ok(ownWeaponStats.damage > bareStats.damage, "크루세이더가 크루세이더 무기를 들면 공격력이 오른다");
  assert.equal(ownWeaponStats.equippedWeaponId, "crusaderBastardSword");

  const withWrongWeapon = createDefaultCommander();
  gearUp(withWrongWeapon, { weapon: "barbarianGreataxe" }); // 바바리안 전용 무기
  const wrongWeaponStats = playerCombatStats(withWrongWeapon, withWrongWeapon.combatKitId);
  assert.equal(wrongWeaponStats.damage, bareStats.damage, "직업이 안 맞는 무기는 보너스가 적용되지 않는다");
  assert.equal(wrongWeaponStats.equippedWeaponId, null);

  const necroCommander = createDefaultCommander();
  gearUp(necroCommander, { weapon: "necromancerArmorSword" });
  const necroStats = playerCombatStats(necroCommander, "heavyNecromancer");
  const necroBareStats = playerCombatStats(createDefaultCommander(), "heavyNecromancer");
  assert.ok(necroStats.cooldownReduction > necroBareStats.cooldownReduction, "네크로맨서 무기는 스킬 재사용 대기시간을 줄인다");
  assert.equal(necroStats.cooldownMultiplier, 1 - necroStats.cooldownReduction);
});

test("보스는 예고 장판을 깔고, 예고 시간이 지나야 터진다", () => {
  const battle = createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 4242 });
  const boss = battle.enemies.find((enemy) => enemy.patterns?.length);
  assert.ok(boss, "빙맥 큰곰은 패턴을 가진 보스다");

  // 장판이 깔릴 때까지 진행
  let guard = 0;
  while (!battle.zones.length && guard++ < 200) tickAutoBattle(battle, 100);
  assert.equal(battle.zones.length, 1, "예고 장판이 깔린다");

  const zone = battle.zones[0];
  const pattern = BOSS_PATTERN_DEFS[zone.patternId];
  assert.equal(zone.fireAt - zone.bornAt, pattern.telegraphMs, "예고 시간만큼 떠 있는다");

  // 예고 중에는 아직 피해가 없다.
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  const hpBefore = player.hp;
  tickAutoBattle(battle, 100);
  assert.equal(player.hp, hpBefore, "예고만 떠 있는 동안에는 피해가 없다");

  // 시전 중에는 보스가 움직이지 않는다 — 예고와 본체 행동이 겹치면 안 된다.
  assert.ok(boss.castingUntil > battle.elapsed, "시전 중 상태가 유지된다");

  // 예고가 끝나면 터지고 사라진다.
  while (battle.zones.length && guard++ < 400) tickAutoBattle(battle, 100);
  assert.equal(battle.zones.length, 0, "터진 장판은 사라진다");
});

test("예고를 보고 걸어 나가면 장판을 피할 수 있다", () => {
  // 이 관계가 패턴 난이도의 기준이다: 예고 시간 × 이동속도 > 반경 이어야
  // "보고 피하는" 게 성립한다.
  const pattern = BOSS_PATTERN_DEFS.groundSlam;

  const run = (evade) => {
    const battle = createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 4242 });
    const player = battle.units.find((unit) => unit.id === battle.playerId);
    player.hp = player.maxHp = 9999; // 장판 피해만 보려고 죽지 않게 한다
    let hits = 0;
    for (let t = 0; t < 400 && battle.status === "active"; t += 1) {
      if (evade && battle.zones.length) steerBattlePlayer(battle, 1, 0);
      tickAutoBattle(battle, 100);
      hits += battle.log.filter((line) => /대지 강타: 개척자/.test(line.text || line)).length;
      battle.log = battle.log.filter((line) => !/대지 강타: 개척자/.test(line.text || line));
      player.hp = 9999;
    }
    return hits;
  };

  const reach = 17 * (pattern.telegraphMs / 1000);
  assert.ok(reach > pattern.radius,
    `예고 동안 이동 가능 거리(${reach.toFixed(1)})가 반경(${pattern.radius})보다 커야 피할 수 있다`);

  const still = run(false);
  const moving = run(true);
  assert.ok(still > 0, "가만히 서 있으면 맞는다");
  assert.ok(moving < still, `걸어 나가면 덜 맞아야 한다 (가만히 ${still} vs 이동 ${moving})`);
});

test("회피 버튼은 크루세이더만 방패 막기이고 나머지는 이동기다", () => {
  assert.equal(playerDodgeDefinition("spiritCrusader").type, "block");
  assert.equal(playerDodgeDefinition("heavyCrusader").type, "block");
  assert.equal(playerDodgeDefinition("heavyTracker").type, "dash");
  assert.equal(playerDodgeDefinition("archeryMaehwa").type, "dash");

  // 막기는 이동하지 않는 대신 더 많이 줄여준다 — 역할이 겹치지 않게.
  const block = PLAYER_DODGE_DEFS.block;
  const dash = PLAYER_DODGE_DEFS.dash;
  assert.ok(block.reduction > dash.reduction, "막기가 더 많이 줄여준다");
  assert.ok(!block.distance, "막기는 이동하지 않는다");
  assert.ok(dash.distance > 0, "이동기는 실제로 움직인다");

  const gearUpKit = (kitId) => {
    const commander = createDefaultCommander();
    commander.combatKitId = kitId;
    return createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 7, commander });
  };

  // 이동기는 실제로 위치를 바꾼다.
  const dashBattle = gearUpKit("heavyTracker");
  const dashPlayer = dashBattle.units.find((unit) => unit.id === dashBattle.playerId);
  steerBattlePlayer(dashBattle, 1, 0);
  const fromX = dashPlayer.x;
  issuePlayerAction(dashBattle, "dodge");
  assert.ok(dashPlayer.x > fromX, "회피 기동은 바라보는 방향으로 이동시킨다");

  // 막기는 위치를 바꾸지 않는다.
  const blockBattle = gearUpKit("spiritCrusader");
  const blockPlayer = blockBattle.units.find((unit) => unit.id === blockBattle.playerId);
  steerBattlePlayer(blockBattle, 1, 0);
  const blockX = blockPlayer.x;
  issuePlayerAction(blockBattle, "dodge");
  assert.equal(blockPlayer.x, blockX, "방패 막기는 제자리에서 버틴다");
});

test("모든 보스 패턴은 '보고 피할 수 있어야' 한다는 기준식을 지킨다", () => {
  // 예고 시간(초) × 플레이어 이동속도(17) > 벗어나야 하는 거리.
  // 이 부등식이 깨지면 아무리 잘 피해도 못 빠져나오는 패턴이 된다.
  const PLAYER_SPEED = 17;
  for (const pattern of Object.values(BOSS_PATTERN_DEFS)) {
    // 소환·정화는 바닥 판정이 없어 "피하는" 패턴이 아니다.
    if (pattern.kind === "summon" || pattern.kind === "cleanse") continue;
    const reach = PLAYER_SPEED * (pattern.telegraphMs / 1000);

    // "벗어나려면 최소 얼마를 가야 하는가"는 도형마다 다르다.
    let need;
    if (pattern.kind === "line") {
      // 직선은 폭의 절반만 옆으로 비키면 된다.
      need = pattern.width / 2;
    } else if (pattern.kind === "cone") {
      // 부채꼴은 밖으로 나가는 길이 두 가지다(옆으로 돌기 / 사거리 밖으로).
      // 최악의 위치는 두 경계에서 가장 먼 지점이고, 그 거리는 부채꼴에 내접하는
      // 가장 큰 원의 반지름과 같다: R·sinθ / (1 + sinθ).
      const half = (pattern.coneDegrees / 2) * Math.PI / 180;
      need = pattern.radius * Math.sin(half) / (1 + Math.sin(half));
    } else {
      need = pattern.radius;
    }

    assert.ok(reach > need,
      `${pattern.name}: 예고 동안 ${reach.toFixed(1)} 이동 가능한데 ${need.toFixed(1)}을 벗어나야 한다`);
  }
});

test("직선 돌진은 뒤로 도망치는 것보다 옆으로 비켜야 피해진다", () => {
  const battle = createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 4242 });
  const boss = battle.enemies.find((enemy) => enemy.patterns?.includes("chargeRush"));
  const player = battle.units.find((unit) => unit.id === battle.playerId);

  // 돌진만 나오게 다른 패턴을 잠가둔다.
  boss.patterns = ["chargeRush"];
  let guard = 0;
  while (!battle.zones.length && guard++ < 300) tickAutoBattle(battle, 100);
  const zone = battle.zones[0];
  assert.equal(zone.kind, "line", "돌진은 직선 장판이다");
  assert.ok(zone.x2 !== undefined && zone.y2 !== undefined, "끝점이 있다");

  // 띠는 보스에서 시작해 플레이어 방향으로 뻗는다.
  assert.ok(Math.abs(zone.x - boss.x) < 0.01 && Math.abs(zone.y - boss.y) < 0.01, "보스 위치에서 시작한다");
  const length = Math.hypot(zone.x2 - zone.x, zone.y2 - zone.y);
  assert.ok(Math.abs(length - BOSS_PATTERN_DEFS.chargeRush.length) < 0.5, "정의된 길이만큼 뻗는다");

  // 띠 위(중간 지점)는 맞고, 옆으로 폭의 절반 넘게 비키면 안 맞는다.
  const midX = (zone.x + zone.x2) / 2;
  const midY = (zone.y + zone.y2) / 2;
  const angle = Math.atan2(zone.y2 - zone.y, zone.x2 - zone.x);
  const sideX = midX + Math.cos(angle + Math.PI / 2) * (zone.width / 2 + 3);
  const sideY = midY + Math.sin(angle + Math.PI / 2) * (zone.width / 2 + 3);

  player.x = midX; player.y = midY;
  const hpOnLine = player.hp;
  while (battle.zones.length && guard++ < 400) tickAutoBattle(battle, 100);
  assert.ok(player.hp < hpOnLine, "띠 위에 서 있으면 맞는다");

  // 다시 한 번, 이번엔 옆으로 비켜서.
  boss.patternReadyAt.chargeRush = 0;
  while (!battle.zones.length && guard++ < 400) tickAutoBattle(battle, 100);
  const zone2 = battle.zones[0];
  const angle2 = Math.atan2(zone2.y2 - zone2.y, zone2.x2 - zone2.x);
  const mid2X = (zone2.x + zone2.x2) / 2;
  const mid2Y = (zone2.y + zone2.y2) / 2;
  player.x = mid2X + Math.cos(angle2 + Math.PI / 2) * (zone2.width / 2 + 6);
  player.y = mid2Y + Math.sin(angle2 + Math.PI / 2) * (zone2.width / 2 + 6);
  const hpAside = player.hp;
  let fired = false;
  while (battle.zones.length && guard++ < 500) {
    tickAutoBattle(battle, 100);
    fired = true;
    // 보스가 다시 조준하지 못하게 위치를 고정
    player.x = mid2X + Math.cos(angle2 + Math.PI / 2) * (zone2.width / 2 + 6);
    player.y = mid2Y + Math.sin(angle2 + Math.PI / 2) * (zone2.width / 2 + 6);
  }
  assert.ok(fired, "두 번째 돌진도 터졌다");
  assert.equal(player.hp, hpAside, "폭 밖으로 비키면 돌진에 맞지 않는다");
});

test("연속 장판은 시간차로 여러 개가 깔린다", () => {
  const battle = createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 4242 });
  const boss = battle.enemies.find((enemy) => enemy.patterns?.length);
  boss.patterns = ["frostVolley"];

  let guard = 0;
  while (!battle.zones.length && guard++ < 300) tickAutoBattle(battle, 100);
  const pattern = BOSS_PATTERN_DEFS.frostVolley;
  assert.equal(battle.zones.length, pattern.volleyCount, "한 번 시전에 여러 발이 예약된다");

  // 각 발은 시간차를 두고 깔린다.
  const bornTimes = battle.zones.map((zone) => zone.bornAt).sort((a, b) => a - b);
  for (let i = 1; i < bornTimes.length; i += 1) {
    assert.equal(bornTimes[i] - bornTimes[i - 1], pattern.volleyIntervalMs, "간격이 일정하다");
  }
  // 시전 시간은 마지막 발이 터질 때까지 이어진다.
  assert.ok(boss.castingUntil >= battle.elapsed + (pattern.volleyCount - 1) * pattern.volleyIntervalMs);
});

test("필드 보스는 HP 50%에서 패턴이 추가되고, 지역 보스는 교체되며 형태가 바뀐다", () => {
  const drive = (encounterId) => {
    const battle = createAutoBattle(encounterId, null, null, ["shieldGuard", "archer"], {}, { rollSeed: 55 });
    const boss = battle.enemies.find((enemy) => enemy.patterns?.length);
    const first = [...boss.patterns];
    const player = battle.units.find((unit) => unit.id === battle.playerId);
    player.hp = player.maxHp = 99999;
    boss.hp = Math.floor(boss.maxHp * 0.4);
    for (let i = 0; i < 60 && boss.phase === 1; i += 1) {
      tickAutoBattle(battle, 100);
      player.hp = 99999;
      boss.hp = Math.floor(boss.maxHp * 0.4);
    }
    return { boss, first, battle };
  };

  const field = drive("frostColossusPack");
  assert.equal(field.boss.phase, 2, "HP 50% 아래에서 2페이즈로 넘어간다");
  assert.equal(field.boss.phaseMode, "extend");
  for (const id of field.first) {
    assert.ok(field.boss.patterns.includes(id), "필드 보스는 기존 패턴을 유지한다");
  }
  assert.ok(field.boss.patterns.length > field.first.length, "새 패턴이 추가된다");
  assert.equal(field.boss.form, null, "필드 보스는 형태가 그대로다");

  const region = drive("frostTitanLair");
  assert.equal(region.boss.phase, 2);
  assert.equal(region.boss.phaseMode, "replace");
  for (const id of region.first) {
    assert.ok(!region.boss.patterns.includes(id), "지역 보스는 기존 패턴이 사라진다");
  }
  assert.ok(region.boss.form, "지역 보스는 형태가 바뀐다");
});

test("필드 보스는 부산물을 확률이 아니라 확정으로 준다", () => {
  // 완제품을 낮은 확률로 떨구는 대신 부산물을 확정 지급하고 고정 조합표로
  // 가공하는 구조다(docs/EQUIPMENT_DESIGN.md §5).
  const bear = ENEMY_COMBATANTS.northBear;
  assert.ok(bear.byproducts, "설원 거대 곰은 부산물을 가진다");
  assert.deepEqual(Object.keys(bear.byproducts).sort(), ["bearHide", "bearSinew"]);
  for (const materialId of Object.keys(bear.byproducts)) {
    assert.ok(MATERIAL_DEFS[materialId], `${materialId}가 재료로 정의돼 있어야 한다`);
  }

  // 지역 보스도 부산물을 준다.
  assert.ok(ENEMY_COMBATANTS.northTitan.byproducts);
});

test("부채꼴은 정면만 맞고 뒤쪽은 맞지 않는다", () => {
  // 이 방향 판정이 없으면 부채꼴이 전방향으로 맞아 원형 장판과 똑같아진다.
  const setup = () => {
    const battle = createAutoBattle("southSpawnLair", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 33 });
    const boss = battle.enemies.find((enemy) => enemy.patterns?.includes("tentacleLash"));
    const player = battle.units.find((unit) => unit.id === battle.playerId);
    player.hp = player.maxHp = 99999;
    boss.patterns = ["tentacleLash"];
    let guard = 0;
    while (!battle.zones.length && guard++ < 300) tickAutoBattle(battle, 100);
    return { battle, player, zone: battle.zones[0] };
  };

  const front = setup();
  assert.equal(front.zone.kind, "cone");
  front.player.x = front.zone.x + Math.cos(front.zone.angle) * 20;
  front.player.y = front.zone.y + Math.sin(front.zone.angle) * 20;
  const frontDistance = Math.hypot(front.player.x - front.zone.x, front.player.y - front.zone.y);
  let guard = 0;
  while (front.battle.zones.length && guard++ < 400) tickAutoBattle(front.battle, 100);
  assert.ok(front.battle.log.some((line) => /촉수 후리기: 개척자/.test(line.text || line)), "정면은 맞는다");
  // 끌어당김: 맞은 뒤 시전자 쪽으로 당겨진다.
  const pulled = Math.hypot(front.player.x - front.zone.x, front.player.y - front.zone.y);
  assert.ok(pulled < frontDistance - 5, `끌어당겨져야 한다 (${frontDistance.toFixed(1)} -> ${pulled.toFixed(1)})`);

  const back = setup();
  back.player.x = back.zone.x + Math.cos(back.zone.angle + Math.PI) * 20;
  back.player.y = back.zone.y + Math.sin(back.zone.angle + Math.PI) * 20;
  guard = 0;
  while (back.battle.zones.length && guard++ < 400) tickAutoBattle(back.battle, 100);
  assert.ok(!back.battle.log.some((line) => /촉수 후리기: 개척자/.test(line.text || line)), "뒤쪽은 맞지 않는다");
});

test("잔류 패턴은 터진 자리에 지속 피해 구역을 남긴다", () => {
  const battle = createAutoBattle("southSpiderLair", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 33 });
  const boss = battle.enemies.find((enemy) => enemy.patterns?.includes("webTrap"));
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  player.hp = player.maxHp = 99999;
  boss.patterns = ["webTrap"];

  let guard = 0;
  while (!battle.zones.length && guard++ < 300) tickAutoBattle(battle, 100);
  assert.ok(battle.zones[0].linger, "잔류 정보가 장판에 실려 있다");

  const before = battle.groundEffects.length;
  while (battle.zones.length && guard++ < 400) tickAutoBattle(battle, 100);
  assert.ok(battle.groundEffects.length > before, "터진 자리에 장판이 남는다");

  const effect = battle.groundEffects[battle.groundEffects.length - 1];
  assert.equal(effect.team, "enemy", "적이 남긴 장판이라 아군이 밟으면 아프다");
  assert.ok(effect.endsAt > battle.elapsed, "지속 시간이 남아 있다");

  // 장판 위에 서 있으면 실제로 아프다.
  player.x = effect.x;
  player.y = effect.y;
  player.hp = 500;
  const hpBefore = player.hp;
  for (let i = 0; i < 20 && battle.groundEffects.length; i += 1) tickAutoBattle(battle, 100);
  assert.ok(player.hp < hpBefore, "잔류 장판 위에 있으면 피해를 받는다");

  // 시간이 지나면 사라진다.
  for (let i = 0; i < 120 && battle.groundEffects.length; i += 1) tickAutoBattle(battle, 100);
  assert.equal(battle.groundEffects.length, 0, "지속 시간이 끝나면 사라진다");
});

test("필드 보스는 지역마다 정의돼 있고 부산물이 모두 실재하는 재료다", () => {
  const bossEncounters = Object.entries(ENCOUNTER_DEFS).filter(([, encounter]) => encounter.boss);
  assert.ok(bossEncounters.length >= 15, "보스 조우가 충분히 정의돼 있다");

  for (const [, encounter] of bossEncounters) {
    for (const enemyId of encounter.enemies) {
      const definition = ENEMY_COMBATANTS[enemyId];
      assert.ok(definition, `${enemyId} 정의가 있어야 한다`);
      if (!definition.byproducts) continue;
      for (const materialId of Object.keys(definition.byproducts)) {
        assert.ok(MATERIAL_DEFS[materialId], `${enemyId}의 부산물 ${materialId}가 재료로 정의돼야 한다`);
      }
    }
  }

  // 모든 보스가 패턴을 가진다 — 패턴 없는 보스는 그냥 체력 높은 잡몹이다.
  for (const [id, encounter] of bossEncounters) {
    const hasPattern = encounter.enemies.some((enemyId) => ENEMY_COMBATANTS[enemyId]?.patterns?.length);
    assert.ok(hasPattern, `${id}에 패턴을 가진 보스가 있어야 한다`);
  }

  // 필드 보스 풀이 참조하는 조우가 실재해야 한다.
  for (const region of Object.values(WORLD_REGION_DEFS)) {
    for (const encounterId of region.fieldBossPool || []) {
      assert.ok(ENCOUNTER_DEFS[encounterId], `${encounterId} 조우가 정의돼야 한다`);
    }
  }
});

test("전설 조합표는 전부 실제 보스 부산물로 만들어진다", () => {
  // 전설 방어구·장신구는 지역 드랍이 아니라 보스 부산물 조합이다(§5).
  const byproducts = new Set();
  for (const enemy of Object.values(ENEMY_COMBATANTS)) {
    for (const materialId of Object.keys(enemy.byproducts || {})) byproducts.add(materialId);
  }

  const bossGear = Object.values(LEGENDARY_DEFS).filter((entry) => !entry.regionId);
  assert.ok(bossGear.length >= 14, "방어구 6 + 반지 6 + 목걸이 2");

  for (const entry of bossGear) {
    assert.ok(Object.keys(entry.materials).length >= 2, `${entry.id}는 여러 재료를 조합한다`);
    for (const materialId of Object.keys(entry.materials)) {
      assert.ok(MATERIAL_DEFS[materialId], `${entry.id}의 재료 ${materialId}가 정의돼야 한다`);
      assert.ok(byproducts.has(materialId),
        `${entry.id}의 재료 ${materialId}는 어떤 보스에서든 나와야 한다(못 만드는 레시피 방지)`);
    }
  }

  // 계열별 구성이 문서(§10)와 맞는다.
  const armor = bossGear.filter((entry) => entry.armorClass);
  const byClass = {};
  for (const entry of armor) byClass[entry.armorClass] = (byClass[entry.armorClass] || 0) + 1;
  assert.deepEqual(byClass, { heavy: 2, light: 2, cloth: 2 }, "중갑2·경갑2·천2");

  const rings = bossGear.filter((entry) => entry.slot === "ring");
  const necklaces = bossGear.filter((entry) => entry.slot === "necklace");
  assert.ok(rings.length >= 6, "반지 6종");
  assert.ok(necklaces.length >= 2, "목걸이 2종(3종째는 문서상 미정)");
});

test("전설 고유효과는 장착했을 때만 전투에 반영된다", () => {
  const equip = (defId) => {
    const commander = createDefaultCommander();
    if (!defId) return commander;
    commander.equipmentOwned = [{ uid: "g0", defId, grade: "common", options: [] }];
    const definition = EQUIPMENT_DEFS[defId];
    const slot = { chest: "chest", ring: "ring1", necklace: "necklace" }[definition.slot];
    commander.equipped[slot] = "g0";
    return commander;
  };

  // 맨몸에는 고유효과가 없다.
  const bare = createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 4242, commander: equip(null) });
  assert.deepEqual(Object.keys(bare.legendary), [], "장착 없으면 고유효과도 없다");

  // 장착하면 전투 시작 시 풀려서 등록된다.
  for (const [defId, type] of [
    ["dragonRampart", "damageBand"],
    ["arcaneVeil", "manaShieldGear"],
    ["phantomLeather", "phantomDodge"],
    ["oniBreakerRing", "armorPierce"],
    ["dragonWardRing", "lastStand"]
  ]) {
    const battle = createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 4242, commander: equip(defId) });
    assert.ok(battle.legendary[type], `${defId} 장착 시 ${type}가 등록된다`);
  }
});

test("환영 경갑은 피격 자체를 확률로 무효화한다", () => {
  const commander = createDefaultCommander();
  commander.equipmentOwned = [{ uid: "g0", defId: "phantomLeather", grade: "common", options: [] }];
  commander.equipped.chest = "g0";

  const measure = (withGear) => {
    const battle = createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {},
      { rollSeed: 4242, commander: withGear ? commander : createDefaultCommander() });
    const player = battle.units.find((unit) => unit.id === battle.playerId);
    player.maxHp = player.hp = 9999;
    let dodges = 0;
    for (let t = 0; t < 500; t += 1) {
      tickAutoBattle(battle, 100);
      dodges += battle.log.filter((line) => /회피했다/.test(line.text || line)).length;
      battle.log = [];
      player.hp = 9999;
    }
    return dodges;
  };

  assert.equal(measure(false), 0, "맨몸은 회피가 없다");
  assert.ok(measure(true) > 0, "환영 경갑을 입으면 실제로 회피가 발동한다");
});

test("마도사의 장막은 피해를 체력 대신 마나로 치른다", () => {
  const commander = createDefaultCommander();
  commander.equipmentOwned = [{ uid: "g0", defId: "arcaneVeil", grade: "common", options: [] }];
  commander.equipped.chest = "g0";

  const battle = createAutoBattle("frostColossusPack", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 4242, commander });
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  player.maxHp = 200; player.hp = 200;
  player.maxMana = 200; player.mana = 200;

  let taken = 0;
  for (let t = 0; t < 300 && battle.status === "active"; t += 1) {
    const before = player.hp;
    tickAutoBattle(battle, 100);
    if (player.hp < before) taken += before - player.hp;
    player.hp = 200;
  }
  assert.ok(taken > 0, "피해는 받는다");
  assert.ok(player.mana < 200, "마나가 실제로 소모된다(피해를 마나로 대신 치렀다)");
});

test("동부는 매화를, 북부는 아크메이지를 카운터하는 환경 효과를 가진다", () => {
  // 몬스터 컨셉.txt의 지역별 카운터를 환경에도 일관되게 건다.
  const north = WORLD_REGION_DEFS.north.hazard.counterEffect;
  assert.equal(north.type, "manaDrain", "북부는 마나 고갈(아크메이지 카운터)");

  const east = WORLD_REGION_DEFS.east.hazard.counterEffect;
  assert.equal(east.type, "statusDecay", "동부는 상태이상 감쇠(매화 카운터)");

  // 마나 고갈은 마나가 많은 직업일수록 크게 잃는다.
  assert.ok(PLAYER_BASE_CLASS_DEFS.archmage.statProfile.base.maxMana
    > PLAYER_BASE_CLASS_DEFS.maehwa.statProfile.base.maxMana * 3,
    "아크메이지가 매화보다 마나 의존도가 훨씬 높다");
});

test("구미호는 걸어둔 상태이상을 스스로 씻어낸다", () => {
  // 동부 카운터 컨셉의 핵심 - 상태이상 축적형(매화)의 주력을 무력화한다.
  const battle = createAutoBattle("eastFoxLair", null, null, ["shieldGuard", "archer"], {}, { rollSeed: 21 });
  const fox = battle.enemies.find((enemy) => enemy.patterns?.includes("spiritCleanse"));
  assert.ok(fox, "구미호는 정화 패턴을 가진다");

  const player = battle.units.find((unit) => unit.id === battle.playerId);
  player.maxHp = player.hp = 99999;

  let cleansed = 0;
  for (let t = 0; t < 500; t += 1) {
    // 계속 상태이상을 걸어준다.
    fox.statuses = { ...fox.statuses, burn: { id: "burn", expiresAt: battle.elapsed + 9000, stacks: 1 } };
    tickAutoBattle(battle, 100);
    cleansed += battle.log.filter((line) => /정화: /.test(line.text || line)).length;
    battle.log = [];
    player.hp = 99999;
  }
  assert.ok(cleansed > 0, "정화가 실제로 발동한다");
});

test("던전 보상은 확률이 아니라 클리어 회차에 따른 확정 지급이다", () => {
  // 서부는 크루세이더·네크로맨서 두 직업의 출신지다.
  const first = dungeonClearRewards("west", 1, []);
  assert.deepEqual(first, ["crusaderBastardSword"], "1회차는 무기 설계도");

  const second = dungeonClearRewards("west", 2, ["crusaderBastardSword"]);
  const westSet = ARMOR_SET_DEFS[REGION_ARMOR_SET.west];
  assert.deepEqual(second, westSet.pieces, "2회차는 방어구 세트 전체(방어구+장신구)");
  assert.equal(second.length, 2, "세트 설계도 하나로 두 조각이 함께 해금된다");

  const third = dungeonClearRewards("west", 3, ["crusaderBastardSword", ...westSet.pieces]);
  assert.deepEqual(third, ["necromancerArmorSword"], "3회차는 두 번째 직업 무기");

  // 다 받은 뒤에는 더 나오지 않는다(무한 반복해도 중복이 안 쌓인다).
  const exhausted = dungeonClearRewards("west", 4,
    ["crusaderBastardSword", "necromancerArmorSword", ...westSet.pieces]);
  assert.deepEqual(exhausted, [], "전부 습득 후에는 설계도 보상 없음");

  // 지역마다 나오는 방어구 세트가 다르다.
  const centralSecond = dungeonClearRewards("central", 2, []);
  assert.notDeepEqual(centralSecond, westSet.pieces, "중부는 서부와 다른 세트를 준다");
});

test("전설 설계도는 일반 설계도를 다 받은 뒤 높은 회차에서만 나온다", () => {
  const westSet = ARMOR_SET_DEFS[REGION_ARMOR_SET.west];
  const allNormal = ["crusaderBastardSword", "necromancerArmorSword", ...westSet.pieces];

  // 요구 회차 전에는 다 받았어도 전설이 나오지 않는다.
  for (let clear = 1; clear < LEGENDARY_CLEAR_REQUIREMENT; clear++) {
    const rewards = dungeonClearRewards("west", clear, allNormal);
    assert.ok(
      rewards.every((id) => !EQUIPMENT_DEFS[id]?.legendary),
      `${clear}회차에는 전설이 나오면 안 된다`
    );
  }

  const westLegendaries = legendariesForRegion("west").map((entry) => entry.id);
  assert.equal(westLegendaries.length, 2, "서부는 두 직업 출신지라 전설도 둘이다");

  // 한 번에 하나씩만 준다 — 둘 다 모으려면 더 돌아야 한다.
  const fifth = dungeonClearRewards("west", LEGENDARY_CLEAR_REQUIREMENT, allNormal);
  assert.equal(fifth.length, 1, "전설은 한 번에 하나만");
  assert.ok(westLegendaries.includes(fifth[0]));

  const sixth = dungeonClearRewards("west", LEGENDARY_CLEAR_REQUIREMENT + 1, [...allNormal, fifth[0]]);
  assert.equal(sixth.length, 1);
  assert.notEqual(sixth[0], fifth[0], "이미 받은 전설은 다시 나오지 않는다");

  const done = dungeonClearRewards("west", 99, [...allNormal, ...westLegendaries]);
  assert.deepEqual(done, [], "전설까지 다 모으면 설계도 보상이 끝난다");

  // 다른 지역의 전설은 이 지역에서 나오지 않는다(지역색 유지).
  assert.ok(!westLegendaries.includes("moya"), "동부 전설이 서부에서 나오면 안 된다");
});

test("전설 장비는 지역별로 흩어져 있고 컬렉션 진행도로 집계된다", () => {
  // 전설은 두 갈래다:
  // - 지역 전설(regionId 있음): 지역 던전을 반복 클리어해 설계도를 얻는다
  // - 보스 전설(regionId 없음): 필드 보스 부산물을 고정 조합표로 만든다(§5·§10·§11)
  const all = Object.values(LEGENDARY_DEFS);
  const regional = all.filter((entry) => entry.regionId);
  const bossCrafted = all.filter((entry) => !entry.regionId);
  const regions = new Set(regional.map((entry) => entry.regionId));
  assert.equal(regions.size, 5, "다섯 지역 전부에 지역 전설이 하나 이상 있다");
  assert.ok(bossCrafted.length >= 10, "보스 부산물 전설도 충분히 있다");

  // 보스 전설은 수치가 아니라 고유효과가 존재 이유다.
  for (const entry of bossCrafted) {
    assert.ok(entry.uniqueEffect || Object.keys(entry.bonus || {}).length >= 2,
      `${entry.id}는 고유효과나 복합 보너스 중 하나는 있어야 한다`);
  }

  // 전부 EQUIPMENT_DEFS에 합쳐져 있어야 제작·장착이 일반 장비와 같은 경로로 돈다.
  for (const entry of all) {
    assert.equal(EQUIPMENT_DEFS[entry.id], entry, `${entry.id}가 장비 목록에 등록돼야 한다`);
    assert.ok(entry.materials && Object.keys(entry.materials).length, "제작 재료가 있다");
  }

  // 컬렉션은 "제작해서 보유한" 것만 센다 — 설계도만 받은 건 아직 모은 게 아니다.
  const blueprintOnly = { unlockedBlueprints: all.map((entry) => entry.id), equipmentOwned: [] };
  assert.equal(legendaryCollection(blueprintOnly).collectedCount, 0, "설계도만으로는 0");

  const partial = legendaryCollection({ equipmentOwned: ["moya","durandal","notLegendary"].map((defId, i) => ({ uid: "eq"+i, defId, grade: "common", options: [] })) });
  assert.equal(partial.collectedCount, 2, "전설이 아닌 장비는 세지 않는다");
  assert.equal(partial.total, all.length);
  assert.equal(partial.complete, false);

  const full = legendaryCollection({ equipmentOwned: all.map((entry, i) => ({ uid: "eq"+i, defId: entry.id, grade: "common", options: [] })) });
  assert.equal(full.complete, true);
});

test("전설 장비는 수치가 아니라 보너스 '조합'으로 차별화된다", () => {
  // 사용자 제약: 선택·수집으로 인한 성능 차이는 크게 나지 않게.
  // 그래서 전설은 개별 수치를 크게 올리는 대신, 일반 장비가 주지 않는
  // 두 종류 이상의 보너스를 함께 준다.
  // 고유효과가 없는 전설(지역 무기)만 대상이다 — 보스 전설은 수치가 아니라
  // 고유효과로 차별화되므로 보너스가 하나여도 된다.
  for (const entry of Object.values(LEGENDARY_DEFS).filter((item) => !item.uniqueEffect)) {
    const kinds = Object.keys(entry.bonus || {});
    assert.ok(kinds.length >= 2, `${entry.id}는 두 가지 이상의 보너스를 함께 준다`);

    for (const [key, value] of Object.entries(entry.bonus)) {
      // manaRegenBonus만 비율이 아닌 절대값이라 상한이 다르다.
      const cap = key === "manaRegenBonus" ? 1 : 0.12;
      assert.ok(value <= cap, `${entry.id}.${key}=${value}가 상한 ${cap}을 넘는다`);
    }
  }

  // 전설 무기도 직업 제한을 그대로 받는다(직업군 차별을 만들지 않기 위해,
  // 여섯 직업 각각에 하나씩 있고 장신구 하나만 공용이다).
  const weapons = Object.values(LEGENDARY_DEFS).filter((entry) => entry.slot === "weapon");
  const classIds = weapons.map((entry) => entry.baseClassId);
  assert.equal(new Set(classIds).size, weapons.length, "한 직업이 전설 무기를 둘 갖지 않는다");
  for (const classId of classIds) {
    assert.ok(PLAYER_BASE_CLASS_DEFS[classId], `${classId}는 실제 기본 직업이어야 한다`);
  }
  assert.equal(
    new Set(Object.keys(PLAYER_BASE_CLASS_DEFS)).size, weapons.length,
    "모든 기본 직업이 전설 무기를 하나씩 갖는다"
  );
});

test("던전 상자는 보스를 쓰러뜨리기 전에는 잠겨 있다", () => {
  const dungeon = createDungeon(4242, "west", null);
  const chest = Object.values(dungeon.features).find((entry) => entry.type === "treasure");
  assert.ok(chest, "던전에는 보물 상자가 하나 있다");
  assert.equal(chest.opened, false);

  const run = createRegionRun("west", 4242, STARTING_PARTY, {}, { unlockedBlueprints: [] });
  run.dungeon = dungeon;
  run.location = "dungeon";
  run.player = { ...dungeon.start };

  // 보스를 안 잡은 상태에서는 상자가 열리지 않는다.
  const chestKey = Object.entries(dungeon.features).find(([, entry]) => entry.type === "treasure")[0];
  const [chestX, chestY] = chestKey.split(",").map(Number);
  run.player = { x: chestX, y: chestY - 1 };
  const locked = moveRunPlayer(run, chestX, chestY);
  assert.equal(locked.type, "treasureLocked");
  assert.equal(chest.opened, false);

  // 보스를 잡은 뒤에는 열린다.
  Object.values(dungeon.features).find((entry) => entry.boss).cleared = true;
  run.player = { x: chestX, y: chestY - 1 };
  const opened = moveRunPlayer(run, chestX, chestY);
  assert.equal(opened.type, "treasure");
  assert.equal(chest.opened, true);
});

test("독은 출혈과 달리 중첩당 이동 속도를 늦춘다", () => {
  const commander = createDefaultCommander();
  const clean = createAutoBattle("duneRaiders", "clean", "field", [], {}, { commander });
  const poisoned = createAutoBattle("duneRaiders", "poisoned", "field", [], {}, { commander });
  const cleanPlayer = clean.units.find((unit) => unit.controlled);
  const poisonedPlayer = poisoned.units.find((unit) => unit.controlled);
  const enemy = poisoned.enemies[0];
  applyCombatStatus(poisoned, poisonedPlayer, "poison", enemy, { stacks: 5 });
  steerBattlePlayer(clean, 1, 0);
  steerBattlePlayer(poisoned, 1, 0);
  tickAutoBattle(clean, 200);
  tickAutoBattle(poisoned, 200);
  const cleanDistance = cleanPlayer.x - 27;
  const poisonedDistance = poisonedPlayer.x - 27;
  assert.ok(poisonedDistance > 0);
  assert.ok(poisonedDistance < cleanDistance);
});

test("무장 부활은 현재 전투의 일반 시체를 최대 3기까지만 재사용한다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "heavyNecromancer";
  const battle = createAutoBattle("duneRaiders", "corpse-cap", "field", [], {}, { commander, enemyCopies: 2 });
  for (const enemy of battle.enemies.slice(0, 4)) enemy.hp = 0;
  assert.equal(issuePlayerAction(battle, "skill2"), true);
  assert.equal(battle.units.filter((unit) => unit.summonType === "raisedDead").length, 3);
  battle.playerReadyAt.skill2 = 0;
  assert.equal(issuePlayerAction(battle, "skill2"), false);
  assert.equal(battle.enemies.filter((enemy) => enemy.hp <= 0).length, 1);
});

test("네 성문을 순회 방어하고 잔당 소탕까지 마쳐야 수성전이 정산된다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.estateDefense.threat = 65;
  engine.state.estateDefense.pending = { regionId: "central", encounterId: "duneRaiders", title: "시험 방어전", description: "대상단 습격" };
  for (const unitId of ["glass_alchemist", "caravan_guide", "winter_berserker"]) {
    engine.state.adventure.roster.push(unitId);
    engine.state.adventure.unitProgress[unitId] = { level: 2, xp: 0, secondaryId: null };
    assert.equal(engine.assignDefenseRemnantUnit(unitId), true);
  }
  assert.equal(engine.startEstateDefense(), true);
  assert.equal(engine.state.estateDefense.campaign.phase, "gates");
  for (const gateId of ["north", "east", "south", "west"]) {
    assert.equal(engine.enterEstateDefenseGate(gateId), true);
    for (const enemy of engine.state.estateDefense.battle.enemies) enemy.hp = 0;
    engine.advanceEstateDefense(120);
    assert.equal(engine.state.estateDefense.result.type, "gateHeld");
    assert.equal(engine.resolveEstateDefense(), true);
  }
  assert.equal(engine.state.estateDefense.campaign.phase, "remnants");
  assert.equal(engine.resolveEstateRemnants(), true);
  assert.equal(engine.state.estateDefense.campaign.finalResult.success, true);
  assert.equal(engine.finishEstateDefenseCampaign(), true);
  assert.equal(engine.state.estateDefense.pending, null);
  assert.ok(engine.state.estateDefense.threat < 65);
});

test("미지원 성문이 무너지면 내부전장으로 전환된다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.estateDefense.pending = { regionId: "central", encounterId: "duneRaiders", title: "동시 습격", description: "네 성문 공격" };
  assert.equal(engine.startEstateDefense(), true);
  assert.equal(engine.enterEstateDefenseGate("north"), true);
  engine.advanceEstateGatePressure(30000);
  assert.equal(engine.state.estateDefense.result.type, "gateBreach");
  assert.ok(engine.state.estateDefense.campaign.breachedGateId);
  assert.equal(engine.resolveEstateDefense(), true);
  assert.equal(engine.state.estateDefense.campaign.phase, "inner");
  assert.equal(engine.state.estateDefense.battle.sourceZone, "defense-inner");
});

test("고정 수비대는 성문 사이를 재배치하고 기동대가 돌아오면 이전 전투를 이어간다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.estateDefense.pending = { regionId: "central", encounterId: "duneRaiders", title: "성문 전환 시험", description: "분산 공격" };
  for (const unitId of ["glass_alchemist", "caravan_guide"]) {
    engine.state.adventure.roster.push(unitId);
    engine.state.adventure.unitProgress[unitId] = { level: 2, xp: 0, secondaryId: null };
  }
  assert.equal(engine.assignDefenseGateUnit("glass_alchemist", "north"), true);
  assert.equal(engine.assignDefenseGateUnit("glass_alchemist", "east"), true);
  assert.deepEqual(engine.state.estateDefense.deployments.gates.north, []);
  assert.deepEqual(engine.state.estateDefense.deployments.gates.east, ["glass_alchemist"]);
  assert.equal(engine.assignDefenseRemnantUnit("glass_alchemist"), true);

  assert.equal(engine.startEstateDefense(), true);
  assert.equal(engine.enterEstateDefenseGate("north"), true);
  const northBattle = engine.state.estateDefense.battle;
  northBattle.enemies[0].hp -= 7;
  assert.equal(engine.enterEstateDefenseGate("east"), true);
  engine.advanceEstateGatePressure(1000);
  assert.ok(engine.state.estateDefense.campaign.gates.south.durability < 100);
  assert.equal(engine.enterEstateDefenseGate("north"), true);
  assert.equal(engine.state.estateDefense.battle, northBattle);
  assert.equal(engine.state.estateDefense.battle.enemies[0].hp, northBattle.enemies[0].hp);
});

test("광역 필드 전투는 넓은 경계를 쓰고 몬스터를 여러 무리로 흩어 잠재운다", () => {
  const battle = createFieldBattle("north", STARTING_PARTY, {}, { seed: 4242, groupCount: 3 });
  assert.ok(battle, "필드 전투가 생성된다");
  assert.equal(battle.fieldMode, true);

  // 기존 조우 아레나보다 실제로 훨씬 넓다.
  assert.equal(battle.bounds.maxX, FIELD_BOUNDS.maxX);
  assert.ok(battle.bounds.maxX > ARENA_BOUNDS.maxX * 3);

  // 모든 적이 처음엔 잠들어 있고, 무리가 여럿으로 나뉜다.
  assert.ok(battle.enemies.length >= 3);
  assert.ok(battle.enemies.every((enemy) => enemy.dormant === true), "처음엔 전부 비활성");
  const groups = new Set(battle.enemies.map((enemy) => enemy.groupIndex));
  // 일반 무리 3개 + 필드 보스 무리 1개. 보스는 별도 무리라 지나칠 수 있다.
  assert.equal(groups.size, 4, "일반 3개 무리 + 필드 보스 무리");

  const fieldBosses = battle.enemies.filter((enemy) => enemy.fieldBoss);
  assert.ok(fieldBosses.length, "필드 어딘가에 보스가 있다");
  assert.equal(new Set(fieldBosses.map((enemy) => enemy.groupIndex)).size, 1, "보스는 한 무리로 묶인다");
  assert.ok(fieldBosses.some((enemy) => enemy.patterns?.length), "필드 보스는 패턴을 가진다");

  // 보스 없이 시작할 수도 있어야 한다.
  const noBoss = createFieldBattle("north", STARTING_PARTY, {}, { seed: 4242, groupCount: 3, fieldBoss: false });
  assert.equal(noBoss.enemies.filter((enemy) => enemy.fieldBoss).length, 0);

  // 무리끼리 실제로 떨어져 있다(전부 한 곳에 뭉쳐 있지 않다).
  const xs = battle.enemies.map((enemy) => enemy.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 100, "무리들이 가로로 흩어져 있다");
});

test("필드 몬스터는 가까이 가야 무리 단위로 깨어나고, 멀리 있는 무리는 계속 잠들어 있다", () => {
  const battle = createFieldBattle("north", STARTING_PARTY, {}, { seed: 77, groupCount: 3 });
  const player = battle.units.find((unit) => unit.id === battle.playerId);

  tickAutoBattle(battle, 16);
  assert.ok(battle.enemies.every((enemy) => enemy.dormant), "시작 지점에서는 아무도 안 깨어난다");

  // 첫 무리 바로 옆으로 순간이동시킨다.
  const targetGroup = 0;
  const first = battle.enemies.find((enemy) => enemy.groupIndex === targetGroup);
  player.x = first.x;
  player.y = first.y;
  tickAutoBattle(battle, 16);

  const awakeGroups = new Set(battle.enemies.filter((enemy) => !enemy.dormant).map((enemy) => enemy.groupIndex));
  assert.ok(awakeGroups.has(targetGroup), "다가간 무리는 깨어난다");
  assert.equal(battle.enemies.filter((enemy) => enemy.groupIndex === targetGroup).every((enemy) => !enemy.dormant), true,
    "같은 무리는 한 마리가 아니라 전체가 함께 깨어난다");

  // 다른 무리 중 사거리 밖에 있는 적은 그대로 잠들어 있어야 한다.
  // (같은 무리는 멀리 있어도 함께 깨어나는 게 의도된 동작이라 무리 기준으로 걸러낸다.)
  const otherGroupFar = battle.enemies.filter((enemy) => enemy.groupIndex !== targetGroup
    && Math.hypot(enemy.x - player.x, enemy.y - player.y) > FIELD_AGGRO_RADIUS);
  assert.ok(otherGroupFar.length, "이 시드에서는 사거리 밖 다른 무리가 있어야 테스트가 의미 있다");
  assert.ok(otherGroupFar.every((enemy) => enemy.dormant), "사거리 밖 다른 무리는 계속 잠들어 있다");
});

test("던전 입구 트리거는 적을 정리해야 열리고, 밟으면 한 번만 발동한다", () => {
  const battle = createFieldBattle("north", STARTING_PARTY, {}, { seed: 909, groupCount: 2 });
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  const trigger = battle.triggers[0];
  assert.equal(trigger.type, "dungeonEntrance");

  // 적을 하나 깨워둔 채 입구에 서면 막힌다.
  battle.enemies[0].dormant = false;
  player.x = trigger.x;
  player.y = trigger.y;
  tickAutoBattle(battle, 16);
  assert.equal(battle.pendingTrigger, null, "교전 중에는 던전에 못 들어간다");
  assert.equal(battle.blockedTrigger, trigger.id);

  // 정리하면 열린다.
  for (const enemy of battle.enemies) enemy.hp = 0;
  battle.enemies[0].dormant = false;
  player.x = trigger.x;
  player.y = trigger.y;
  tickAutoBattle(battle, 16);
  const fired = consumeFieldTrigger(battle);
  assert.ok(fired, "적을 정리하면 던전 입구가 발동한다");
  assert.equal(fired.type, "dungeonEntrance");

  // 소비 후에는 다시 안 뜬다.
  assert.equal(consumeFieldTrigger(battle), null);
});

test("필드에는 장애물이 깔리고, 시작 지점과 던전 입구 주변은 비어 있다", () => {
  const battle = createFieldBattle("north", STARTING_PARTY, {}, { seed: 31337, groupCount: 3 });
  assert.ok(battle.obstacles.length > 0, "장애물이 실제로 생성된다");

  const player = battle.units.find((unit) => unit.id === battle.playerId);
  const trigger = battle.triggers[0];
  for (const obstacle of battle.obstacles) {
    assert.ok(Math.hypot(obstacle.x - player.x, obstacle.y - player.y) > obstacle.radius,
      "시작 지점이 바위 안에 박혀 있지 않다");
    assert.ok(Math.hypot(obstacle.x - trigger.x, obstacle.y - trigger.y) > obstacle.radius,
      "던전 입구가 바위로 막혀 있지 않다");
  }

  // 장애물끼리도 서로 겹치지 않는다.
  for (let i = 0; i < battle.obstacles.length; i += 1) {
    for (let j = i + 1; j < battle.obstacles.length; j += 1) {
      const a = battle.obstacles[i];
      const b = battle.obstacles[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius, "장애물끼리 겹치지 않는다");
    }
  }

  // 스폰된 적도 바위 안에 갇혀 있지 않다.
  for (const enemy of battle.enemies) {
    for (const obstacle of battle.obstacles) {
      assert.ok(Math.hypot(obstacle.x - enemy.x, obstacle.y - enemy.y) > obstacle.radius,
        "적이 바위 안에서 스폰되지 않는다");
    }
  }
});

test("장애물은 통과할 수 없고, 표면을 따라 밀려난다", () => {
  // 단독 함수 검증: 원 안으로 파고든 좌표는 가장자리로 밀려난다.
  const obstacles = [{ x: 100, y: 100, radius: 10 }];
  const pushed = resolveObstacles(obstacles, 100, 100 - 3, 0); // 중심 근처로 침투
  assert.ok(Math.hypot(pushed.x - 100, pushed.y - 100) >= 10 - 1e-9, "장애물 밖으로 밀려난다");

  // 장애물 밖의 좌표는 건드리지 않는다.
  const untouched = resolveObstacles(obstacles, 200, 200, 0);
  assert.deepEqual(untouched, { x: 200, y: 200 });

  // 실제 전투에서 바위를 향해 계속 걸어가도 안으로 못 들어간다.
  const battle = createFieldBattle("north", STARTING_PARTY, {}, { seed: 555, groupCount: 2 });
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  const rock = battle.obstacles[0];
  // 바위 왼쪽에 서서 바위 중심을 향해 이동 명령.
  player.x = rock.x - rock.radius - 6;
  player.y = rock.y;
  moveBattlePlayer(battle, rock.x, rock.y);
  for (let i = 0; i < 60; i += 1) tickAutoBattle(battle, 50);

  const gap = Math.hypot(player.x - rock.x, player.y - rock.y);
  assert.ok(gap >= rock.radius - 0.01, `바위를 통과하지 못한다 (거리 ${gap.toFixed(2)} >= 반지름 ${rock.radius.toFixed(2)})`);
});

test("광역 필드 런: 무리를 정리하고 던전 입구까지 걸어가면 화면 전환 없이 던전으로 이어진다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const run = createRegionRun("north", 2024, STARTING_PARTY, {}, engine.state.adventure.commander, {
    fieldBattle: true,
    groupCount: 2
  });
  assert.ok(run, "필드 전투 런이 만들어진다");
  assert.equal(run.fieldBattle, true);
  assert.equal(run.field, null, "격자 필드는 만들지 않는다");
  assert.ok(run.battle?.fieldMode, "런 시작부터 광역 전투가 활성 상태다");
  engine.state.adventure.run = run;

  const battle = run.battle;
  battle.awaitingPlayerStart = false;
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  const trigger = battle.triggers[0];

  // 아직 적이 남아 있으면 입구에 서 있어도 진입이 막힌다.
  player.x = trigger.x;
  player.y = trigger.y;
  battle.enemies[0].dormant = false;
  assert.equal(engine.advanceRealtimeBattle(16), "active");
  assert.equal(run.location, "field", "교전 중에는 던전으로 안 넘어간다");

  // 필드를 정리하면 전투가 끝나는 게 아니라 "정리됨" 상태가 된다.
  // (입구에서 떨어뜨려 놓고 확인 — 입구 위에 선 채로 틱을 돌리면 이 시점에
  //  트리거가 발동해버려서 "정리 직후 상태"를 관찰할 수 없다.)
  for (const enemy of battle.enemies) enemy.hp = 0;
  player.x = battle.bounds.minX + 20;
  player.y = trigger.y;
  engine.advanceRealtimeBattle(16);
  assert.equal(battle.fieldCleared, true, "필드 정리 표시");
  assert.equal(battle.status, "active", "필드를 비워도 전투가 종료되지 않는다");
  assert.equal(run.status, "active", "런도 계속 진행 중이다");

  // 입구를 밟으면 던전으로 넘어간다.
  player.x = trigger.x;
  player.y = trigger.y;
  const result = engine.advanceRealtimeBattle(16);
  assert.equal(result, "dungeonEntrance");
  assert.equal(run.pendingEntrance, true);
  assert.equal(run.battle, null, "필드 전투는 정리된다");

  // 실제 던전 진입까지 이어진다.
  assert.equal(engine.enterAdventureDungeon(), true);
  assert.equal(run.location, "dungeon");
  assert.ok(run.dungeon, "던전이 생성된다");
});
