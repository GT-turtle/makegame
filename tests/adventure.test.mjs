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
  issuePlayerAction,
  issueBattleCommand,
  leaveRunSettlement,
  moveBattlePlayer,
  steerBattlePlayer,
  moveRunPlayer,
  selectPlayerTarget,
  tickAutoBattle
} from "../src/adventure.js";
import { PLAYER_BASE_CLASS_DEFS, PLAYER_KIT_DEFS, createDefaultCommander, playerCombatStats } from "../src/classes.js";
import { GameEngine } from "../src/game.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) || null; }
  setItem(key, value) { this.values.set(key, value); }
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
    assert.ok(encounter.enemies.length >= 2);
    assert.ok(encounter.enemies.length <= 3);
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
  assert.equal(engine.state.adventure.run.field.width, FIELD_SIZE);
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
        player.x = target.x - 5;
        player.y = target.y;
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
  walkTo(run.field.entrance);
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

test("두 전승 직업은 패시브와 변형 스킬 5개를 가지며 전투에는 3개를 장착한다", () => {
  for (const baseClass of Object.values(PLAYER_BASE_CLASS_DEFS)) assert.ok(baseClass.passive?.id);
  for (const kit of Object.values(PLAYER_KIT_DEFS)) {
    assert.ok(PLAYER_BASE_CLASS_DEFS[kit.baseClassId]);
    assert.equal(kit.skills.length, 5);
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
  assert.equal(issuePlayerAction(battle, "skill2"), true);
  assert.equal(battle.units.filter((unit) => unit.summonType === "raisedDead").length, 1);

  const engine = new GameEngine(new MemoryStorage());
  assert.equal(engine.selectCommanderKit("heavyNecromancer"), true);
  assert.equal(engine.state.adventure.commander.combatKitId, "heavyNecromancer");
  assert.equal(engine.toggleCommanderSkill("armedResurrection"), true);
  assert.equal(engine.state.adventure.commander.skillLoadouts.heavyNecromancer.length, 2);
  assert.equal(engine.toggleCommanderSkill("bloodRend"), true);
  assert.ok(engine.state.adventure.commander.skillLoadouts.heavyNecromancer.includes("bloodRend"));
  assert.equal(engine.toggleCommanderSkill("storedApex"), false);
});

test("기본 직업 패시브는 전승 패시브와 별도로 실제 전투에 적용된다", () => {
  const cycle = createAutoBattle("duneRaiders", "cycle", "field", [], {}, { commander: createDefaultCommander() });
  const noCycle = createAutoBattle("duneRaiders", "no-cycle", "field", [], {}, { commander: createDefaultCommander() });
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
  noCycle.playerBasePassive = null;
  const cyclePlayer = cycle.units.find((unit) => unit.controlled);
  const noCyclePlayer = noCycle.units.find((unit) => unit.controlled);
  for (let hit = 0; hit < 4; hit += 1) {
    tickAutoBattle(cycle, 20);
    tickAutoBattle(noCycle, 20);
  }
  assert.equal(cycle.basePassiveState.hitCount, 4);
  tickAutoBattle(cycle, 20);
  tickAutoBattle(noCycle, 20);
  assert.equal(cycle.basePassiveState.hitCount, 0);
  assert.ok(cyclePlayer.hp > noCyclePlayer.hp);

  const commander = createDefaultCommander();
  commander.combatKitId = "heavyNecromancer";
  const harvest = createAutoBattle("duneRaiders", "harvest", "field", STARTING_PARTY, {}, { commander });
  harvest.enemies[0].hp = 0;
  tickAutoBattle(harvest, 20);
  assert.equal(issuePlayerAction(harvest, "skill2"), true);
  const summon = harvest.units.find((unit) => unit.summonType === "raisedDead");
  assert.equal(harvest.basePassiveState.soulStacks, 1);
  assert.equal(summon.passiveDamageMultiplier, 1.08);
  harvest.elapsed = harvest.basePassiveState.soulExpiresAt;
  tickAutoBattle(harvest, 20);
  assert.equal(harvest.basePassiveState.soulStacks, 0);
  assert.equal(summon.passiveDamageMultiplier, 1);
});

test("두 전승의 액티브 10개가 실제 전투 효과로 모두 실행된다", () => {
  const spiritCommander = createDefaultCommander();
  const spiritFront = createAutoBattle("duneRaiders", "spirit-front", "field", STARTING_PARTY, {}, { commander: spiritCommander });
  const spiritPlayer = spiritFront.units.find((unit) => unit.controlled);
  spiritPlayer.x = spiritFront.enemies[0].x - 5;
  spiritPlayer.y = spiritFront.enemies[0].y;
  selectPlayerTarget(spiritFront, spiritFront.enemies[0].id);
  assert.equal(issuePlayerAction(spiritFront, "skill1"), true);
  assert.equal(issuePlayerAction(spiritFront, "skill2"), true);
  assert.equal(issuePlayerAction(spiritFront, "skill3"), true);

  spiritCommander.skillLoadouts.spiritCrusader = ["thunderLance", "tempestJudgment", "winterAegis"];
  const spiritBack = createAutoBattle("duneRaiders", "spirit-back", "field", STARTING_PARTY, {}, { commander: spiritCommander });
  const spiritBackPlayer = spiritBack.units.find((unit) => unit.controlled);
  spiritBackPlayer.x = spiritBack.enemies[0].x - 8;
  spiritBackPlayer.y = spiritBack.enemies[0].y;
  selectPlayerTarget(spiritBack, spiritBack.enemies[0].id);
  assert.equal(issuePlayerAction(spiritBack, "skill1"), true);
  assert.equal(issuePlayerAction(spiritBack, "skill2"), true);

  const heavyCommander = createDefaultCommander();
  heavyCommander.combatKitId = "heavyNecromancer";
  const heavyFront = createAutoBattle("duneRaiders", "heavy-front", "field", STARTING_PARTY, {}, { commander: heavyCommander });
  const heavyPlayer = heavyFront.units.find((unit) => unit.controlled);
  heavyPlayer.x = heavyFront.enemies[0].x - 5;
  heavyPlayer.y = heavyFront.enemies[0].y;
  selectPlayerTarget(heavyFront, heavyFront.enemies[0].id);
  assert.equal(issuePlayerAction(heavyFront, "skill1"), true);
  heavyFront.enemies[0].hp = 0;
  assert.equal(issuePlayerAction(heavyFront, "skill2"), true);
  assert.equal(issuePlayerAction(heavyFront, "skill3"), true);

  heavyCommander.storedBoss = { defId: "testBear", name: "시험 큰곰", species: "bear", glyph: "B", color: "#999", maxHp: 80, damage: 9, range: 9, speed: 5, attackMs: 1500, armor: 0.12 };
  heavyCommander.skillLoadouts.heavyNecromancer = ["bloodRend", "storedApex", "armedResurrection"];
  const heavyBack = createAutoBattle("duneRaiders", "heavy-back", "field", STARTING_PARTY, {}, { commander: heavyCommander });
  heavyBack.enemies[0].hp = 0;
  const heavyBackPlayer = heavyBack.units.find((unit) => unit.controlled);
  heavyBackPlayer.x = heavyBack.enemies[1].x - 8;
  heavyBackPlayer.y = heavyBack.enemies[1].y;
  selectPlayerTarget(heavyBack, heavyBack.enemies[1].id);
  assert.equal(issuePlayerAction(heavyBack, "skill1"), true);
  assert.equal(issuePlayerAction(heavyBack, "skill2"), true);
  assert.equal(issuePlayerAction(heavyBack, "skill3"), true);
  assert.equal(heavyBack.units.filter((unit) => unit.summonType === "storedBoss").length, 1);
  assert.equal(heavyBack.consumedCorpseIds.length, 1);
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
