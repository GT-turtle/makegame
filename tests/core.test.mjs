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
  workerProficiency
} from "../src/core.js";
import { ITEM_DEFS, MATERIAL_DEFS } from "../src/data.js";
import { EQUIPMENT_DEFS, EQUIPMENT_GRADES, equippedBonuses, slotsAcceptingItem, EQUIPMENT_GRADE_DEFS, EQUIPMENT_OPTION_POOLS, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_DEFS, createEmptyEquipped, equipmentSlotsByCategory, instanceBonuses, playerCombatStats, rollCraftGrade, rollEquipmentOptions } from "../src/classes.js";
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
  assert.match(migrated.state.log[0].text, /직접 조작|다섯 지역|광역 지도 개편|세부 개척 지도|다단계 수성전|장비·광석·특수·기타|실제 생산 시간|생활권|불규칙 습격|토벌|동행 부대|기본 직업 고유 패시브|피격 회복|신성·자연 친화도|분대 병력|무기·방어구·장신구|투구·갑옷·장갑|등급\(일반~신화\)|반지 두 칸/);
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
  const armorKeys = EQUIPMENT_OPTION_POOLS.armor.map((entry) => entry.key);
  const weaponKeys = EQUIPMENT_OPTION_POOLS.weapon.map((entry) => entry.key);

  let seed = 7;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  for (let i = 0; i < 40; i += 1) {
    const armor = rollEquipmentOptions("chest", "rare", 1, rng);
    assert.ok(armor.every((entry) => armorKeys.includes(entry.key)), "방어구 옵션은 방어구 풀에서만 나온다");
    assert.equal(new Set(armor.map((e) => e.key)).size, armor.length, "같은 스탯이 두 번 붙지 않는다");

    const weapon = rollEquipmentOptions("weapon", "fine", 1, rng);
    assert.ok(weapon.every((entry) => weaponKeys.includes(entry.key)));

    for (const entry of [...armor, ...weapon]) {
      const pool = [...EQUIPMENT_OPTION_POOLS.armor, ...EQUIPMENT_OPTION_POOLS.weapon]
        .find((option) => option.key === entry.key);
      assert.ok(entry.value >= pool.min - 1e-9 && entry.value <= pool.max + 1e-9,
        `${entry.key}=${entry.value}가 ${pool.min}~${pool.max} 범위를 벗어난다`);
    }
  }

  // 풀보다 옵션 칸이 많으면 붙일 수 있는 만큼만 붙는다(방어구 풀은 2개뿐).
  assert.equal(rollEquipmentOptions("chest", "mythic", 0, rng).length, EQUIPMENT_OPTION_POOLS.armor.length);
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
