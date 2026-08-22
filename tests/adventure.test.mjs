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
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // fireBolt
  assert.equal(issuePlayerAction(front, "skill2"), true); // frostNova
  assert.equal(issuePlayerAction(front, "skill3"), true); // manaShield
  assert.equal(Boolean(player.positiveEffects?.shield), true);
  assert.equal(issuePlayerAction(front, "ultimate"), true); // lightningCage

  commander.skillLoadouts.archmage = ["manaFocusSkill"];
  const back = createAutoBattle("duneRaiders", "archmage-back", "field", STARTING_PARTY, {}, { commander });
  assert.equal(issuePlayerAction(back, "skill1"), true); // manaFocusSkill
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

test("정령아크 전승은 스킬 4개+궁 1개가 모두 실행되고 상태이상·소환·재사용 단축이 강화된다", () => {
  const commander = createDefaultCommander();
  commander.combatKitId = "spiritArchmage";
  const front = createAutoBattle("duneRaiders", "spiritarchmage-front", "field", STARTING_PARTY, {}, { commander });
  const player = front.units.find((unit) => unit.controlled);
  player.x = front.enemies[0].x - 5;
  player.y = front.enemies[0].y;
  front.enemies[1].x = front.enemies[0].x;
  front.enemies[1].y = front.enemies[0].y;
  selectPlayerTarget(front, front.enemies[0].id);
  assert.equal(issuePlayerAction(front, "skill1"), true); // fireBolt(폭염창) + 주변 폭발
  assert.equal(Boolean(front.enemies[1].statuses?.burn), true);
  assert.equal(issuePlayerAction(front, "skill2"), true); // frostNova(빙결 폭발)
  assert.equal(Boolean(front.enemies[0].statuses?.frost), true);
  assert.equal(issuePlayerAction(front, "skill3"), true); // spiritBond(정령 결속)
  assert.equal(front.units.some((unit) => unit.summonType === "spiritWisp"), true);
  assert.equal(issuePlayerAction(front, "ultimate"), true); // lightningCage(삼원소 심판, 넓게)

  commander.skillLoadouts.spiritArchmage = ["manaFocusSkill"];
  const back = createAutoBattle("duneRaiders", "spiritarchmage-back", "field", STARTING_PARTY, {}, { commander });
  back.playerReadyAt.skill2 = back.elapsed + 5000;
  assert.equal(issuePlayerAction(back, "skill1"), true); // manaFocusSkill(메모라이즈) + 재사용 대기시간 단축
  assert.ok(back.playerReadyAt.skill2 < back.elapsed + 5000);
});

test("신성아크 전승은 스킬 4개+궁 1개가 모두 실행되고 아군을 회복·축복한다", () => {
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
  assert.equal(issuePlayerAction(front, "skill3"), true); // manaShield(성역) + 지속 회복
  assert.equal(Boolean(player.positiveEffects?.regeneration), true);
  assert.equal(issuePlayerAction(front, "ultimate"), true); // heavenlyJudgment(천벌)
  assert.equal(Boolean(player.positiveEffects?.shield), true);

  commander.skillLoadouts.holyArchmage = ["manaFocusSkill"];
  const back = createAutoBattle("duneRaiders", "holyarchmage-back", "field", STARTING_PARTY, {}, { commander });
  for (const unit of back.units) unit.hp = Math.round(unit.maxHp * 0.5);
  assert.equal(issuePlayerAction(back, "skill1"), true); // manaFocusSkill(치유의 주문) - 아군 치유 + 상태이상 해제
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
