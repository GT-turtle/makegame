import test from "node:test";
import assert from "node:assert/strict";

import {
  SAVE_VERSION,
  advanceEstate,
  adjacentItemUids,
  bagFingerprint,
  canPlaceItem,
  createFloor,
  createInitialState,
  createItem,
  environmentMitigation,
  findPath,
  floorIsConnected,
  itemCells,
  keyOf,
  masteryLevel,
  migrateState,
  placeItem,
  resolveBagTrigger,
  rotateMask,
  synergyItemUids,
  workerProficiency,
  OFFLINE_YIELD_BY_RARITY,
  WAREHOUSE_LEVEL_CAP,
  WAREHOUSE_MAX_LEVEL,
  offlineExpeditionRate,
  warehouseCap
} from "../src/core.js";
import { ITEM_DEFS, MATERIAL_DEFS , ORE_SMELTING_DEFS } from "../src/data.js";
import { ENEMY_COMBATANTS, GOLEM_MAX_COUNT, GOLEM_UNIT_ID, MEMORY_YIELD_RATIO, REGION_ENTRY_POWER, SECONDARY_DEFS, STARTING_PARTY, UNIT_DEFS, WORLD_REGION_DEFS, createAutoBattle, golemCount, issuePlayerAction, partyPowerScore, regionEntryCheck, tickAutoBattle  , materialRarity, MATERIAL_RARITY_ORDER } from "../src/adventure.js";
import { FAVOR_GIFTS, favorGainPerCycle, mageTowerCharges, mageTowerSupport , DISCOVERY_SITE_DEFS } from "../src/frontier.js";
import { ENHANCE_MAX, ENHANCE_SAFE_LEVEL, RUNE_DEFS, enhanceCost, enhanceOdds, masterySlots, newUnitProgress, repairCost } from "../src/classes.js";
import { companionBonuses, companionEquippableSlots, createDefaultCommander, EQUIPMENT_DEFS, EQUIPMENT_GRADES, equippedBonuses, slotsAcceptingItem, EQUIPMENT_GRADE_DEFS, EQUIPMENT_OPTION_POOLS, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_DEFS, createEmptyEquipped, equipmentSlotsByCategory, instanceBonuses, playerCombatStats, rollCraftGrade, rollEquipmentOptions, equipmentOptionPool, combatPowerScore, LEGENDARY_DEFS, MYTHIC_GEAR_DEFS, mythicSetBonus } from "../src/classes.js";
import { GameEngine, SAVE_KEY } from "../src/game.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
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

test("L자 아이템 회전은 점유 칸을 정확히 바꾼다", () => {
  const mask = [[1, 1], [0, 1]];
  assert.deepEqual(rotateMask(mask, 1), [[0, 1], [1, 1]]);
  const coil = createItem("coil", "coil", 1, 1, 1);
  assert.deepEqual(itemCells(coil), [
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 }
  ]);
});

test("가방은 겹치는 배치와 경계 밖 배치를 거부한다", () => {
  const blade = createItem("blade", "blade", 0, 0, 0);
  const boots = createItem("boots", "boots");
  const inventory = [blade, boots];
  assert.equal(canPlaceItem(inventory, boots, 0, 0, 0, 4), false);
  assert.equal(canPlaceItem(inventory, boots, 4, 3, 0, 4), false);
  assert.equal(placeItem(inventory, "boots", 2, 0, 0, 4), true);
  assert.equal(bagFingerprint(inventory).includes("boots:2:0:0"), true);
});

test("인접한 검과 숫돌은 하나의 공격 연쇄를 만든다", () => {
  const state = createInitialState();
  const links = adjacentItemUids(state.inventory, "item-2");
  assert.equal(links.includes("item-1"), true);
  const result = resolveBagTrigger(state, "attack", { damage: 1 });
  assert.equal(result.damage, 5);
  assert.equal(result.triggered.includes("item-1"), true);
  assert.equal(result.triggered.includes("item-2"), true);
  assert.deepEqual(synergyItemUids(state.inventory, "item-2"), ["item-1"]);
});

test("생성되는 대형 필드는 시작점·측량탑·심장이 모두 연결된다", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const world = createFloor(seed * 919);
    assert.equal(world.tiles.length, 31);
    assert.equal(world.tiles[0].length, 31);
    assert.equal(world.beacons.length, 3);
    assert.equal(floorIsConnected(world), true, `seed ${seed}`);
  }
});

test("터치 이동 경로는 벽·적·미확인 칸을 우회한다", () => {
  const tiles = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => (
    x === 0 || y === 0 || x === 4 || y === 4 ? "wall" : "floor"
  )));
  const start = { x: 1, y: 1 };
  const target = { x: 3, y: 1 };
  const detour = findPath(tiles, start, target, new Set([keyOf(2, 1)]));
  assert.equal(detour.length, 5);
  assert.equal(detour.some((point) => point.x === 2 && point.y === 1), false);

  const knownCorridor = new Set([keyOf(1, 1), keyOf(2, 1), keyOf(3, 1)]);
  assert.equal(findPath(tiles, start, target, new Set(), knownCorridor).length, 3);
  assert.deepEqual(findPath(tiles, start, target, new Set(), new Set([keyOf(1, 1), keyOf(3, 1)])), []);
});

test("연구와 가방 확장은 저장 후에도 유지된다", () => {
  const storage = new MemoryStorage();
  const first = new GameEngine(storage);
  first.state.meta.scrap = 30;
  assert.equal(first.purchaseResearch("venom"), true);
  assert.equal(first.purchaseResearch("bag_row"), true);
  assert.equal(first.state.meta.bagRows, 5);
  assert.ok(storage.getItem(SAVE_KEY));

  const restored = new GameEngine(storage);
  assert.equal(restored.state.meta.research.includes("venom"), true);
  assert.equal(restored.state.meta.bagRows, 5);
  assert.equal(restored.state.meta.blueprints.includes("venom"), true);
  assert.equal(restored.state.inventory.some((item) => item.defId === "venom"), false);
});

test("직업과 출신을 조합하고 고유 기술 숙련도를 올린다", () => {
  const engine = new GameEngine(new MemoryStorage());
  assert.equal(engine.selectClass("martial"), true);
  assert.equal(engine.selectTrait("disciplined"), true);
  engine.startExpedition(8128);
  engine.state.player.hp = 10;
  engine.state.expedition.pressure.toxin = 8;
  engine.state.player.classResource = 4;
  assert.equal(engine.useClassSkill(), true);
  assert.ok(engine.state.player.hp > 10);
  assert.ok(engine.state.expedition.pressure.toxin < 8);
  assert.ok(engine.state.meta.skillMastery.meridianFlow >= 1.25);
  assert.equal(masteryLevel(engine.state.meta.skillMastery.meridianFlow), 1);
});

test("직업·출신·가방 장비의 환경 대응이 모두 합산된다", () => {
  const state = createInitialState();
  state.meta.classId = "knight";
  state.meta.traitId = "winterBlood";
  state.inventory.push(createItem("frontierMantle", "mantle", 0, 2, 0));
  assert.equal(environmentMitigation(state, "cold"), 3);
  assert.equal(environmentMitigation(state, "corruption"), 1);
});

test("영지 일꾼은 원정 턴에 생산하고 대장간은 설계도로 변동 장비를 만든다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 10;
  assert.equal(engine.hireWorker("lumberjack"), true);
  const beforeWood = engine.state.meta.materials.wood;
  advanceEstate(engine.state, 3);
  assert.equal(engine.state.meta.materials.wood, beforeWood + 1);
  const beforeSmithHours = engine.state.meta.estate.workerProgress.blacksmith.workHours;
  const crafted = engine.craftRecipe("frontierMantle", () => 0);
  assert.ok(crafted);
  assert.equal(crafted.defId, "frontierMantle");
  assert.equal(crafted.quality, 45);
  assert.equal(crafted.affixes.length, 1);
  assert.equal(engine.state.meta.estate.workerProgress.blacksmith.workHours, beforeSmithHours + 4);
});

test("생산 동료는 일꾼 없이도 해당 직종을 채우고, 명장 대장장이는 전용 설계도와 품질 보너스를 준다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 40;

  // 벌목꾼을 고용하지 않아도 동료가 그 자리를 채운다.
  assert.equal(engine.state.meta.estate.workers.lumberjack, 0);
  assert.equal(engine.recruitProductionCompanion("veteranWoodcutter"), true);
  const beforeWood = engine.state.meta.materials.wood;
  advanceEstate(engine.state, 3);
  assert.ok(engine.state.meta.materials.wood > beforeWood);

  // 대장장이 없이는 전용 설계도가 제작 목록에 없고, 제작도 거부된다.
  assert.equal(engine.state.meta.blueprints.includes("masterworkBlade"), false);
  engine.state.meta.materials.ingot = 10;
  engine.state.meta.materials.blackSteel = 5;
  assert.equal(engine.craftRecipe("masterworkBlade", () => 0), false);

  // 명장 대장장이를 영입하면 전용 설계도가 즉시 해금되고 제작 시 품질·부가옵션이 강화된다.
  assert.equal(engine.recruitProductionCompanion("masterSmith"), true);
  assert.equal(engine.state.meta.blueprints.includes("masterworkBlade"), true);
  const sequence = [0, 0, 0, 0.5];
  let call = 0;
  const queuedRandom = () => sequence[Math.min(call++, sequence.length - 1)];
  const crafted = engine.craftRecipe("masterworkBlade", queuedRandom);
  assert.ok(crafted);
  assert.equal(crafted.quality, 55);
  assert.equal(crafted.affixes.length, 2);

  // 같은 동료를 중복 영입할 수 없다.
  assert.equal(engine.recruitProductionCompanion("masterSmith"), false);
});

test("제련공은 대장장이 대신 철괴를 만들고, 약초학자는 약초로 야전 약초함을 만든다", () => {
  const engine = new GameEngine(new MemoryStorage());
  // 기본 상태에서도 제련공 1명이 배정돼 있어 광석·목재가 있으면 철괴가 자동 생산된다.
  const beforeIngot = engine.state.meta.materials.ingot;
  const beforeBlacksmithHours = engine.state.meta.estate.workerProgress.blacksmith.workHours;
  advanceEstate(engine.state, 5);
  assert.ok(engine.state.meta.materials.ingot > beforeIngot);
  assert.ok(engine.state.meta.estate.workerProgress.refiner.workHours > 0);
  assert.equal(engine.state.meta.estate.workerProgress.blacksmith.workHours, beforeBlacksmithHours);

  engine.state.meta.scrap = 20;
  engine.state.meta.materials.herb = 10;
  assert.equal(engine.hireWorker("herbalist"), true);
  const beforeHerbKits = engine.state.inventory.filter((item) => item.defId === "herbKit").length;
  advanceEstate(engine.state, 4);
  const afterHerbKits = engine.state.inventory.filter((item) => item.defId === "herbKit").length;
  assert.ok(afterHerbKits > beforeHerbKits);
  assert.ok(engine.state.meta.materials.herb < 10);
});

test("제련공은 지역 원광도 정제 원소로 만들고, 복합 광석은 여러 원소를 동시에 낸다", () => {
  const single = createInitialState();
  single.meta.estate.workers.refiner = 1;
  single.meta.materials.bauxite = 10;
  single.meta.materials.wood = 10;
  const beforeAluminum = single.meta.materials.aluminum;
  advanceEstate(single, 5);
  assert.ok(single.meta.materials.aluminum > beforeAluminum);

  const compound = createInitialState();
  compound.meta.estate.workers.refiner = 1;
  compound.meta.materials.stannite = 40;
  compound.meta.materials.wood = 40;
  advanceEstate(compound, 15); // stannite yields copper/ingot at 0.5x per batch, so needs 2+ cycles to round up
  assert.ok(compound.meta.materials.tin > 0);
  assert.ok(compound.meta.materials.copper > 0);
  assert.ok(compound.meta.materials.ingot > 2); // 초기값 2에서 추가로 늘어나야 함
});

test("연금술사는 연금 계열 설계도에만 품질·부가옵션 보너스를 준다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 40;
  engine.state.meta.blueprints.push("venom", "knightAegis");
  engine.state.meta.materials.wood = 5;
  engine.state.meta.materials.sporeGland = 5;
  engine.state.meta.materials.ingot = 10;
  engine.state.meta.materials.blackSteel = 5;
  assert.equal(engine.recruitProductionCompanion("alchemist"), true);

  const sequence = [0, 0, 0, 0.5];
  let call = 0;
  const queuedRandom = () => sequence[Math.min(call++, sequence.length - 1)];
  const potion = engine.craftRecipe("venom", queuedRandom); // tags: ["alchemy"]
  assert.ok(potion);
  assert.equal(potion.quality, 55);
  assert.equal(potion.affixes.length, 2);

  call = 0;
  const shield = engine.craftRecipe("knightAegis", queuedRandom); // tags: ["defense", "rune"], not alchemy
  assert.ok(shield);
  assert.equal(shield.quality, 45);
  assert.equal(shield.affixes.length, 1);
});

test("룬은 고철로 획득하고 한 번에 하나만 장착할 수 있다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 15;
  const commander = engine.state.adventure.commander;

  assert.equal(engine.equipRune("greenRune"), false); // 아직 미보유
  assert.equal(engine.purchaseRune("greenRune"), true);
  assert.equal(engine.state.meta.scrap, 5);
  assert.equal(commander.runesOwned.includes("greenRune"), true);
  assert.equal(engine.purchaseRune("greenRune"), false); // 중복 획득 불가

  assert.equal(engine.equipRune("greenRune"), true);
  assert.equal(commander.equippedRuneId, "greenRune");

  // 소지금이 부족해도 이미 보유한 룬은 다시 장착/해제할 수 있다.
  engine.state.meta.scrap = 0;
  assert.equal(engine.equipRune(null), true);
  assert.equal(commander.equippedRuneId, null);
});

test("지역 부락 친목도 60 달성 시 출신 지역이 일치하는 직업의 무기 설계도를 습득한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander;
  assert.deepEqual(commander.unlockedBlueprints, []);

  engine.state.meta.villageFriendship.west = 60;
  const summary = engine.checkVillageMilestones("west");
  // 크루세이더·네크로맨서 둘 다 출신 지역이 west라 한 번에 같이 습득된다.
  assert.ok(commander.unlockedBlueprints.includes("crusaderBastardSword"));
  assert.ok(commander.unlockedBlueprints.includes("necromancerArmorSword"));
  assert.ok(summary.includes("무기 설계도 습득"));

  // 이미 습득한 설계도는 다시 안 늘어난다.
  const before = commander.unlockedBlueprints.length;
  engine.state.meta.villageMilestones.west = [30, 60]; // 재확인해도 threshold 60을 다시 못 밟도록
  engine.checkVillageMilestones("west");
  assert.equal(commander.unlockedBlueprints.length, before);
});

test("무기는 설계도 습득 후 재료로 제작해야 하고, 자기 직업과 일치해야 장착된다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander; // 기본 combatKitId = spiritCrusader -> baseClassId crusader

  assert.equal(engine.craftEquipment("crusaderBastardSword"), false, "설계도 미습득 상태에서는 제작 불가");

  commander.unlockedBlueprints.push("crusaderBastardSword");
  engine.state.meta.materials.ingot = 1;
  engine.state.meta.materials.blackSteel = 0;
  assert.equal(engine.craftEquipment("crusaderBastardSword"), false, "재료 부족하면 제작 불가");

  engine.state.meta.materials.ingot = 4;
  engine.state.meta.materials.blackSteel = 1;
  assert.equal(engine.craftEquipment("crusaderBastardSword"), true);
  assert.equal(engine.state.meta.materials.ingot, 0);
  assert.equal(engine.state.meta.materials.blackSteel, 0);
  const sword = commander.equipmentOwned.find((entry) => entry.defId === "crusaderBastardSword");
  assert.ok(sword, "보유 목록에는 인스턴스가 들어간다");
  assert.ok(sword.uid, "인스턴스는 고유 uid를 갖는다");

  assert.equal(engine.equipEquipment("없는uid"), false, "미보유 무기는 장착 불가");
  assert.equal(engine.equipEquipment(sword.uid), true);
  assert.equal(commander.equipped.weapon, sword.uid, "장착표에는 uid가 들어간다");

  // 바바리안 무기를 억지로 보유시켜도, 지금 직업(크루세이더)과 안 맞으면 장착 거부.
  commander.equipmentOwned.push({ uid: "axe1", defId: "barbarianGreataxe", grade: "common", options: [] });
  assert.equal(engine.equipEquipment("axe1"), false, "직업이 다른 무기는 장착 불가");
  assert.equal(commander.equipped.weapon, sword.uid, "장착 상태는 그대로 유지된다");

  assert.equal(engine.equipEquipment(null, "weapon"), true);
  assert.equal(commander.equipped.weapon, null);
});

test("방어구·장신구는 직업 제한 없이 슬롯별로 하나씩 장착되고 보너스가 합산된다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander;
  const baseStats = playerCombatStats(commander, commander.combatKitId);

  // 방어구는 크루세이더든 누구든 자유롭게 고를 수 있다(직업 제한 없음).
  commander.unlockedBlueprints.push("heavyPlate", "guardianCharm", "scoutLeather");
  engine.state.meta.materials.ingot = 20;
  engine.state.meta.materials.blackSteel = 5;
  engine.state.meta.materials.herb = 20;
  engine.state.meta.materials.wood = 20;

  const uidOf = (defId) => commander.equipmentOwned.find((entry) => entry.defId === defId).uid;

  assert.equal(engine.craftEquipment("heavyPlate"), true);
  assert.equal(engine.craftEquipment("guardianCharm"), true);
  assert.equal(engine.equipEquipment(uidOf("heavyPlate")), true);
  assert.equal(engine.equipEquipment(uidOf("guardianCharm")), true);
  assert.equal(commander.equipped.chest, uidOf("heavyPlate"));
  assert.equal(commander.equipped.necklace, uidOf("guardianCharm"));

  // 방어구(체력+12%)와 장신구(체력+9%)가 함께 적용된다.
  const gearedStats = playerCombatStats(commander, commander.combatKitId);
  assert.ok(gearedStats.maxHp > baseStats.maxHp, "체력 보너스가 실제 스탯에 반영된다");
  assert.ok(gearedStats.armor > baseStats.armor, "방어력 보너스도 반영된다");

  // 같은 슬롯에 다른 장비를 끼면 교체된다(둘 다 장착되지 않는다).
  assert.equal(engine.craftEquipment("scoutLeather"), true);
  assert.equal(engine.equipEquipment(uidOf("scoutLeather")), true);
  assert.equal(commander.equipped.chest, uidOf("scoutLeather"), "같은 부위(갑옷)는 교체된다");
  assert.equal(commander.equipped.necklace, uidOf("guardianCharm"), "다른 부위는 그대로다");
});

test("장비 슬롯은 무기 1 · 방어구 5 · 장신구 3(반지2+목걸이) 계열로 구성된다", () => {
  assert.equal(equipmentSlotsByCategory("weapon").length, 1);
  assert.equal(equipmentSlotsByCategory("armor").length, 5, "방어구는 부위별 5칸");
  assert.equal(equipmentSlotsByCategory("accessory").length, 3, "반지 2 + 목걸이 1");

  // 반지는 같은 종류가 두 칸이다 — 아이템의 slot("ring")과 장착 칸 id(ring1/ring2)가 다르다.
  const ringSlots = slotsAcceptingItem("ring");
  assert.deepEqual(ringSlots.map((slot) => slot.id), ["ring1", "ring2"]);
  assert.deepEqual(slotsAcceptingItem("necklace").map((slot) => slot.id), ["necklace"]);

  // 직업 제한은 무기에만 있다 — 방어구·장신구까지 직업을 타면 "직업이 선택을
  // 강제"하게 되어 docs/CHOICE_DESIGN.md 원칙과 어긋난다.
  const locked = EQUIPMENT_SLOTS.filter((slot) => EQUIPMENT_SLOT_DEFS[slot].classLocked);
  assert.deepEqual(locked, ["weapon"]);

  // 빈 장착표는 모든 슬롯을 빠짐없이 가진다(저장·UI가 이걸 기준으로 돈다).
  assert.deepEqual(Object.keys(createEmptyEquipped()).sort(), [...EQUIPMENT_SLOTS].sort());
  assert.ok(Object.values(createEmptyEquipped()).every((value) => value === null));

  // 모든 장비는 실제로 들어갈 칸이 있는 부위를 가리켜야 한다.
  // (아이템의 slot은 장착 칸 id가 아니라 itemSlot이다 — 반지는 ring1/ring2 두 칸.)
  for (const entry of Object.values(EQUIPMENT_DEFS)) {
    assert.ok(slotsAcceptingItem(entry.slot).length > 0, `${entry.id}의 부위 ${entry.slot}에 들어갈 칸이 없다`);
  }
});

test("v20 저장의 방어구·장신구 한 칸은 부위별 슬롯으로 옮겨진다", () => {
  const state = createInitialState();
  state.version = 20;
  // v20 모양: armor / accessory 한 칸씩.
  state.adventure.commander.equipped = {
    weapon: "crusaderBastardSword",
    armor: "heavyPlate",
    accessory: "guardianCharm"
  };
  state.adventure.commander.equipmentOwned = ["crusaderBastardSword", "heavyPlate", "guardianCharm"];
  const migrated = migrateState(JSON.parse(JSON.stringify(state)));
  const commander = migrated.adventure.commander;
  const equipped = commander.equipped;
  const defOf = (uid) => commander.equipmentOwned.find((entry) => entry.uid === uid)?.defId;

  assert.equal(defOf(equipped.chest), "heavyPlate", "방어구는 그 아이템의 부위(갑옷)로 간다");
  assert.equal(defOf(equipped.necklace), "guardianCharm", "장신구는 부적 칸으로 간다");
  assert.equal(defOf(equipped.weapon), "crusaderBastardSword", "무기는 그대로다");

  // 옛 키가 남아 있으면 UI가 유령 장비를 그린다.
  assert.deepEqual(Object.keys(equipped).sort(), [...EQUIPMENT_SLOTS].sort());
  assert.equal(equipped.armor, undefined);
  assert.equal(equipped.accessory, undefined);
  assert.equal(equipped.helmet, null, "새로 생긴 칸은 비어 있다");

  // 보유 목록도 인스턴스로 바뀐다.
  assert.ok(commander.equipmentOwned.every((entry) => entry.uid && entry.defId && entry.grade));
});

test("끼고 있지만 보유 목록에 없던 장비는 마이그레이션에서 살려준다", () => {
  // 구버전 저장에서 equipped와 equipmentOwned가 어긋나 있는 경우가 있다.
  // 그냥 버리면 장비가 조용히 사라진다.
  const state = createInitialState();
  state.version = 20;
  state.adventure.commander.equipmentOwned = [];
  state.adventure.commander.equipped = { weapon: "crusaderBastardSword", armor: null, accessory: null };

  const commander = migrateState(JSON.parse(JSON.stringify(state))).adventure.commander;
  assert.equal(commander.equipmentOwned.length, 1, "인스턴스를 만들어 보유 목록에 넣는다");
  assert.equal(commander.equipmentOwned[0].defId, "crusaderBastardSword");
  assert.equal(commander.equipped.weapon, commander.equipmentOwned[0].uid, "장착도 유지된다");
});

test("작업자는 실제로 생산한 시간만 쌓아 초심자에서 장인까지 숙련된다", () => {
  const state = createInitialState();
  state.meta.estate.workers.lumberjack = 1;
  state.meta.materials.ore = 0;
  state.meta.materials.wood = 0;
  advanceEstate(state, 20);
  assert.equal(workerProficiency(state, "lumberjack").name, "숙련자");
  assert.equal(workerProficiency(state, "lumberjack").workHours, 20);
  assert.equal(workerProficiency(state, "blacksmith").workHours, 0);
  advanceEstate(state, 130);
  assert.equal(workerProficiency(state, "lumberjack").name, "장인");
  assert.ok(state.meta.materials.wood > 50);
});

test("v2 저장은 직업·영지·설계도 기본값을 안전하게 보강한다", () => {
  const legacy = createInitialState();
  legacy.version = 2;
  delete legacy.meta.classId;
  delete legacy.meta.estate;
  delete legacy.meta.materials;
  delete legacy.meta.blueprints;
  const migrated = migrateState(legacy);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.meta.classId, "knight");
  assert.equal(migrated.meta.estate.workers.steward, 1);
  assert.equal(migrated.meta.blueprints.includes("frontierMantle"), true);
  assert.equal(migrated.meta.selectedAreaId, "estate");
  assert.equal(migrated.meta.materials.malachite, 0);
  assert.equal(migrated.meta.materials.runeFragment, 0);
  assert.equal(migrated.meta.estate.workerProgress.blacksmith.workHours, 0);
});

test("모든 물품은 장비·광석·특수·기타 중 하나로 분류된다", () => {
  assert.equal(Object.values(ITEM_DEFS).every((item) => item.category === "equipment"), true);
  assert.equal(Object.values(MATERIAL_DEFS).every((material) => ["ore", "special", "other"].includes(material.category)), true);
  assert.deepEqual(["malachite", "ore", "bauxite", "cassiterite", "rutile", "sphalerite"].map((id) => MATERIAL_DEFS[id].symbol), ["Cu", "Fe", "Al", "Sn", "Ti", "Zn"]);
});

test("내 영지·사막·설산은 같은 탐험 규약으로 서로 다른 지도를 만든다", () => {
  const estate = new GameEngine(new MemoryStorage());
  estate.startExpedition("estate", 101);
  assert.equal(estate.state.expedition.areaId, "estate");
  assert.equal(estate.state.expedition.beaconGoal, 0);
  assert.equal(estate.state.expedition.floor.enemies.length, 0);
  assert.equal(estate.getEnvironmentStatus().pressure, null);
  const nodeEntry = Object.entries(estate.state.expedition.floor.features).find(([, feature]) => feature.type === "estateNode" && feature.materialId === "wood");
  const beforeWood = estate.state.meta.materials.wood;
  const [x, y] = nodeEntry[0].split(",").map(Number);
  estate.resolveFeature(x, y);
  assert.equal(estate.state.meta.materials.wood, beforeWood + 1);

  const snow = new GameEngine(new MemoryStorage());
  snow.startExpedition("snowfield", 202);
  assert.equal(snow.state.expedition.areaId, "snowfield");
  assert.equal(snow.getEnvironmentStatus().pressure.id, "cold");
  assert.equal(snow.state.expedition.floor.enemies.some((enemy) => enemy.defId === "frostColossus"), true);
});

test("적은 인접 첫 턴에 예고하고 다음 턴에 공격한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.startExpedition(1234);
  const floor = engine.state.expedition.floor;
  floor.tiles = Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => (
    x === 0 || y === 0 || x === 8 || y === 8 ? "wall" : "floor"
  )));
  engine.state.player.x = 3;
  engine.state.player.y = 3;
  floor.enemies = [{
    id: "test-enemy",
    defId: "gnawer",
    x: 4,
    y: 3,
    hp: 5,
    maxHp: 5,
    intent: "pursue",
    poison: 0,
    burn: 0
  }];
  const before = engine.state.player.hp;
  engine.wait();
  assert.equal(engine.state.player.hp, before);
  assert.equal(floor.enemies[0].intent, "strike");
  engine.wait();
  assert.ok(engine.state.player.hp <= before);
  assert.equal(floor.enemies[0].intent, "recover");
});

test("플레이어가 먼저 공격해도 추격 중인 적은 즉시 반격하지 않는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.startExpedition(4321);
  const floor = engine.state.expedition.floor;
  floor.tiles = Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => (
    x === 0 || y === 0 || x === 8 || y === 8 ? "wall" : "floor"
  )));
  engine.state.player.x = 3;
  engine.state.player.y = 3;
  floor.enemies = [{
    id: "test-enemy",
    defId: "raider",
    x: 4,
    y: 3,
    hp: 12,
    maxHp: 12,
    intent: "pursue",
    poison: 0,
    burn: 0
  }];
  const before = engine.state.player.hp;
  engine.playerAct(1, 0);
  assert.equal(engine.state.player.hp, before);
  assert.equal(floor.enemies[0].intent, "strike");
});

test("사막 측량 거점과 보스 처치 보상은 공방에 영구 반영된다", () => {
  const storage = new MemoryStorage();
  const engine = new GameEngine(storage);
  engine.startExpedition("desert", 777);
  const floor = engine.state.expedition.floor;
  floor.enemies = floor.enemies.filter((enemy) => enemy.id === "enemy-boss");
  for (const beacon of floor.beacons) engine.resolveFeature(beacon.x, beacon.y);
  assert.equal(engine.state.expedition.beaconsActivated, 3);

  const boss = floor.enemies[0];
  boss.hp = 1;
  const approach = [
    { x: boss.x - 1, y: boss.y },
    { x: boss.x + 1, y: boss.y },
    { x: boss.x, y: boss.y - 1 },
    { x: boss.x, y: boss.y + 1 }
  ].find((point) => floor.tiles[point.y][point.x] === "floor");
  engine.state.player.x = approach.x;
  engine.state.player.y = approach.y;
  engine.playerAct(boss.x - approach.x, boss.y - approach.y);
  assert.equal(engine.state.expedition.phase, "victory");
  engine.returnToHub("victory");
  assert.equal(engine.state.meta.bestBeacons, 3);
  assert.equal(engine.state.meta.victories, 1);
  assert.equal(engine.state.meta.essence, 1);
  assert.equal(engine.state.meta.materials.sunShard, 1);
  assert.equal(engine.state.meta.blueprints.includes("mechanicRig"), true);
  assert.equal(engine.state.meta.areaRecords.desert.victories, 1);
  assert.equal(engine.state.inventory.some((item) => item.defId === "scavengerCharm"), true);

  const restored = new GameEngine(storage);
  assert.equal(restored.state.meta.bestBeacons, 3);
  assert.equal(restored.state.meta.victories, 1);
});

test("구형 층제 원정 저장은 영구 성장만 보존하고 안전하게 공방으로 복귀한다", () => {
  const storage = new MemoryStorage();
  const oldState = createInitialState();
  oldState.version = 1;
  oldState.meta.scrap = 19;
  oldState.expedition = { depth: 2, phase: "active", floor: { tiles: [] } };
  storage.setItem(SAVE_KEY, JSON.stringify(oldState));

  const migrated = new GameEngine(storage);
  assert.equal(migrated.state.expedition, null);
  assert.equal(migrated.state.meta.scrap, 19);
  assert.match(migrated.state.log[0].text, /직접 조작|다섯 지역|광역 지도 개편|세부 개척 지도|다단계 수성전|장비·광석·특수·기타|실제 생산 시간|생활권|불규칙 습격|토벌|동행 부대|기본 직업 고유 패시브|피격 회복|신성·자연 친화도|분대 병력|무기·방어구·장신구|투구·갑옷·장갑|등급\(일반~신화\)|반지 두 칸|동료에게 물려줄/);
});

test("방어구 세트를 완성하면 세트 보너스가 추가로 붙는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander;
  engine.state.meta.materials.ingot = 30;
  engine.state.meta.materials.blackSteel = 10;
  engine.state.meta.materials.herb = 30;

  commander.unlockedBlueprints.push("heavyPlate", "guardianCharm");
  assert.equal(engine.craftEquipment("heavyPlate"), true);
  assert.equal(engine.craftEquipment("guardianCharm"), true);

  const uidOf = (defId) => commander.equipmentOwned.find((entry) => entry.defId === defId).uid;

  // 방어구만 착용
  assert.equal(engine.equipEquipment(uidOf("heavyPlate")), true);
  const armorOnly = playerCombatStats(commander, commander.combatKitId);

  // 짝 장신구까지 착용해 세트 완성 → 방어력에 세트 보너스가 더 붙는다
  assert.equal(engine.equipEquipment(uidOf("guardianCharm")), true);
  const fullSet = playerCombatStats(commander, commander.combatKitId);

  assert.ok(fullSet.armor > armorOnly.armor, "세트 완성 시 방어력이 더 오른다");
  assert.ok(fullSet.maxHp > armorOnly.maxHp, "장신구 자체 체력 보너스도 함께 적용된다");
});

test("장비 등급은 5단계이고 제작으로는 희귀까지만 나온다", () => {
  assert.deepEqual(EQUIPMENT_GRADES, ["common", "fine", "rare", "legendary", "mythic"]);

  // 전설·신화는 보스 부산물이 있어야 한다(docs/EQUIPMENT_DESIGN.md §1).
  const craftable = EQUIPMENT_GRADES.filter((id) => EQUIPMENT_GRADE_DEFS[id].craftable);
  assert.deepEqual(craftable, ["common", "fine", "rare"]);

  // 등급이 오르면 기본 배율과 랜덤 옵션 칸이 함께 오른다.
  let previous = null;
  for (const id of EQUIPMENT_GRADES) {
    const grade = EQUIPMENT_GRADE_DEFS[id];
    if (previous) {
      assert.ok(grade.baseScale > previous.baseScale, `${id} 배율이 더 높아야 한다`);
      assert.ok(grade.optionCount > previous.optionCount, `${id} 옵션 칸이 더 많아야 한다`);
    }
    previous = grade;
  }
  // 랜덤 옵션은 모든 장비에 붙는다 — 일반도 한 칸은 갖는다.
  assert.equal(EQUIPMENT_GRADE_DEFS.common.optionCount, 1);

  // 어떤 굴림이 나와도 제작 등급은 제작 가능 범위를 벗어나지 않는다.
  for (let i = 0; i <= 20; i += 1) {
    for (let level = 0; level <= 3; level += 1) {
      assert.ok(craftable.includes(rollCraftGrade(level, i / 20)));
    }
  }
});

test("대장장이 숙련도가 높을수록 좋은 등급과 높은 옵션 수치가 나온다", () => {
  // 같은 굴림값이라도 숙련도가 높으면 등급이 같거나 더 좋다.
  for (const roll of [0.05, 0.3, 0.6, 0.8, 0.95]) {
    const order = EQUIPMENT_GRADES.indexOf(rollCraftGrade(0, roll));
    const masterOrder = EQUIPMENT_GRADES.indexOf(rollCraftGrade(3, roll));
    assert.ok(masterOrder >= order, `굴림 ${roll}에서 장인이 초심자보다 나쁘면 안 된다`);
  }

  // 옵션 수치는 숙련도가 올라가면 최저값이 올라간다(상한은 그대로).
  const worst = () => 0;
  const noviceOptions = rollEquipmentOptions("chest", "rare", 0, worst);
  const masterOptions = rollEquipmentOptions("chest", "rare", 3, worst);
  assert.equal(noviceOptions.length, masterOptions.length);
  for (let i = 0; i < noviceOptions.length; i += 1) {
    assert.equal(noviceOptions[i].key, masterOptions[i].key, "같은 굴림이면 같은 옵션이 뽑힌다");
    assert.ok(masterOptions[i].value > noviceOptions[i].value, "장인이 만들면 바닥값이 덜 나온다");
  }

  const best = () => 0.999;
  const noviceBest = rollEquipmentOptions("chest", "rare", 0, best);
  const masterBest = rollEquipmentOptions("chest", "rare", 3, best);
  for (let i = 0; i < noviceBest.length; i += 1) {
    assert.ok(masterBest[i].value - noviceBest[i].value < 0.002, "최대값은 숙련도와 무관하게 공평하다");
  }
});

test("랜덤 옵션은 부위 계열별 풀에서만 나오고 같은 스탯이 중복되지 않는다", () => {
  // 방어구는 부위마다 풀이 다르므로 chest 풀로 검사한다.
  const armorKeys = EQUIPMENT_OPTION_POOLS.chest.map((entry) => entry.key);
  const weaponKeys = EQUIPMENT_OPTION_POOLS.weapon.map((entry) => entry.key);

  let seed = 7;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  for (let i = 0; i < 40; i += 1) {
    const armor = rollEquipmentOptions("chest", "rare", 1, rng);
    assert.ok(armor.every((entry) => armorKeys.includes(entry.key)), "방어구 옵션은 방어구 풀에서만 나온다");
    assert.equal(new Set(armor.map((e) => e.key)).size, armor.length, "같은 스탯이 두 번 붙지 않는다");

    const weapon = rollEquipmentOptions("weapon", "fine", 1, rng);
    assert.ok(weapon.every((entry) => weaponKeys.includes(entry.key)));

    // 같은 스탯이 부위마다 다른 범위를 가질 수 있으므로(예: 재사용 감소가
    // 무기 0.01~0.04, 방어구 0.01~0.03) 반드시 해당 부위의 풀로 검사한다.
    const inRange = (entries, pool) => {
      for (const entry of entries) {
        const option = pool.find((candidate) => candidate.key === entry.key);
        assert.ok(option, `${entry.key}는 이 부위 풀에 있어야 한다`);
        assert.ok(entry.value >= option.min - 1e-9 && entry.value <= option.max + 1e-9,
          `${entry.key}=${entry.value}가 ${option.min}~${option.max} 범위를 벗어난다`);
      }
    };
    inRange(armor, EQUIPMENT_OPTION_POOLS.chest);
    inRange(weapon, EQUIPMENT_OPTION_POOLS.weapon);
  }

  // 풀보다 옵션 칸이 많으면 붙일 수 있는 만큼만 붙는다.
  // 몸통 풀은 4종인데 신화는 5칸이라 4개까지만 붙는다.
  assert.equal(rollEquipmentOptions("chest", "mythic", 0, rng).length, EQUIPMENT_OPTION_POOLS.chest.length);
});

test("같은 설계도로 여러 번 만들면 각각 다른 굴림의 장비가 쌓인다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander;
  engine.state.meta.craftSeed = 12345; // 굴림 고정
  engine.state.meta.materials.ingot = 100;
  engine.state.meta.materials.blackSteel = 100;
  commander.unlockedBlueprints.push("heavyPlate");

  for (let i = 0; i < 5; i += 1) assert.equal(engine.craftEquipment("heavyPlate"), true);
  assert.equal(commander.equipmentOwned.length, 5, "같은 설계도도 반복 제작된다");
  assert.equal(new Set(commander.equipmentOwned.map((e) => e.uid)).size, 5, "uid는 서로 다르다");

  // 굴림이 실제로 갈린다(등급이든 옵션 수치든).
  const shapes = new Set(commander.equipmentOwned.map((e) =>
    e.grade + ":" + e.options.map((o) => o.key + o.value).join(",")));
  assert.ok(shapes.size > 1, "다섯 개가 전부 똑같이 나오면 랜덤이 아니다");

  // 굴림 결과가 실제 전투 스탯에 반영된다.
  const ranked = commander.equipmentOwned
    .map((e) => ({ e, hp: instanceBonuses(e).maxHpBonus || 0 }))
    .sort((a, b) => b.hp - a.hp);
  assert.ok(ranked[0].hp > 0.12, "등급 배율·랜덤 옵션이 기본값(0.12) 위에 얹힌다");

  engine.equipEquipment(ranked[0].e.uid);
  const strong = playerCombatStats(commander, commander.combatKitId);
  engine.equipEquipment(ranked[ranked.length - 1].e.uid);
  const weak = playerCombatStats(commander, commander.combatKitId);
  assert.ok(strong.maxHp >= weak.maxHp, "더 좋은 굴림이 더 높은 체력을 준다");

  // 안 쓰는 굴림은 버릴 수 있고, 버리면 장착도 해제된다.
  const discarded = ranked[ranked.length - 1].e.uid;
  assert.equal(engine.discardEquipment(discarded), true);
  assert.equal(commander.equipmentOwned.length, 4);
  assert.equal(commander.equipped.chest, null, "장착 중이던 걸 버리면 슬롯이 비워진다");
  assert.equal(engine.discardEquipment(discarded), false, "이미 버린 건 다시 못 버린다");
});

test("제작 굴림은 저장 시드를 이어 쓰므로 되돌려 다시 굴릴 수 없다", () => {
  const make = () => {
    const engine = new GameEngine(new MemoryStorage());
    engine.state.meta.craftSeed = 999;
    engine.state.meta.materials.ingot = 100;
    engine.state.meta.materials.blackSteel = 100;
    engine.state.adventure.commander.unlockedBlueprints.push("heavyPlate");
    engine.craftEquipment("heavyPlate");
    return engine.state.adventure.commander.equipmentOwned[0];
  };
  const first = make();
  const second = make();
  assert.equal(first.grade, second.grade, "같은 시드면 같은 결과가 나온다");
  assert.deepEqual(first.options, second.options);
});

test("반지는 두 칸이고, 같은 물건이 두 칸을 동시에 차지하지 않는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander;
  engine.state.meta.materials.ore = 50;
  engine.state.meta.materials.herb = 50;
  engine.state.meta.materials.ingot = 50;
  commander.unlockedBlueprints.push("sagesBand", "guardianCharm");

  // 같은 반지를 두 개 만든다(굴림이 달라 서로 다른 물건이다).
  assert.equal(engine.craftEquipment("sagesBand"), true);
  assert.equal(engine.craftEquipment("sagesBand"), true);
  const [ringA, ringB] = commander.equipmentOwned.filter((e) => e.defId === "sagesBand");

  // 칸을 지정하지 않으면 빈 칸부터 채운다.
  assert.equal(engine.equipEquipment(ringA.uid), true);
  assert.equal(commander.equipped.ring1, ringA.uid);
  assert.equal(engine.equipEquipment(ringB.uid), true);
  assert.equal(commander.equipped.ring2, ringB.uid, "두 번째 반지는 빈 ring2로 간다");

  // 두 반지의 보너스가 함께 들어간다.
  const both = equippedBonuses(commander);
  const onlyOne = equippedBonuses({ ...commander, equipped: { ...commander.equipped, ring2: null } });
  assert.ok(both.cooldownReduction > onlyOne.cooldownReduction, "반지 두 개가 모두 반영된다");

  // 같은 물건을 다른 칸에 끼면 옮겨 끼는 것이지 복제가 아니다.
  assert.equal(engine.equipEquipment(ringA.uid, "ring2"), true);
  assert.equal(commander.equipped.ring2, ringA.uid);
  assert.equal(commander.equipped.ring1, null, "원래 칸은 비워진다");

  const moved = equippedBonuses(commander);
  assert.equal(moved.cooldownReduction, onlyOne.cooldownReduction, "한 개만 낀 것과 같아야 한다(중복 합산 없음)");

  // 목걸이는 반지 칸에 들어가지 않는다.
  assert.equal(engine.craftEquipment("guardianCharm"), true);
  const charm = commander.equipmentOwned.find((e) => e.defId === "guardianCharm");
  assert.equal(engine.equipEquipment(charm.uid, "ring1"), true, "잘못된 칸을 넘겨도 제 부위로 간다");
  assert.equal(commander.equipped.necklace, charm.uid);
  assert.equal(commander.equipped.ring1, null);
});

test("v22 저장의 반지·부적은 반지1·목걸이로 옮겨진다", () => {
  const state = createInitialState();
  state.version = 22;
  state.adventure.commander.equipmentOwned = [
    { uid: "eq1", defId: "sagesBand", grade: "common", options: [] },
    { uid: "eq2", defId: "guardianCharm", grade: "common", options: [] }
  ];
  state.adventure.commander.equipped = { weapon: null, helmet: null, chest: null, gloves: null,
    boots: null, cloak: null, ring: "eq1", amulet: "eq2" };

  const commander = migrateState(JSON.parse(JSON.stringify(state))).adventure.commander;
  assert.equal(commander.equipped.ring1, "eq1", "반지는 반지1로");
  assert.equal(commander.equipped.necklace, "eq2", "부적은 목걸이로");
  assert.equal(commander.equipped.ring2, null, "새로 생긴 반지2는 비어 있다");
  assert.deepEqual(Object.keys(commander.equipped).sort(), [...EQUIPMENT_SLOTS].sort());
  assert.equal(commander.equipped.amulet, undefined, "옛 키는 남지 않는다");
});

test("보스는 몰아치면 그로기로 무너지고, 무너진 동안 더 아프게 맞는다", () => {
  const battle = createAutoBattle("frostColossusPack", null, null, STARTING_PARTY, {}, { rollSeed: 5 });
  const boss = battle.enemies.find((enemy) => enemy.boss);
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  player.maxHp = player.hp = 99999;
  player.damage = 40;
  boss.dormant = false;

  let groggyCount = 0;
  let disabledTicks = 0;
  for (let t = 0; t < 400; t += 1) {
    player.x = boss.x - 3;
    player.y = boss.y;
    issuePlayerAction(battle, "attack");
    tickAutoBattle(battle, 100);
    player.hp = 99999;
    if (boss.hp < boss.maxHp * 0.3) boss.hp = boss.maxHp; // 죽지 않게 유지
    groggyCount += battle.log.filter((line) => /무너졌다/.test(line.text || line)).length;
    if ((boss.groggyUntil || 0) > battle.elapsed) disabledTicks += 1;
    battle.log = [];
  }

  assert.ok(groggyCount > 0, "몰아치면 무너진다");
  assert.ok(disabledTicks > 0, "무너져 있는 동안이 있다");
});

test("그로기는 보스에게만 붙고, 안 때리면 게이지가 빠진다", () => {
  const battle = createAutoBattle("frostColossusPack", null, null, STARTING_PARTY, {}, { rollSeed: 5 });
  const boss = battle.enemies.find((enemy) => enemy.boss);
  const mob = battle.enemies.find((enemy) => !enemy.boss);
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  player.maxHp = player.hp = 99999;

  // 잡몹에는 게이지가 생기지 않는다 — 금방 죽어서 의미가 없다.
  for (const enemy of battle.enemies) enemy.dormant = false;
  mob.maxHp = mob.hp = 99999;
  player.x = mob.x - 3;
  player.y = mob.y;
  for (let t = 0; t < 40; t += 1) {
    issuePlayerAction(battle, "attack");
    tickAutoBattle(battle, 100);
    player.hp = 99999;
    player.x = mob.x - 3;
    player.y = mob.y;
  }
  assert.ok(!mob.stagger, "잡몹은 그로기 게이지를 갖지 않는다");

  // 보스 게이지를 채워두고 손을 놓으면 빠진다.
  boss.stagger = boss.maxHp * 0.4;
  boss.lastStaggerAt = battle.elapsed;
  const before = boss.stagger;
  for (let t = 0; t < 80; t += 1) { tickAutoBattle(battle, 100); player.hp = 99999; }
  assert.ok(boss.stagger < before, `안 때리면 게이지가 빠진다 (${before.toFixed(1)} -> ${boss.stagger.toFixed(1)})`);
});

test("동료에게 장비를 물려줄 수 있고, 같은 물건을 둘이 동시에 낄 수 없다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander;
  commander.equipmentOwned = [{ uid: "a1", defId: "heavyPlate", grade: "rare", options: [] }];

  // 보관함은 지휘관과 공유하고 장착표만 동료별로 따로 둔다.
  assert.equal(engine.equipCompanionEquipment("snow_guard", "a1"), true);
  assert.equal(commander.companionEquipped.snow_guard.chest, "a1");

  const gear = companionBonuses(commander, "snow_guard");
  assert.ok(gear.maxHpBonus > 0, "동료가 낀 장비의 보너스가 계산된다");

  // 지휘관이 같은 물건을 끼면 동료에게서 떨어진다.
  assert.equal(engine.equipEquipment("a1"), true);
  assert.equal(commander.equipped.chest, "a1");
  assert.equal(commander.companionEquipped.snow_guard.chest, null, "동료에게서 떨어진다");

  // 무기는 직업 전용이라 동료에게 못 준다.
  commander.equipmentOwned.push({ uid: "w1", defId: "crusaderBastardSword", grade: "common", options: [] });
  assert.equal(engine.equipCompanionEquipment("snow_guard", "w1"), false, "무기는 넘길 수 없다");

  // 동료가 낄 수 있는 부위는 무기를 뺀 전부다.
  const slots = companionEquippableSlots().map((slot) => slot.id);
  assert.ok(!slots.includes("weapon"));
  assert.equal(slots.length, EQUIPMENT_SLOTS.length - 1);
});

test("동료가 낀 장비는 실제 전투 능력치를 올린다", () => {
  const build = (gift) => {
    const commander = createDefaultCommander();
    commander.equipmentOwned = [{ uid: "a1", defId: "heavyPlate", grade: "mythic", options: [] }];
    if (gift) commander.companionEquipped = { snow_guard: { chest: "a1" } };
    const battle = createAutoBattle("frostColossusPack", null, null, STARTING_PARTY, {},
      { rollSeed: 1, commander });
    return battle.units.find((unit) => unit.id === "unit-snow_guard");
  };

  const bare = build(false);
  const geared = build(true);
  assert.ok(geared.maxHp > bare.maxHp, `체력이 오른다 (${bare.maxHp} -> ${geared.maxHp})`);
  assert.ok(geared.armor > bare.armor, "방어력도 오른다");
});

test("치명타 확률은 100%까지 올릴 수 있다", () => {
  EQUIPMENT_DEFS.__critCap = {
    id: "__critCap", slot: "ring", name: "검증용", materials: {}, bonus: { criticalChance: 1.5 }
  };
  const commander = createDefaultCommander();
  commander.equipmentOwned = [{ uid: "g0", defId: "__critCap", grade: "common", options: [] }];
  commander.equipped.ring1 = "g0";

  const stats = playerCombatStats(commander, "crusader");
  assert.equal(stats.criticalChance, 1, "상한이 100%다");
  delete EQUIPMENT_DEFS.__critCap;
});

test("안전 구간 강화는 절대 부서지지 않는다", () => {
  // 3지역 진입에 필요한 정도의 강화는 안전 구간 안에서 달성할 수 있어야 한다.
  // 운이 나빠서 진행이 막히면 안 된다.
  // enhanceOdds(L)은 "L에서 L+1로 올릴 때"의 확률이다.
  // +3까지 안전하게 도달해야 하므로 안전한 전이는 0->1, 1->2, 2->3 이다.
  for (let level = 0; level < ENHANCE_SAFE_LEVEL; level += 1) {
    assert.equal(enhanceOdds(level).break, 0, `+${level} -> +${level + 1}은 부서지지 않아야 한다`);
  }
  assert.ok(enhanceOdds(ENHANCE_SAFE_LEVEL).break > 0,
    "+3을 넘기려는 순간부터 부서질 수 있다");

  // 실제로 안전 구간을 100번 돌려도 부서지지 않는다.
  const engine = new GameEngine(new MemoryStorage());
  for (const key of Object.keys(engine.state.meta.materials)) engine.state.meta.materials[key] = 99999;
  const commander = engine.state.adventure.commander;

  for (let trial = 0; trial < 100; trial += 1) {
    commander.equipmentOwned = [{
      uid: "t", defId: "heavyPlate", grade: "common", options: [], enhance: 0, broken: false
    }];
    const instance = commander.equipmentOwned[0];
    while ((instance.enhance || 0) < ENHANCE_SAFE_LEVEL && !instance.broken) {
      engine.enhanceEquipment("t");
    }
    assert.equal(instance.broken, false, "안전 구간에서는 부서지지 않는다");
  }
});

test("강화하면 보너스가 오르고, 부서지면 아무것도 주지 않는다", () => {
  const base = { uid: "t", defId: "heavyPlate", grade: "common", options: [{ key: "maxHpBonus", value: 0.05 }] };

  const plain = instanceBonuses({ ...base, enhance: 0, broken: false });
  const forged = instanceBonuses({ ...base, enhance: 5, broken: false });
  assert.ok(forged.maxHpBonus > plain.maxHpBonus, "강화하면 자체 보너스가 오른다");
  assert.ok(forged.armorFlat > plain.armorFlat, "굴린 옵션이 아닌 기본 보너스도 오른다");

  const broken = instanceBonuses({ ...base, enhance: 5, broken: true });
  assert.deepEqual(broken, {}, "부서지면 끼고 있어도 없는 것과 같다");
});

test("부서진 장비는 수리해야 다시 쓸 수 있고, 수리가 강화보다 비싸다", () => {
  const engine = new GameEngine(new MemoryStorage());
  for (const key of Object.keys(engine.state.meta.materials)) engine.state.meta.materials[key] = 99999;
  const commander = engine.state.adventure.commander;
  commander.equipmentOwned = [{
    uid: "t", defId: "heavyPlate", grade: "common", options: [], enhance: 5, broken: true
  }];
  const instance = commander.equipmentOwned[0];

  // 부서진 장비는 강화할 수 없다.
  assert.equal(engine.enhanceEquipment("t"), false, "부서진 채로는 강화 불가");

  assert.equal(engine.repairEquipment("t"), true);
  assert.equal(instance.broken, false, "수리하면 다시 쓸 수 있다");
  assert.equal(instance.enhance, 5, "강화 단계는 유지된다(파괴가 아니라 파손)");
  assert.equal(engine.repairEquipment("t"), false, "멀쩡한 걸 또 수리할 수는 없다");

  // 수리가 강화보다 무거워야 "부서지면 아프다"가 체감된다.
  const definition = EQUIPMENT_DEFS.heavyPlate;
  const enhance = enhanceCost(definition, 5);
  const repair = repairCost(definition, 5);
  for (const key of Object.keys(repair)) {
    assert.ok(repair[key] > enhance[key], `${key} 수리비가 강화비보다 비싸야 한다`);
  }
});

test("재료가 모자라면 강화도 수리도 되지 않는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  for (const key of Object.keys(engine.state.meta.materials)) engine.state.meta.materials[key] = 0;
  const commander = engine.state.adventure.commander;
  commander.equipmentOwned = [{
    uid: "t", defId: "heavyPlate", grade: "common", options: [], enhance: 0, broken: false
  }];
  assert.equal(engine.enhanceEquipment("t"), false, "재료가 없으면 강화 불가");

  commander.equipmentOwned[0].broken = true;
  assert.equal(engine.repairEquipment("t"), false, "재료가 없으면 수리 불가");
  assert.equal(commander.equipmentOwned[0].broken, true, "실패해도 상태는 그대로");
});

test("강화 단계가 오를수록 성공률이 낮아지고 파손률이 오른다", () => {
  let previousSuccess = 2;
  let previousBreak = -1;
  for (let level = 0; level < ENHANCE_MAX; level += 1) {
    const odds = enhanceOdds(level);
    assert.ok(odds.success <= previousSuccess, `+${level} 성공률이 이전보다 높으면 안 된다`);
    assert.ok(odds.break >= previousBreak || level <= ENHANCE_SAFE_LEVEL,
      `+${level} 파손률이 이전보다 낮으면 안 된다`);
    assert.ok(odds.success + odds.break <= 1, "성공+파손이 100%를 넘을 수 없다");
    previousSuccess = odds.success;
    previousBreak = odds.break;
  }
});

test("기억 던전은 직접 쓰러뜨려 본 보스만 세울 수 있다", () => {
  // 기억을 마법으로 재현하는 설정이므로, 겪지 않은 상대는 그릴 수 없다.
  const engine = new GameEngine(new MemoryStorage());
  assert.equal(engine.memoryBossList().length, 0, "처음엔 아무것도 못 세운다");
  assert.equal(engine.startMemoryBattle("frostColossusPack"), false);

  engine.state.meta.rememberedBosses = ["northBear", "northTitan"];
  const list = engine.memoryBossList();
  assert.ok(list.some((entry) => entry.id === "frostColossusPack"));
  // 일회성인 지역 보스도 기억에 있으면 다시 세울 수 있다 — 재현의 요점이다.
  assert.ok(list.some((entry) => entry.regionBoss), "지역 보스도 재현된다");

  assert.equal(engine.startMemoryBattle("frostColossusPack"), true);
  assert.equal(engine.state.memory.battle.memoryMode, true);
  // 원정 중에는 재현을 시작할 수 없다.
  assert.equal(engine.startMemoryBattle("frostTitanLair"), false, "이미 재현 중이면 또 못 연다");
});

test("기억 던전 보상은 절반이고 설계도는 나오지 않는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.rememberedBosses = ["northBear"];
  const blueprintsBefore = engine.state.adventure.commander.unlockedBlueprints.length;
  const scrapBefore = engine.state.meta.scrap;

  engine.startMemoryBattle("frostColossusPack");
  const battle = engine.state.memory.battle;
  for (const enemy of battle.enemies) enemy.hp = 0;
  assert.equal(engine.advanceMemoryBattle(120), "victory");

  // 부산물은 원본의 절반(올림)만 나온다.
  const bear = ENEMY_COMBATANTS.northBear;
  for (const [materialId, amount] of Object.entries(bear.byproducts)) {
    assert.equal(engine.state.meta.materials[materialId], Math.max(1, Math.ceil(amount * MEMORY_YIELD_RATIO)),
      `${materialId}는 원본 ${amount}의 절반만`);
  }
  assert.equal(engine.state.adventure.commander.unlockedBlueprints.length, blueprintsBefore,
    "설계도는 나오지 않는다 — 재현은 새 전설을 여는 길이 아니다");
  assert.equal(engine.state.meta.scrap, scrapBefore, "원정 정산도 없다");
});

test("지역마다 파티 전투력 요구치가 있고 1지역부터 걸린다", () => {
  // 파티 전체로 재기 때문에 지휘관만 강해서는 넘지 못한다 — 동료를 키울 이유가 된다.
  const regions = ["north", "south", "east", "west", "central"];
  let previous = 0;
  for (const regionId of regions) {
    const required = REGION_ENTRY_POWER[regionId];
    assert.ok(required > 0, `${regionId}에도 요구치가 있다`);
    assert.ok(required > previous, "뒤 지역일수록 더 높다");
    previous = required;
  }

  const engine = new GameEngine(new MemoryStorage());
  // 초기 파티로는 첫 지역만 들어갈 수 있다.
  const first = regionEntryCheck("north", engine.state.adventure.commander,
    engine.state.adventure.party, engine.state.adventure.unitProgress);
  assert.equal(first.allowed, true, "첫 지역은 초기 파티로 들어갈 수 있다");

  const deep = regionEntryCheck("central", engine.state.adventure.commander,
    engine.state.adventure.party, engine.state.adventure.unitProgress);
  assert.equal(deep.allowed, false, "깊은 지역은 초기 파티로 못 들어간다");
  assert.ok(deep.shortfall > 0, "얼마나 모자란지 알려준다");

  assert.equal(engine.startRegionAdventure("central", 1), false, "실제로 진입이 막힌다");
});

test("진입 요구치는 레벨이 아니라 특성과 장비로 넘는다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const adventure = engine.state.adventure;
  const commander = adventure.commander;
  const power = () => partyPowerScore(commander, adventure.party, adventure.unitProgress);
  const bare = power();

  // 예전 저장본이 남긴 level 값은 이제 아무 힘이 없다. 이게 "레벨 없음"의 계약이다.
  for (const unitId of adventure.party) {
    adventure.unitProgress[unitId] = { level: 6, mastery: 0, xp: 0, branchId: null, traitIds: [null, null] };
  }
  assert.equal(power(), bare, "남은 level 값은 전투력을 올리지 않는다");
  assert.equal(engine.startRegionAdventure("central", 1), false, "레벨만으론 들어갈 수 없다");

  // 숙련도 자체도 스탯을 주지 않는다 — 칸을 열 뿐이다.
  for (const unitId of adventure.party) adventure.unitProgress[unitId].mastery = 4;
  assert.equal(power(), bare, "숙련도 자체는 전투력을 올리지 않는다");

  // 그 칸에 특성을 끼우면 비로소 오른다.
  for (const unitId of adventure.party) adventure.unitProgress[unitId].traitIds = ["survival", "forging"];
  const withTraits = power();
  assert.ok(withTraits > bare, `특성을 끼우면 오른다 (${bare} -> ${withTraits})`);

  // 그래도 마지막 지역은 장비 없이 못 넘는다.
  assert.equal(engine.startRegionAdventure("central", 1), false, "특성만으로는 아직 부족하다");

  let n = 0;
  const give = (defId, slot, unitId) => {
    const uid = `g${n++}`;
    commander.equipmentOwned.push({ uid, defId, grade: "mythic", options: [], enhance: 10, broken: false });
    if (unitId) (commander.companionEquipped[unitId] ||= {})[slot] = uid;
    else commander.equipped[slot] = uid;
  };
  give("crusaderBastardSword", "weapon");
  give("heavyPlate", "chest");
  give("guardianCharm", "necklace");
  give("sagesBand", "ring1");
  give("sagesBand", "ring2");
  for (const unitId of adventure.party) {
    give("heavyPlate", "chest", unitId);
    give("guardianCharm", "necklace", unitId);
    give("sagesBand", "ring1", unitId);
    give("sagesBand", "ring2", unitId);
  }

  const geared = power();
  assert.ok(geared > withTraits, `장비를 물려주면 더 오른다 (${withTraits} -> ${geared})`);
  assert.equal(engine.startRegionAdventure("central", 1), true, "장비를 갖추면 들어갈 수 있다");
});

test("명성이 쌓이면 주변 세력이 설계도를 선물해온다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander;

  // 명성이 없으면 아무도 관심이 없다.
  assert.equal(favorGainPerCycle(0), 0);
  for (let i = 0; i < 30; i += 1) engine.advanceDiplomacy();
  assert.deepEqual(engine.state.meta.favor || {}, {}, "명성 0이면 우호도가 오르지 않는다");

  // 명성이 쌓이면 우호도가 오르고 임계마다 설계도가 온다.
  engine.state.meta.renown = 40;
  const before = commander.unlockedBlueprints.length;
  for (let i = 0; i < 60; i += 1) engine.advanceDiplomacy();

  assert.ok(engine.state.meta.favor.north > 0, "우호도가 오른다");
  const gained = commander.unlockedBlueprints.length - before;
  assert.ok(gained > 0, "설계도를 선물받는다");

  // 같은 임계를 두 번 받지 않는다.
  const afterFirst = commander.unlockedBlueprints.length;
  for (let i = 0; i < 30; i += 1) engine.advanceDiplomacy();
  assert.equal(commander.unlockedBlueprints.length, afterFirst, "같은 선물을 또 주지 않는다");

  // 지역마다 다른 것을 주므로 여러 곳과 관계를 쌓아야 다 모인다.
  const allGifts = new Set(Object.values(FAVOR_GIFTS).flatMap((byThreshold) => Object.values(byThreshold)));
  assert.ok(allGifts.size >= 8, "지역별로 다른 설계도를 준다");
});

test("던전을 정복하면 개방되고, 개척 주기마다 영지에 정기 수익이 들어온다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const records = engine.state.adventure.records;
  assert.equal(records.north.dungeonOpened, false, "처음엔 어느 던전도 개방돼 있지 않다");

  // 개방 전에는 던전 수익이 없다.
  const scrapBefore = engine.state.meta.scrap;
  engine.collectOpenedDungeonIncome();
  assert.equal(engine.state.meta.scrap, scrapBefore, "개방 전에는 수익 없음");

  // 개방 후에는 주기마다 고철과 그 지역 재료가 들어온다.
  records.north.dungeonOpened = true;
  records.north.victories = 1;
  const frostIronBefore = engine.state.meta.materials.frostIron || 0;
  engine.collectOpenedDungeonIncome();
  assert.ok(engine.state.meta.scrap > scrapBefore, "개방된 던전이 고철을 벌어온다");
  assert.ok((engine.state.meta.materials.frostIron || 0) > frostIronBefore, "그 지역 재료도 들어온다");

  // 반복 공략할수록 수익이 오르지만 상한이 있다(무한 증가 방지).
  const oneClear = engine.state.meta.scrap;
  engine.collectOpenedDungeonIncome();
  const secondTick = engine.state.meta.scrap - oneClear;
  records.north.victories = 99;
  const beforeCapped = engine.state.meta.scrap;
  engine.collectOpenedDungeonIncome();
  const cappedTick = engine.state.meta.scrap - beforeCapped;
  assert.ok(cappedTick > secondTick, "클리어를 쌓으면 수익이 오른다");
  assert.ok(cappedTick <= 7, `회차 보너스에 상한이 있다 (실제 ${cappedTick})`);
});

test("v25 이전 저장본의 레벨과 보조 특성은 숙련·특성 슬롯으로 옮겨진다", () => {
  // 레벨 6짜리 동료 하나, 특성을 끼운 동료 하나, 아무것도 안 한 동료 하나.
  const legacy = {
    version: 25,
    adventure: {
      commander: { name: "개척자", level: 4, xp: 3 },
      unitProgress: {
        snow_guard: { level: 6, xp: 5, secondaryId: null },
        oath_knight: { level: 1, xp: 0, secondaryId: "oath" },
        desert_lancer: { level: 1, xp: 0, secondaryId: null }
      }
    }
  };

  const state = migrateState(legacy);
  const progress = state.adventure.unitProgress;

  // 레벨 6 = 숙련 5. 눈금이 1부터 0부터로 바뀐 만큼만 옮긴다.
  assert.equal(progress.snow_guard.mastery, 5);
  assert.equal(progress.snow_guard.xp, 5);
  assert.deepEqual(progress.snow_guard.traitIds, [null, null]);

  // 쓰던 특성은 1번 칸으로 옮기고, 그 칸이 열릴 만큼 숙련을 올려준다.
  // 마이그레이션이 이미 쓰던 걸 빼앗으면 안 된다.
  assert.equal(progress.oath_knight.traitIds[0], "oath");
  assert.ok(progress.oath_knight.mastery >= 2, "특성을 갖고 있으면 그 칸이 열린 숙련이 된다");
  assert.equal(masterySlots(progress.oath_knight.mastery) >= 1, true);

  assert.equal(progress.desert_lancer.mastery, 0);
  assert.equal(state.adventure.commander.mastery, 3);
  assert.equal(state.adventure.commander.level, undefined, "level 키는 남지 않는다");
  assert.equal(state.version, SAVE_VERSION);

  // 옮긴 뒤 실제로 특성이 발동한다 — 값만 옮기고 동작이 안 되면 의미가 없다.
  const battle = createAutoBattle("duneRaiders", "m", "field", ["oath_knight"], progress, {
    commander: createDefaultCommander()
  });
  const companion = battle.units.find((unit) => !unit.controlled);
  assert.ok(companion.heal >= SECONDARY_DEFS.oath.heal, "옮겨진 특성이 전투에서 실제로 작동한다");
});

// ==========================
// 특수 동료가 여는 다섯 시스템
// ==========================

function rescueSpecial(engine, regionId) {
  const adventure = engine.state.adventure;
  for (const unitId of WORLD_REGION_DEFS[regionId].recruits) {
    if (!adventure.roster.includes(unitId)) {
      adventure.roster.push(unitId);
      adventure.unitProgress[unitId] = newUnitProgress();
    }
  }
  return engine.rescueSpecialCompanion(regionId);
}

test("특수 동료는 그 지역 동료를 다 모은 뒤에야 구조된다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const adventure = engine.state.adventure;

  // 아직 북부 동료를 다 모으지 않았다 — 나타나지 않는다.
  assert.equal(engine.rescueSpecialCompanion("north"), null);
  assert.ok(!adventure.roster.includes("tower_architect"));

  assert.equal(rescueSpecial(engine, "north"), "tower_architect");
  assert.ok(adventure.roster.includes("tower_architect"));
  // 두 번 구조되지 않는다.
  assert.equal(engine.rescueSpecialCompanion("north"), null);
});

test("주술 각인 룬은 주술사를 구조해야 떨어지고, 살 수는 없다", () => {
  const engine = new GameEngine(new MemoryStorage());
  const commander = engine.state.adventure.commander;
  engine.state.meta.scrap = 999;

  // 여섯 번째 룬이지 상위 룬이 아니다 — 다른 다섯과 나란히 한 계열을 맡는다.
  assert.equal(RUNE_DEFS.hexRune.regionId, "south");
  assert.equal(engine.purchaseRune("hexRune"), false, "특수 룬은 고철로 살 수 없다");

  // 구조 전에는 아무리 굴려도 안 나온다.
  for (let seed = 1; seed <= 400; seed += 1) engine.rollSpecialRuneDrop("south", seed);
  assert.ok(!commander.runesOwned.includes("hexRune"), "구조 전에는 절대 안 나온다");

  rescueSpecial(engine, "south");
  let dropped = false;
  for (let seed = 1; seed <= 400 && !dropped; seed += 1) {
    dropped = engine.rollSpecialRuneDrop("south", seed) === "hexRune";
  }
  assert.equal(dropped, true, "구조 후에는 낮은 확률로 떨어진다");

  // 장착하면 상태이상 두 방향이 실제로 오른다.
  const bare = playerCombatStats(createDefaultCommander(), "crusader");
  assert.equal(engine.equipRune("hexRune"), true);
  const runed = playerCombatStats(commander, "crusader");
  assert.ok(runed.statusPotency > bare.statusPotency, "거는 상태이상이 강해진다");
  assert.ok(runed.statusResistance > bare.statusResistance, "받는 상태이상을 덜 탄다");
});

test("특수 단조는 등급이 정한 칸수를 한 칸 넘겨 새기고, 장비당 한 번뿐이다", () => {
  const engine = new GameEngine(new MemoryStorage());
  for (const key of Object.keys(engine.state.meta.materials)) engine.state.meta.materials[key] = 99999;
  const commander = engine.state.adventure.commander;
  commander.equipmentOwned = [{
    uid: "f1", defId: "heavyPlate", grade: "common",
    options: rollEquipmentOptions("chest", "common", 0, () => 0.5), enhance: 0, broken: false
  }];
  const instance = commander.equipmentOwned[0];
  const baseCount = instance.options.length;
  assert.equal(baseCount, EQUIPMENT_GRADE_DEFS.common.optionCount);

  // 대장장이를 구조하기 전에는 안 된다.
  assert.equal(engine.specialForgeEquipment("f1"), false);

  rescueSpecial(engine, "east");
  assert.equal(engine.specialForgeEquipment("f1"), true);
  assert.equal(instance.options.length, baseCount + 1, "등급 칸수를 한 칸 넘긴다");
  assert.equal(instance.options.at(-1).special, true);

  // 같은 키를 두 번 새기면 수치만 두 배가 된다.
  assert.equal(new Set(instance.options.map((o) => o.key)).size, instance.options.length, "옵션 키가 겹치지 않는다");
  assert.equal(engine.specialForgeEquipment("f1"), false, "장비당 한 번뿐이다");

  // 새긴 옵션이 실제 보너스로 들어간다.
  assert.ok(Object.keys(instanceBonuses(instance)).length >= baseCount + 1);
});

test("마탑은 원정 성공률을 올리고, 강령 횟수는 주기마다 다시 찬다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 999;

  assert.equal(engine.buildMageTower(), false, "설계자를 구조하기 전에는 못 짓는다");
  rescueSpecial(engine, "north");
  assert.equal(engine.buildMageTower(), true);

  const tower = engine.state.meta.estate.mageTower;
  assert.equal(tower.level, 1);
  assert.equal(mageTowerCharges(tower.level), 1);

  // 장전하지 않으면 아무 보정도 없다 — 지어두기만 해서는 소용없다.
  assert.equal(mageTowerSupport(tower, "suppress"), 0);
  assert.equal(engine.loadMageTowerSpell("blizzard"), true);

  // 마법이 상황을 가린다. 블리자드는 토벌에 강하고 탐사엔 약하다.
  const suppress = mageTowerSupport(tower, "suppress");
  const survey = mageTowerSupport(tower, "survey");
  assert.ok(suppress > survey, `블리자드는 토벌 쪽이 크다 (${survey} -> ${suppress})`);

  // 횟수를 다 쓰면 더는 안 붙는다.
  tower.chargesUsed = mageTowerCharges(tower.level);
  assert.equal(mageTowerSupport(tower, "suppress"), 0, "횟수를 다 쓰면 붙지 않는다");

  engine.advanceFrontierCycle();
  assert.equal(tower.chargesUsed, 0, "주기가 지나면 다시 찬다");
  assert.ok(mageTowerSupport(tower, "suppress") > 0);

  // 층을 올리면 횟수가 는다.
  assert.equal(engine.buildMageTower(), true);
  assert.equal(mageTowerCharges(engine.state.meta.estate.mageTower.level), 2);
});

test("복원 골렘은 분대장은 되지만 파티에는 들어가지 못한다", () => {
  const engine = new GameEngine(new MemoryStorage());
  for (const key of Object.keys(engine.state.meta.materials)) engine.state.meta.materials[key] = 99999;
  const adventure = engine.state.adventure;

  assert.equal(engine.buildGolem(), false, "고고학자를 구조하기 전에는 못 만든다");
  rescueSpecial(engine, "central");
  assert.equal(engine.buildGolem(), true);

  const golemId = adventure.roster.find((id) => id.startsWith(GOLEM_UNIT_ID));
  assert.ok(golemId, "명부에 올라간다");
  assert.ok(UNIT_DEFS[golemId], "정의가 미리 만들어져 있어 저장을 불러와도 남는다");

  // 파티에는 못 들어간다 — 늘어나는 건 화력이 아니라 동시 원정 수여야 한다.
  assert.equal(engine.togglePartyUnit(golemId), false);
  assert.ok(!adventure.party.includes(golemId));

  // 분대장 자리는 채운다.
  const wardens = engine.state.frontier.squads.find((squad) => squad.id === "wardens");
  wardens.unlocked = true;
  assert.equal(engine.assignUnitToFrontierSquad(golemId, "wardens"), true, "분대장은 될 수 있다");

  // 상한을 넘겨 찍을 수 없다.
  assert.equal(engine.buildGolem(), true);
  assert.equal(golemCount(adventure.roster), GOLEM_MAX_COUNT);
  assert.equal(engine.buildGolem(), false, "상한을 넘지 않는다");
});

test("선언된 재료는 모두 초기 상태에 존재한다", () => {
  // 키가 없으면 보유량이 undefined가 되어 소모·표시 계산이 조용히 어긋난다.
  // 실제로 보스 부산물 30종(golemCore, frostCore, durahanSoul 등)이 통째로
  // 빠져 있었고, 그 재료를 쓰는 제작이 전부 실패하고 있었다.
  const state = createInitialState();
  const missing = Object.keys(MATERIAL_DEFS).filter((id) => !(id in state.meta.materials));
  assert.deepEqual(missing, [], "선언된 재료가 초기 상태에 다 있어야 한다");
  for (const [id, amount] of Object.entries(state.meta.materials)) {
    assert.equal(typeof amount, "number", `${id}는 숫자여야 한다`);
    assert.ok(MATERIAL_DEFS[id], `${id}는 선언된 재료여야 한다`);
  }
});

test("방어구 다섯 부위는 각자 다른 옵션 풀을 갖고, 어느 한 부위가 정답이 되지 않는다", () => {
  const slots = ["helmet", "chest", "gloves", "boots", "cloak"];

  // 다섯 칸이 같은 풀을 쓰면 어느 칸에 무엇을 끼우든 결과가 같아져서
  // 다섯 칸이 사실상 한 칸이 된다.
  const signatures = slots.map((slot) => equipmentOptionPool(slot).map((o) => o.key).sort().join(","));
  assert.equal(new Set(signatures).size, slots.length, "부위마다 풀 구성이 달라야 한다");
  for (const slot of slots) {
    assert.ok(equipmentOptionPool(slot).length >= 4, `${slot} 풀이 너무 얕다`);
  }

  // 부위마다 실제로 낄 물건이 있어야 한다. 풀만 나누고 아이템이 없으면
  // 그 부위는 그냥 빈 칸이다.
  for (const slot of slots) {
    const items = Object.values(EQUIPMENT_DEFS).filter((def) => def.slot === slot && !LEGENDARY_DEFS[def.id] && !MYTHIC_GEAR_DEFS[def.id]);
    assert.ok(items.length >= 3, `${slot}에 제작 가능한 방어구가 부족하다 (${items.length}개)`);
    const classes = new Set(items.map((def) => def.armorClass));
    assert.ok(classes.size >= 3, `${slot}에 세 계열(버티기·굴리기·마력)이 다 있어야 한다`);
  }

  // 한 부위 안에서 세 계열의 성능이 크게 벌어지면 나머지 둘은 안 쓰인다.
  const bare = combatPowerScore(playerCombatStats(createDefaultCommander(), "crusader"));
  const score = (slot, defId) => {
    const commander = createDefaultCommander();
    commander.combatKitId = "crusader";
    commander.equipmentOwned = [{
      uid: "g", defId, grade: "mythic",
      options: rollEquipmentOptions(slot, "mythic", 3, () => 0.5), enhance: 0, broken: false
    }];
    commander.equipped[slot] = "g";
    return combatPowerScore(playerCombatStats(commander, "crusader")) - bare;
  };

  for (const slot of slots) {
    const values = Object.values(EQUIPMENT_DEFS)
      .filter((def) => def.slot === slot && !LEGENDARY_DEFS[def.id] && !MYTHIC_GEAR_DEFS[def.id])
      .map((def) => score(slot, def.id));
    const low = Math.min(...values);
    const high = Math.max(...values);
    assert.ok(high <= low * 1.35,
      `${slot} 안에서 계열 간 성능 차가 35%를 넘는다 (${low} ~ ${high})`);
    assert.ok(low > 0, `${slot}의 모든 방어구가 전투력을 올려야 한다`);
  }
});

test("특수 시설 UI가 부르는 엔진 동작 네 가지가 모두 실제로 작동한다", () => {
  // 화면에 버튼을 붙여도 엔진 쪽이 거절하면 아무 일도 일어나지 않는다.
  // 네 동작 전부 "구조 전 거부 → 구조 후 성공"까지 확인한다.
  const engine = new GameEngine(new MemoryStorage());
  const adventure = engine.state.adventure;
  const commander = adventure.commander;
  engine.state.meta.scrap = 999;
  for (const key of Object.keys(engine.state.meta.materials)) engine.state.meta.materials[key] = 999;

  // 구조 전에는 넷 다 거부된다.
  assert.equal(engine.buildMageTower(), false);
  assert.equal(engine.loadMageTowerSpell("blizzard"), false, "마탑이 없으면 장전도 안 된다");
  assert.equal(engine.buildGolem(), false);
  commander.equipmentOwned = [{ uid: "e1", defId: "heavyPlate", grade: "common", options: [], enhance: 0, broken: false }];
  assert.equal(engine.specialForgeEquipment("e1"), false);

  const rescue = (regionId) => {
    for (const unitId of WORLD_REGION_DEFS[regionId].recruits) {
      if (!adventure.roster.includes(unitId)) {
        adventure.roster.push(unitId);
        adventure.unitProgress[unitId] = newUnitProgress();
      }
    }
    return engine.rescueSpecialCompanion(regionId);
  };
  rescue("north");
  rescue("east");
  rescue("central");

  // 마탑: 짓고 → 장전하고 → 원정에 실린다.
  assert.equal(engine.buildMageTower(), true);
  assert.equal(engine.loadMageTowerSpell("blizzard"), true);
  const tower = engine.state.meta.estate.mageTower;
  assert.ok(mageTowerSupport(tower, "suppress") > 0, "장전하면 성공률 보정이 붙는다");
  assert.equal(engine.loadMageTowerSpell(null), true, "장전 해제도 된다");
  assert.equal(mageTowerSupport(tower, "suppress"), 0);

  // 골렘: 만들고 → 명부에 오르고 → 편성은 거부된다.
  assert.equal(engine.buildGolem(), true);
  const golemId = adventure.roster.find((id) => id.startsWith(GOLEM_UNIT_ID));
  assert.ok(golemId);
  assert.equal(engine.togglePartyUnit(golemId), false, "골렘은 파티에 못 들어간다");

  // 특수 단조: 옵션이 한 칸 늘고, 한 번뿐이다.
  const before = commander.equipmentOwned[0].options.length;
  assert.equal(engine.specialForgeEquipment("e1"), true);
  assert.equal(commander.equipmentOwned[0].options.length, before + 1);
  assert.equal(engine.specialForgeEquipment("e1"), false, "장비당 한 번뿐이다");
});

test("오프라인 정산은 느리게 돌고, 귀한 재료일수록 덜 나오고, 창고에서 잘린다", () => {
  const build = ({ hours, warehouseLevel = 0, towerLevel = 0, preFillWood = 0 }) => {
    const storage = new MemoryStorage();
    const engine = new GameEngine(storage);
    engine.state.meta.estate.workers.lumberjack = 5;
    engine.state.meta.estate.workers.miner = 5;
    engine.state.meta.estate.warehouseLevel = warehouseLevel;
    engine.state.meta.estate.mageTower = { level: towerLevel, loadedSpellId: null, chargesUsed: 0 };
    if (preFillWood) engine.state.meta.materials.wood = preFillWood;
    engine.save();
    const saved = JSON.parse(storage.getItem(SAVE_KEY));
    saved.meta.savedAt = Date.now() - hours * 3600000;
    storage.setItem(SAVE_KEY, JSON.stringify(saved));
    return new GameEngine(storage);
  };

  // 잠깐 껐다 켠 것까지 보고서를 띄우면 성가시다.
  assert.equal(build({ hours: 0.1 }).offlineReport, null, "짧은 이탈은 정산하지 않는다");

  const eight = build({ hours: 8 }).offlineReport;
  assert.ok(eight, "8시간이면 정산한다");
  assert.ok(eight.gained.wood > 0, "일꾼 생산은 자리를 비워도 돈다");

  // 오프라인이 온라인보다 이득이면 게임을 안 켜는 게 최선이 된다.
  const online = new GameEngine(new MemoryStorage());
  online.state.meta.estate.workers.lumberjack = 5;
  const beforeWood = online.state.meta.materials.wood;
  advanceEstate(online.state, eight.turns);
  const onlineGain = online.state.meta.materials.wood - beforeWood;
  assert.ok(eight.gained.wood < onlineGain,
    `오프라인이 온라인보다 적어야 한다 (오프 ${eight.gained.wood} vs 온 ${onlineGain})`);

  // 창고가 상한이다. 총량이 아니라 종류별이라 흔한 재료가 귀한 것 자리를 안 뺏는다.
  const cramped = build({ hours: 48, warehouseLevel: 0, preFillWood: 115 }).offlineReport;
  assert.ok(cramped.overflowed.wood > 0, "창고가 차면 넘친 만큼 버려진다");
  assert.equal(
    cramped.gained.wood + 115, warehouseCap(0),
    "상한까지만 담긴다"
  );
  const roomy = build({ hours: 48, warehouseLevel: 3, preFillWood: 115 }).offlineReport;
  assert.ok(roomy.gained.wood > cramped.gained.wood, "창고를 키우면 더 담긴다");
  assert.equal(Object.keys(roomy.overflowed).length, 0, "넉넉하면 안 넘친다");

  // 마탑이 오프라인 원정 수급률을 끌어올린다 — 30%에서 60%까지.
  assert.equal(offlineExpeditionRate(0), 0.3);
  assert.ok(Math.abs(offlineExpeditionRate(3) - 0.6) < 1e-9, "3층이면 60%");
  assert.ok(offlineExpeditionRate(3) > offlineExpeditionRate(0), "층을 올리면 오른다");
});

test("보스 부산물은 자면서 쌓이지 않는다", () => {
  // 이게 뚫리면 파밍이 통째로 무의미해진다. 지역 보스 재료는 0이어야 한다.
  assert.equal(materialRarity("frostIron"), "fine", "설철은 심층광산 산출물이라 최소 고급이다");
  assert.equal(OFFLINE_YIELD_BY_RARITY.mythic, 0, "신화 재료는 오프라인에 안 나온다");

  // 지역 보스는 전용 재료를 떨군다 — 필드 보스와 겹치지 않는다.
  assert.equal(materialRarity("titanCore"), "mythic", "타이탄 전용 재료는 신화다");
  assert.equal(materialRarity("dragonScale"), "legendary", "고룡 비늘은 필드 보스 몫으로 남았다");
  assert.equal(materialRarity("spiderFang"), "legendary", "필드 보스만 떨구는 것은 전설이다");
  assert.equal(OFFLINE_YIELD_BY_RARITY.legendary, 0, "전설 재료는 자면서 안 나온다");
  assert.equal(OFFLINE_YIELD_BY_RARITY.rare, 0, "희귀(2차 가공)도 직접 해야 한다");

  assert.equal(materialRarity("wood"), "normal");

  // 등급이 어느 쪽에도 안 잡힌 재료가 있으면 조용히 common으로 새어 나간다.
  for (const id of Object.keys(MATERIAL_DEFS)) {
    assert.ok(MATERIAL_RARITY_ORDER.includes(materialRarity(id)), `${id} 등급 불명`);
  }
});

test("창고 증축은 고철을 쓰고 상한을 올린다", () => {
  const engine = new GameEngine(new MemoryStorage());
  engine.state.meta.scrap = 999;
  assert.equal(warehouseCap(0), WAREHOUSE_LEVEL_CAP[0]);

  for (let level = 1; level <= WAREHOUSE_MAX_LEVEL; level += 1) {
    assert.equal(engine.upgradeWarehouse(), true, `${level}단계 증축`);
    assert.equal(engine.state.meta.estate.warehouseLevel, level);
  }
  assert.equal(engine.upgradeWarehouse(), false, "최대치를 넘지 않는다");

  // 고철이 없으면 못 올린다.
  const poor = new GameEngine(new MemoryStorage());
  poor.state.meta.scrap = 0;
  assert.equal(poor.upgradeWarehouse(), false);
});

test("마탑은 오프라인 고철을 늘리지만 보스 재료를 열지는 않는다", () => {
  // 마탑이 귀한 재료를 뚫어주는 안을 넣어봤다가 걷어냈다 — 3층에서 지역 보스
  // 재료가 실제로 나오는 걸 재보니 과했다. 그 결정을 여기서 잠근다.
  const run = (towerLevel) => {
    const storage = new MemoryStorage();
    const engine = new GameEngine(storage);
    for (const worker of Object.keys(engine.state.meta.estate.workers)) {
      engine.state.meta.estate.workers[worker] = 3;
    }
    engine.state.meta.estate.warehouseLevel = 3;
    engine.state.meta.estate.mageTower = { level: towerLevel, loadedSpellId: null, chargesUsed: 0 };
    for (const record of Object.values(engine.state.adventure.records)) {
      record.dungeonOpened = true;
      record.victories = 5;
    }
    engine.save();
    const saved = JSON.parse(storage.getItem(SAVE_KEY));
    saved.meta.savedAt = Date.now() - 24 * 3600000;
    storage.setItem(SAVE_KEY, JSON.stringify(saved));
    return new GameEngine(storage).offlineReport;
  };

  const none = run(0);
  const full = run(3);

  // 마탑이 하는 일: 원정 수급률을 30%에서 60%로 끌어올린다.
  assert.ok(full.scrap > none.scrap * 1.8,
    `마탑 3층이면 고철이 두 배 가까이 (${none.scrap} -> ${full.scrap})`);

  // 마탑이 하지 않는 일: 보스 재료를 여는 것.
  for (const report of [none, full]) {
    const rare = Object.keys(report.gained).filter((id) => !["normal", "fine"].includes(materialRarity(id)));
    assert.deepEqual(rare, [], `보스 재료가 오프라인에 나왔다: ${rare.join(", ")}`);
  }
});

test("환상종 재료는 발견지에서 나와 가공까지 이어진다", () => {
  // 등급만 정하고 손에 넣을 길이 없으면 죽은 데이터다. 사슬 전체를 확인한다:
  //   발견지 → 채집(고급) → 제련/조제(희귀)
  const fantasyRaw = ["orichalcum", "mithril", "adamantite", "moonpetal", "emberroot"];

  // 1. 모든 환상종 원재료에 발견지가 있다.
  const siteMaterials = new Set();
  for (const site of Object.values(DISCOVERY_SITE_DEFS)) {
    siteMaterials.add(site.materialId);
    for (const id of Object.values(site.materialByRegion || {})) siteMaterials.add(id);
  }
  for (const id of fantasyRaw) {
    assert.ok(siteMaterials.has(id), `${id}를 주는 발견지가 없다`);
  }

  // 2. 지역이 겹치지 않는다 — 한 지역만 돌아도 다 모이면 다섯 지역을 열 이유가 준다.
  const byRegion = {};
  for (const site of Object.values(DISCOVERY_SITE_DEFS)) {
    for (const [regionId, materialId] of Object.entries(site.materialByRegion || {})) {
      if (!fantasyRaw.includes(materialId)) continue;
      assert.ok(!byRegion[regionId], `${regionId}에 환상종이 둘이다`);
      byRegion[regionId] = materialId;
    }
  }
  assert.equal(Object.keys(byRegion).length, 5, "다섯 지역에 하나씩 흩어져 있다");

  // 3. 광물은 제련되어야 한다. 약재는 조제 쪽이라 제련표에 없는 게 맞다.
  for (const id of ["orichalcum", "mithril", "adamantite"]) {
    assert.ok(ORE_SMELTING_DEFS[id], `${id}에 제련 경로가 없다`);
    const outputs = Object.keys(ORE_SMELTING_DEFS[id]);
    assert.equal(outputs.length, 1, `${id}는 1:1로만 나와야 한다 — 부산물이 붙으면 일반 광석보다 이득이 된다`);
  }

  // 4. 위험이 기존 특수 광산보다 높다. 산출 1에 일꾼 셋인데 위험까지 낮으면
  //    다른 발견지를 지을 이유가 사라진다.
  assert.ok(DISCOVERY_SITE_DEFS.fantasyVein.risk > DISCOVERY_SITE_DEFS.deepMine.risk,
    "환상 광맥이 심층광산보다 위험해야 한다");
});

test("신화 장비는 아홉 칸을 채우고 부위마다 전설의 상위 호환이다", () => {
  const pieces = Object.values(MYTHIC_GEAR_DEFS);
  assert.equal(pieces.length, 14, "무기 6 + 방어구 5 + 장신구 3");

  // 아홉 칸이 다 채워져야 "세트"다. 전설은 몸통·무기·장신구뿐이라
  // 투구·장갑·신발·망토는 제작품이 최종이었다.
  const slots = new Set(pieces.map((p) => p.slot));
  assert.deepEqual([...slots].sort(),
    ["boots", "chest", "cloak", "gloves", "helmet", "necklace", "ring", "weapon"].sort());

  // 무기는 여섯 직업에 하나씩. 한 직업이 둘을 갖지 않는다.
  const weapons = pieces.filter((p) => p.slot === "weapon");
  assert.equal(weapons.length, 6);
  assert.equal(new Set(weapons.map((w) => w.baseClassId)).size, 6);

  const bare = combatPowerScore(playerCombatStats(createDefaultCommander(), "crusader"));
  const score = (slot, defId) => {
    const commander = createDefaultCommander();
    commander.combatKitId = "crusader";
    commander.equipmentOwned = [{
      uid: "g", defId, grade: "mythic",
      options: rollEquipmentOptions(slot, "mythic", 3, () => 0.5), enhance: 0, broken: false
    }];
    commander.equipped[slot === "ring" ? "ring1" : slot] = "g";
    return combatPowerScore(playerCombatStats(commander, "crusader")) - bare;
  };

  // 각 부위에서 기존 최고보다 위이되, 크게 벌어지면 전설을 낄 이유가 사라진다.
  for (const piece of pieces) {
    if (piece.baseClassId && piece.baseClassId !== "crusader") continue;
    const rivals = Object.values(EQUIPMENT_DEFS).filter((def) =>
      def.slot === piece.slot && !MYTHIC_GEAR_DEFS[def.id]
      && (!def.baseClassId || def.baseClassId === "crusader"));
    const best = Math.max(...rivals.map((def) => score(piece.slot, def.id)));
    const mine = score(piece.slot, piece.id);
    assert.ok(mine > best, `${piece.name}이 기존 최고(${best})보다 못하다 (${mine})`);
    assert.ok(mine <= best * 1.4,
      `${piece.name}이 기존 최고보다 40% 넘게 세다 (${best} -> ${mine})`);
  }
});

test("신화 세트는 조각을 모을수록 단계로 붙는다", () => {
  // 아홉 개를 다 모아야 열리면 여덟 개까지 아무 보상이 없어 도중에 포기한다.
  assert.deepEqual(mythicSetBonus(2), {}, "두 조각으론 아직 아무것도 없다");
  const three = mythicSetBonus(3);
  const six = mythicSetBonus(6);
  const nine = mythicSetBonus(9);
  assert.ok(Object.keys(three).length > 0, "세 조각에서 첫 단계가 열린다");
  assert.ok(Object.keys(six).length > Object.keys(three).length, "여섯 조각에서 늘어난다");
  assert.ok(nine.armorFlat > six.armorFlat, "아홉 조각이 가장 크다");

  // 실제 전투 능력치에 반영되는지 — 값만 계산하고 안 붙으면 의미가 없다.
  const build = (count) => {
    const ids = ["crusaderMythicSword", "mythicHelm", "mythicChest", "mythicGauntlets",
      "mythicBoots", "mythicCloak", "mythicRingCore", "mythicRingSeal", "mythicNecklace"];
    const commander = createDefaultCommander();
    commander.combatKitId = "crusader";
    commander.equipmentOwned = [];
    ids.slice(0, count).forEach((defId, index) => {
      const def = EQUIPMENT_DEFS[defId];
      const uid = `m${index}`;
      commander.equipmentOwned.push({ uid, defId, grade: "mythic", options: [], enhance: 0, broken: false });
      commander.equipped[def.slot === "ring" ? (commander.equipped.ring1 ? "ring2" : "ring1") : def.slot] = uid;
    });
    return equippedBonuses(commander, "crusader");
  };
  assert.ok(build(3).armorFlat > build(2).armorFlat + 1,
    "세 번째 조각에서 세트 보너스가 실제 스탯에 붙는다");
});

test("신화 장비는 다섯 지역 보스를 모두 잡아야 완성된다", () => {
  // 한 보스만 반복해서 세트를 끝낼 수 있으면 다섯을 다 잡을 이유가 없다.
  const bossOf = {};
  for (const [id, def] of Object.entries(ENEMY_COMBATANTS)) {
    if (!def.boss || def.fieldTier || !def.byproducts) continue;
    for (const material of Object.keys(def.byproducts)) bossOf[material] = id;
  }

  const usedBosses = new Set();
  for (const piece of Object.values(MYTHIC_GEAR_DEFS)) {
    const bosses = new Set(Object.keys(piece.materials).map((m) => bossOf[m]).filter(Boolean));
    assert.equal(bosses.size, 2,
      `${piece.name}은 두 보스의 재료를 요구해야 한다 (지금 ${bosses.size})`);
    for (const boss of bosses) usedBosses.add(boss);
    // 신화 재료만 쓴다 — 제작 재료가 섞이면 등급 구분이 흐려진다.
    for (const material of Object.keys(piece.materials)) {
      assert.equal(materialRarity(material), "mythic", `${piece.name}이 ${material}(비신화)을 쓴다`);
    }
  }
  assert.equal(usedBosses.size, 5, "다섯 지역 보스가 모두 쓰인다");
});
