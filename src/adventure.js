import { ARMOR_SET_DEFS, EQUIPMENT_DEFS, LEGENDARY_CLEAR_REQUIREMENT, legendariesForRegion, PLAYER_BASE_CLASS_DEFS, normalizedPlayerLoadout, playerBaseClassDefinition, playerCombatStats, playerKitDefinition, playerSkillDefinition, playerUltimateDefinition } from "./classes.js";

export const FIELD_SIZE = 41;
export const DUNGEON_SIZE = 15;
export const FIELD_VIEW_SIZE = 11;
export const DUNGEON_VIEW_SIZE = 11;

// 전투 아레나 경계. 기존에는 x 5~95 / y 9~91 값이 이동·넉백·끌어당김 등
// 여러 곳에 그대로 박혀 있었는데, 필드를 디아블로식으로 넓게 쓰려면 전투마다
// 크기가 달라져야 해서 battle.bounds로 뽑아냈다. ARENA_BOUNDS는 기존 조우
// 전투(양쪽이 마주보는 좁은 아레나)의 기본값이라 수치가 그대로다.
// (기존 코드에 y 경계가 8~92와 9~91 두 가지로 섞여 있었다 — 실제 위치 클램프는
// 전부 8~92였고 moveBattlePlayer의 목표 지점 지정만 9~91이었다. 의도된 구분이
// 아니라 단순 불일치라 위치 클램프 쪽 값으로 통일했다.)
export const ARENA_BOUNDS = { minX: 5, maxX: 95, minY: 8, maxY: 92 };

// 전투 중 확률 판정(회피·치명타·정령크루 패시브 발동 등)은 전부 이걸 쓴다.
// 예전에는 전역 Math.random()을 직접 호출해서, 전투와 무관한 테스트를 추가하기만
// 해도 전역 PRNG 소비 순서가 바뀌어 특정 테스트가 간헐적으로 실패했다.
// battle.rollSeed가 있으면 전투마다 결정적인 수열을 쓰고, 없으면 기존처럼
// Math.random()으로 떨어져서 실제 플레이는 계속 무작위다.
export function battleRoll(battle) {
  if (!battle || battle.rollSeed == null) return Math.random();
  battle.rollCount = (battle.rollCount || 0) + 1;
  return mulberry32(battle.rollSeed + battle.rollCount * 2654435761)();
}

export function clampToArena(bounds, x, y) {
  const box = bounds || ARENA_BOUNDS;
  return {
    x: Math.max(box.minX, Math.min(box.maxX, x)),
    y: Math.max(box.minY, Math.min(box.maxY, y))
  };
}

// 장애물(바위·잔해 등)은 원형으로만 표현한다. 격자 벽이 아니라 원이라서
// 연속 좌표계에서 밀어내기 계산이 단순하고, 어느 방향에서 부딪혀도 자연스럽게
// 미끄러진다.
// 안으로 파고든 위치를 가장 가까운 가장자리로 밀어내는 방식이라, 벽에 붙어
// 비스듬히 움직이면 막히지 않고 표면을 따라 흐른다.
export function resolveObstacles(obstacles, x, y, radius = 1.5) {
  if (!obstacles?.length) return { x, y };
  let nextX = x;
  let nextY = y;
  for (const obstacle of obstacles) {
    const dx = nextX - obstacle.x;
    const dy = nextY - obstacle.y;
    const minDistance = obstacle.radius + radius;
    const distance = Math.hypot(dx, dy);
    if (distance >= minDistance) continue;
    if (distance < 0.001) {
      // 정확히 중심에 겹친 예외 상황 — 방향이 없으므로 임의로 위쪽으로 뺀다.
      nextY = obstacle.y - minDistance;
      continue;
    }
    nextX = obstacle.x + (dx / distance) * minDistance;
    nextY = obstacle.y + (dy / distance) * minDistance;
  }
  return { x: nextX, y: nextY };
}

// 경계 클램프와 장애물 밀어내기를 함께 적용한다. 이동 계산은 전부 이 함수를
// 거치게 해서 "경계는 지켰는데 바위는 통과" 같은 누락이 안 생기게 한다.
export function resolveMove(battle, x, y) {
  const clamped = clampToArena(battle?.bounds, x, y);
  const pushed = resolveObstacles(battle?.obstacles, clamped.x, clamped.y);
  return clampToArena(battle?.bounds, pushed.x, pushed.y);
}

// 디아블로식 광역 전장. 기존 조우 아레나(90×84)의 약 4배 폭으로, 화면 전환
// 없이 필드를 돌아다니며 흩어진 몬스터 무리와 싸우고 던전 입구까지 걸어가는
// 공간이다. 여기서만 쓰는 별도 상수라 기존 조우 전투 크기는 그대로 유지된다.
export const FIELD_BOUNDS = { minX: 5, maxX: 395, minY: 8, maxY: 292 };

// 몬스터 무리가 "깨어나는" 거리. 이 거리 밖에서는 적이 플레이어를 추격하지도
// 공격하지도 않아서, 넓은 전장을 한 번에 다 어그로 끌지 않고 무리 단위로
// 차례차례 교전하게 된다.
export const FIELD_AGGRO_RADIUS = 26;

export const ATTACK_TELEGRAPH_MS = 320;

// 회피 버튼의 성격은 직업마다 다르다.
// 크루세이더는 방패를 세워 버티고(이동 없음, 대신 감소량이 크고 오래간다),
// 나머지는 앞으로 파고드는 이동기다(예고 장판을 보고 빠져나오는 용도).
//
// 이동 거리와 감소량은 서로 맞바꾼 값이다 — 이동으로 피할 수 있으면 감소가 덜 필요하고,
// 못 피하는 대신 버티는 쪽은 감소가 커야 한다.
export const PLAYER_DODGE_DEFS = {
  block: {
    type: "block", name: "방패 막기", durationMs: 1500, reduction: 0.85, cooldownMs: 4200,
    logSuffix: "방패를 세워 받는 피해를 크게 줄인다"
  },
  dash: {
    type: "dash", name: "회피 기동", durationMs: 900, reduction: 0.7, cooldownMs: 4200,
    distance: 24, logSuffix: "앞으로 파고들며 잠시 피해 감소"
  }
};

// 크루세이더 계열(기본 직업이 crusader)만 방패 막기를 쓴다.
export function playerDodgeDefinition(kitId) {
  const baseClassId = kitId ? playerKitDefinition(kitId).baseClassId : null;
  return baseClassId === "crusader" ? PLAYER_DODGE_DEFS.block : PLAYER_DODGE_DEFS.dash;
}

// ── 보스 패턴 ────────────────────────────────────────────────────────────────
//
// 보스 공격의 핵심은 **예고 장판**이다. 바닥에 위험 지역을 미리 띄우고 일정 시간 뒤에
// 터뜨린다. 플레이어는 그 사이에 걸어 나가거나 회피기로 빠져나온다.
// 그래서 "다가와서 때린다"가 아니라 "예고를 보고 피한다"가 된다.
//
// 패턴은 코드가 아니라 데이터다. 새 보스는 여기서 패턴 id만 골라 담으면 된다.
export const BOSS_PATTERN_DEFS = {
  groundSlam: {
    id: "groundSlam", name: "대지 강타", kind: "circle",
    // 예고 시간 × 플레이어 이동속도(17)가 "도망칠 수 있는 거리"다.
    // 반경 15 < 도달 거리 17.9라서 보고 걸어 나가면 빠져나올 수 있고,
    // 가만히 서 있으면 반드시 맞는다. 이 관계가 패턴 난이도의 기준이다.
    telegraphMs: 1050,
    radius: 15,
    damageMultiplier: 1.7,
    cooldownMs: 6200,
    // 플레이어의 현재 위치에 깔린다. 예고 중에 움직이면 피해진다.
    aim: "target"
  }
};

export function bossPatternDefinition(patternId) {
  return BOSS_PATTERN_DEFS[patternId] || null;
}

// 보스가 지금 쓸 수 있는 패턴을 고른다. 패턴마다 개별 쿨다운이 있어서
// 같은 패턴이 연달아 나오지 않는다.
function pickBossPattern(battle, actor) {
  const ready = (actor.patterns || [])
    .map((patternId) => BOSS_PATTERN_DEFS[patternId])
    .filter((pattern) => pattern && (actor.patternReadyAt?.[pattern.id] || 0) <= battle.elapsed);
  if (!ready.length) return null;
  return ready[Math.floor(battleRoll(battle) * ready.length) % ready.length];
}

// 예고 장판을 깐다. 이 시점에는 피해가 없고, fireAt이 되어야 터진다.
function spawnBossZone(battle, actor, pattern, target) {
  const center = pattern.aim === "self" ? actor : target;
  battle.zones.push({
    id: `zone-${battle.zoneSeq = (battle.zoneSeq || 0) + 1}`,
    ownerId: actor.id,
    patternId: pattern.id,
    name: pattern.name,
    kind: pattern.kind,
    x: center.x,
    y: center.y,
    radius: pattern.radius,
    damageMultiplier: pattern.damageMultiplier,
    status: pattern.status || null,
    bornAt: battle.elapsed,
    fireAt: battle.elapsed + pattern.telegraphMs
  });
  actor.patternReadyAt ||= {};
  actor.patternReadyAt[pattern.id] = battle.elapsed + pattern.cooldownMs;
  // 시전 중에는 움직이거나 평타를 치지 않는다 — 예고와 본체 행동이 겹치면
  // 무엇을 보고 피해야 하는지 알 수 없게 된다.
  actor.castingUntil = battle.elapsed + pattern.telegraphMs;
  pushBattleLog(battle, `${actor.name}: ${pattern.name} 준비`);
}

// 시간이 된 장판을 터뜨린다. 범위 안에 있는 플레이어·동료가 맞는다.
function advanceBossZones(battle) {
  if (!battle.zones?.length) return;
  const remaining = [];
  for (const zone of battle.zones) {
    if (battle.elapsed < zone.fireAt) { remaining.push(zone); continue; }

    const owner = battle.enemies.find((enemy) => enemy.id === zone.ownerId);
    const hit = living(battle.units).filter((unit) => distanceBetween(zone, unit) <= zone.radius);
    if (owner) {
      for (const unit of hit) {
        // 회피 중이면 장판도 회피 감소를 받는다(방패 막기로 버티는 선택지가 살아 있게).
        const dodging = unit.id === battle.playerId && battle.playerDodgeUntil > battle.elapsed;
        const reduction = dodging ? 1 - playerDodgeDefinition(battle.playerKitId).reduction : 1;
        const damage = damageCombatant(owner, unit, zone.damageMultiplier * reduction);
        if (zone.status) applyCombatStatus(battle, unit, zone.status, owner);
        if (unit.id === battle.playerId) battle.playerHitFlash = battle.elapsed;
        pushBattleLog(battle, `${zone.name}: ${unit.name}이 ${damage} 피해`);
      }
    }
    if (!hit.length) pushBattleLog(battle, `${zone.name}: 아무도 맞지 않았다`);
  }
  battle.zones = remaining;
}
export const PARTY_LIMIT = 2;
// Scales each companion's own maxHp/damage by the player's level growth rate, so their
// power tracks the player live instead of an independent per-companion level table.
// Tuned empirically so combat-focused companions (탱커/딜러) narrowly win a 1v1 against a
// standard-tier enemy; pure-utility/healer companions are intentionally left weaker solo.
export const COMPANION_POWER_MULTIPLIER = 1.15;
export const STARTING_ROSTER = ["snow_guard", "venom_tracker", "formation_officer", "oath_knight", "desert_lancer"];
export const STARTING_PARTY = ["snow_guard", "oath_knight"];

export const STATUS_EFFECT_DEFS = {
  decay: { id: "decay", name: "부패", glyph: "☣", durationMs: 8000, tickMs: 1200, damage: 1, maxStacks: 1, description: "지속 피해와 받는 회복 감소. 중병기 변형은 방어력도 깎는다." },
  poison: { id: "poison", name: "독", glyph: "♢", durationMs: 10000, tickMs: 2000, damage: 1, maxStacks: 5, description: "약하지만 오래 남으며 최대 5회 중첩된다. 중첩마다 이동·행동 속도가 느려진다." },
  bleed: { id: "bleed", name: "출혈", glyph: "⌁", durationMs: 9000, tickMs: 1000, damage: 1, maxStacks: 5, description: "최대 5회 중첩되며 중첩마다 초당 피해가 증가한다." },
  stun: { id: "stun", name: "기절", glyph: "✹", durationMs: 1200, maxStacks: 1, description: "짧은 시간 이동과 행동을 멈춘다." },
  frost: { id: "frost", name: "빙결", glyph: "❄", durationMs: 5200, maxStacks: 3, description: "중첩마다 이동·행동이 느려지고 3중첩에서 잠시 완전히 언다." },
  burn: { id: "burn", name: "화상", glyph: "♨", durationMs: 3400, tickMs: 700, damage: 3, maxStacks: 1, description: "중첩되지 않는 짧고 강한 피해. 재적용하면 지속시간만 갱신된다." }
};

export const PLAYER_COMBAT_DEF = {
  id: "player_commander",
  name: "개척자",
  role: "직접 조작",
  glyph: "◆",
  color: "#7fb4cf",
  maxHp: 48,
  damage: 8,
  range: 11,
  speed: 18,
  attackMs: 620,
  armor: 0.16,
  portraitIndex: 0
};

export const REGION_PORTRAIT_INDEX = { north: 1, south: 2, east: 3, west: 4, central: 5 };

export const SECONDARY_DEFS = {
  survival: { id: "survival", name: "설원 생존", glyph: "❄", description: "체력과 방어가 증가하지만 공격 속도가 조금 느려진다.", hpBonus: 0.12, armorBonus: 0.04, attackMsBonus: 80 },
  poison: { id: "poison", name: "독성 운용", glyph: "♢", description: "공격에 약한 중독을 부여한다.", poisonDamage: 1 },
  forging: { id: "forging", name: "단조 무장", glyph: "⚒", description: "피해와 방어가 함께 증가한다.", damageBonus: 0.1, armorBonus: 0.03 },
  oath: { id: "oath", name: "서약", glyph: "✧", description: "주기적으로 가장 다친 아군을 회복한다.", heal: 3, healMs: 4200 },
  mobility: { id: "mobility", name: "유목 기동", glyph: "➶", description: "이동과 공격 속도가 증가한다.", speedBonus: 0.16, attackMsBonus: -90 },
  spirit: { id: "spirit", name: "정령 교감", glyph: "♧", description: "아군 전체에 얇은 정령 갑옷을 부여한다.", partyArmor: 0.03 },
  tactics: { id: "tactics", name: "진법", glyph: "陣", description: "흩어져 싸우는 동료에게 공격과 방어 보정을 준다.", damageBonus: 0.05, partyArmor: 0.02 },
  alchemy: { id: "alchemy", name: "연금술", glyph: "⚗", description: "회복과 독 운용을 함께 보조한다.", heal: 2, healMs: 5000, poisonDamage: 1 },
  mana: { id: "mana", name: "마나 순환", glyph: "✦", description: "공격력이 크게 증가하지만 최대 체력이 감소한다.", damageBonus: 0.18, hpBonus: -0.08 }
};

export const WORLD_REGION_DEFS = {
  north: {
    id: "north", direction: "북부", name: "북부 설산", subtitle: "북유럽과 루스풍의 눈 덮인 변경",
    description: "방패벽과 중무기, 혹한 생존술이 발달한 산악권. 눈보라 속 폐광의 빙맥 거상을 추적한다.",
    glyph: "❄", accent: "#79adc5", danger: "위험 2", pressure: "혹한", mapX: 51, mapY: 16,
    hazard: { name: "혹한", glyph: "❄", description: "주기적으로 원정대의 체력을 깎는다.", techniqueId: "survival" },
    enemyPool: ["frostWolves", "iceRaiders", "snowGolems"], villageName: "눈골 부락", dungeonName: "빙맥 폐광", dungeonGlyph: "◆",
    bossEncounterId: "frostColossusPack", defenseEncounterId: "iceRaiders", rewardMaterial: "frostIron", rewardAmount: 2,
    recruits: ["snow_guard", "winter_berserker", "snow_shaman"], techniqueId: "survival"
  },
  south: {
    id: "south", direction: "남부", name: "남부 우림", subtitle: "동남아와 중남미풍의 거대 밀림",
    description: "독과 약초, 매복과 소환술이 함께 발달한 습윤 지대. 수관 아래 뿌리 군락이 개척로를 삼킨다.",
    glyph: "♣", accent: "#66a978", danger: "위험 2", pressure: "독성", mapX: 50, mapY: 84,
    hazard: { name: "독성 포자", glyph: "♢", description: "교전이 길어질수록 중독 피해가 쌓인다.", techniqueId: "poison" },
    enemyPool: ["venomStalkers", "vineBrood", "mireHunters"], villageName: "강둑 부락", dungeonName: "수관 아래 신전", dungeonGlyph: "♧",
    bossEncounterId: "canopyMatriarchPack", defenseEncounterId: "vineBrood", rewardMaterial: "venomSac", rewardAmount: 2,
    recruits: ["venom_tracker", "vine_keeper", "sap_healer"], techniqueId: "poison"
  },
  east: {
    id: "east", direction: "동부", name: "동부 산악권", subtitle: "단조와 무예, 산성의 문화권",
    description: "공방 도시와 문파, 산성국과 도국이 이어진다. 무예서와 단조 설계를 둘러싼 분쟁이 끊이지 않는다.",
    glyph: "山", accent: "#c18469", danger: "위험 2", pressure: "험로", mapX: 81, mapY: 51,
    hazard: { name: "험로", glyph: "山", description: "거친 지형이 이동과 공격 주기를 방해한다.", techniqueId: "forging" },
    enemyPool: ["mountainBandits", "ironGuard", "stoneApes"], villageName: "산성 아래 마을", dungeonName: "봉인된 단조성", dungeonGlyph: "炉",
    bossEncounterId: "forgeGuardianPack", defenseEncounterId: "ironGuard", rewardMaterial: "mountainIron", rewardAmount: 2,
    recruits: ["formation_officer", "duel_swordsman", "meridian_fighter"], techniqueId: "forging"
  },
  west: {
    id: "west", direction: "서부", name: "서부 제후국", subtitle: "기사와 마나, 정령의 봉건령",
    description: "석성 사이에 오래된 계약과 마력 유적이 남아 있다. 서약은 정의가 아니라 힘을 빌리는 방식이다.",
    glyph: "♜", accent: "#c6a66b", danger: "위험 2", pressure: "마력 이상", mapX: 18, mapY: 51,
    hazard: { name: "마력 이상", glyph: "✦", description: "불안정한 마력이 방어를 뚫고 피해를 준다.", techniqueId: "oath" },
    enemyPool: ["thornBeasts", "oathbreakers", "manaWraiths"], villageName: "변경 순례촌", dungeonName: "무너진 서약당", dungeonGlyph: "✧",
    bossEncounterId: "ruinWardenPack", defenseEncounterId: "oathbreakers", rewardMaterial: "manaStone", rewardAmount: 2,
    recruits: ["oath_knight", "mana_weaver", "spirit_ranger"], techniqueId: "oath"
  },
  central: {
    id: "central", direction: "중부", name: "중부 사막", subtitle: "대상단과 유목민이 오가는 교역로",
    description: "오아시스와 유리 협곡이 이어지는 대륙의 중심. 물과 보급을 지키는 자가 길을 지배한다.",
    glyph: "☀", accent: "#c99150", danger: "위험 1", pressure: "작열", mapX: 51, mapY: 68,
    hazard: { name: "작열", glyph: "☀", description: "열기와 갈증이 장기 교전을 불리하게 만든다.", techniqueId: "mobility" },
    enemyPool: ["sandHunters", "duneRaiders", "glassBeetles"], villageName: "오아시스 부락", dungeonName: "유리사 지하궁", dungeonGlyph: "◇",
    bossEncounterId: "duneTyrantPack", defenseEncounterId: "duneRaiders", rewardMaterial: "glassSand", rewardAmount: 2,
    recruits: ["desert_lancer", "glass_alchemist", "caravan_guide"], techniqueId: "mobility"
  }
};

export const MONSTER_ECOLOGY_DEFS = {
  north: [
    { name: "북부 홉고블린", role: "고블린 대형종", behavior: "작은 무리 대신 큰 체구와 중병기로 정면을 민다.", counter: "빙결 해제·집중 공격" },
    { name: "서리갑주 오크", role: "오크 중장종", behavior: "두 번째 타격마다 냉기를 누적한다.", counter: "기동·방어 관통" },
    { name: "설원 늑대", role: "늑대 추적종", behavior: "빠르게 접근해 빙결을 쌓는다.", counter: "범위 공격·해제" },
    { name: "빙맥 큰곰", role: "곰 우두머리", behavior: "세 번째 강타로 짧은 기절을 일으킨다.", counter: "회피·상태 저항" }
  ],
  south: [
    { name: "독침 고블린", role: "고블린 독사수", behavior: "원거리에서 중첩 독을 계속 쌓는다.", counter: "해제·빠른 돌입" },
    { name: "덩굴갑주 오크", role: "오크 재생종", behavior: "두꺼운 갑주와 느린 자연 회복으로 버틴다.", counter: "화상·집중 공격" },
    { name: "수풀 늑대", role: "늑대 매복종", behavior: "독니로 장기전을 강요한다.", counter: "방어·해독" },
    { name: "수관 큰곰", role: "곰 우두머리", behavior: "강한 맹독과 회복으로 전선을 압박한다.", counter: "해제·화상" }
  ],
  east: [
    { name: "산성 고블린 궁수", role: "고블린 장궁종", behavior: "긴 사거리에서 집중 사격한다.", counter: "돌진·엄폐" },
    { name: "단조갑주 오크", role: "오크 수문종", behavior: "높은 방어력으로 좁은 길을 막는다.", counter: "부패·방어 관통" },
    { name: "산등성이 늑대", role: "늑대 추격종", behavior: "빠른 연속 공격으로 출혈을 쌓는다.", counter: "빙결·방어" },
    { name: "철발톱 큰곰", role: "곰 우두머리", behavior: "단조된 발톱으로 강한 출혈을 남긴다.", counter: "회피·회복" }
  ],
  west: [
    { name: "마나 고블린 술사", role: "고블린 마법종", behavior: "마법탄과 짧은 화상으로 거리를 유지한다.", counter: "돌진·화상 갱신 차단" },
    { name: "서약 파기 오크", role: "오크 기사종", behavior: "갑주와 큰 무기로 한 대상을 압박한다.", counter: "기동·부패" },
    { name: "정령숲 늑대", role: "늑대 마력종", behavior: "추적한 대상에게 부패를 남긴다.", counter: "해제·범위 공격" },
    { name: "룬갑주 큰곰", role: "곰 우두머리", behavior: "룬 갑주로 버티며 주기적으로 기절 강타를 쓴다.", counter: "방어 관통·상태 저항" }
  ],
  central: [
    { name: "화염병 고블린", role: "고블린 연금종", behavior: "화염병으로 짧고 강한 화상을 갱신한다.", counter: "돌진·회복" },
    { name: "사구 도끼오크", role: "오크 약탈종", behavior: "무거운 도끼로 출혈을 누적한다.", counter: "회피·빙결" },
    { name: "모래 늑대", role: "늑대 고속종", behavior: "빠르게 고립된 대상을 물고 빠진다.", counter: "범위 공격·방어" },
    { name: "사구 큰곰", role: "곰 우두머리", behavior: "모래를 가르며 돌진해 기절시킨다.", counter: "회피·상태 저항" }
  ]
};

export const UNIT_DEFS = {
  snow_guard: { id: "snow_guard", name: "설벽 수호자", regionId: "north", role: "탱커", glyph: "▣", color: "#83b8cd", maxHp: 52, damage: 5, range: 7, speed: 7, attackMs: 1200, armor: 0.28, scores: [1, 4, 1], primary: "방패벽", weakness: "기동과 화력이 낮다.", baseClassId: "crusader" },
  winter_berserker: { id: "winter_berserker", name: "빙원 광전사", regionId: "north", role: "딜러", glyph: "Ψ", color: "#a8c8d3", maxHp: 39, damage: 9, range: 8, speed: 10, attackMs: 930, armor: 0.1, finisher: 1.35, scores: [4, 1, 1], primary: "상처 투쟁", weakness: "회복 지원 없이는 오래 버티지 못한다.", baseClassId: "barbarian" },
  snow_shaman: { id: "snow_shaman", name: "설령 주술사", regionId: "north", role: "유틸", glyph: "❅", color: "#9dd5df", maxHp: 32, damage: 4, range: 21, speed: 8, attackMs: 1150, armor: 0.08, heal: 3, healMs: 4300, partyArmor: 0.02, scores: [1, 1, 4], primary: "설령 계약", weakness: "직접 화력이 낮다.", baseClassId: "necromancer" },

  venom_tracker: { id: "venom_tracker", name: "독침 추적자", regionId: "south", role: "딜러", glyph: "♢", color: "#75b883", maxHp: 35, damage: 6, range: 23, speed: 11, attackMs: 910, armor: 0.07, poisonDamage: 1, scores: [4, 1, 1], primary: "누적 독", weakness: "독이 퍼지기 전 순간 화력이 낮다.", baseClassId: "tracker" },
  vine_keeper: { id: "vine_keeper", name: "덩굴 수호자", regionId: "south", role: "탱·유틸", glyph: "♣", color: "#64a66e", maxHp: 45, damage: 4, range: 15, speed: 6, attackMs: 1250, armor: 0.19, partyArmor: 0.04, scores: [1, 3, 2], primary: "생장 갑옷", weakness: "빠른 적을 따라가지 못한다.", baseClassId: "crusader" },
  sap_healer: { id: "sap_healer", name: "수액 약제사", regionId: "south", role: "유틸", glyph: "✚", color: "#9ccb77", maxHp: 30, damage: 3, range: 22, speed: 8, attackMs: 1200, armor: 0.05, heal: 5, healMs: 3300, scores: [1, 1, 4], primary: "독과 약", weakness: "노출되면 쉽게 쓰러진다.", baseClassId: "archmage" },

  formation_officer: { id: "formation_officer", name: "진법 군관", regionId: "east", role: "유틸", glyph: "陣", color: "#d09572", maxHp: 37, damage: 5, range: 18, speed: 9, attackMs: 1050, armor: 0.12, partyArmor: 0.03, scores: [1, 2, 4], primary: "진형 보조", weakness: "혼자서는 힘을 발휘하기 어렵다.", baseClassId: "crusader" },
  duel_swordsman: { id: "duel_swordsman", name: "결전검객", regionId: "east", role: "폭딜러", glyph: "刃", color: "#d88767", maxHp: 32, damage: 9, range: 8, speed: 13, attackMs: 950, armor: 0.07, buffCarry: 0.22, scores: [4, 1, 1], primary: "결전 대상", weakness: "버프와 보호가 끊기면 급격히 약해진다.", baseClassId: "maehwa" },
  meridian_fighter: { id: "meridian_fighter", name: "기맥 권사", regionId: "east", role: "딜·탱", glyph: "武", color: "#b98a70", maxHp: 43, damage: 7, range: 7, speed: 12, attackMs: 870, armor: 0.14, lifeSteal: 0.12, scores: [3, 2, 1], primary: "기맥 순환", weakness: "원거리 적에게 접근해야 한다.", baseClassId: "barbarian" },

  oath_knight: { id: "oath_knight", name: "서약 중검기사", regionId: "west", role: "탱커", glyph: "♜", color: "#d0b46f", maxHp: 56, damage: 6, range: 8, speed: 6, attackMs: 1280, armor: 0.3, heal: 2, healMs: 5200, scores: [1, 4, 1], primary: "중검 방벽", weakness: "기동과 공격 주기가 느리다.", baseClassId: "crusader" },
  mana_weaver: { id: "mana_weaver", name: "마나 술사", regionId: "west", role: "딜·유틸", glyph: "✦", color: "#aa91d0", maxHp: 29, damage: 9, range: 25, speed: 8, attackMs: 1120, armor: 0.04, scores: [3, 1, 2], primary: "마나 폭주", weakness: "매우 약한 방어와 체력을 가진다.", baseClassId: "archmage" },
  spirit_ranger: { id: "spirit_ranger", name: "정령 순찰자", regionId: "west", role: "유틸", glyph: "♧", color: "#85b99b", maxHp: 34, damage: 5, range: 23, speed: 10, attackMs: 980, armor: 0.08, heal: 3, healMs: 4100, partyArmor: 0.03, scores: [1, 1, 4], primary: "정령 교감", weakness: "정령 지원이 분산되면 효율이 낮다.", baseClassId: "necromancer" },

  desert_lancer: { id: "desert_lancer", name: "사막 창기병", regionId: "central", role: "딜·탱", glyph: "➶", color: "#d2a25d", maxHp: 41, damage: 7, range: 10, speed: 14, attackMs: 900, armor: 0.13, chargeDamage: 0.25, scores: [3, 2, 1], primary: "돌파 기동", weakness: "좁은 전장과 장기전에 약하다.", baseClassId: "barbarian" },
  glass_alchemist: { id: "glass_alchemist", name: "유리사 연금술사", regionId: "central", role: "딜·유틸", glyph: "⚗", color: "#cf9257", maxHp: 31, damage: 5, range: 22, speed: 8, attackMs: 1080, armor: 0.06, poisonDamage: 1, heal: 2, healMs: 5000, scores: [2, 1, 3], primary: "분진 조합", weakness: "준비 없이 돌입한 전투에 약하다.", baseClassId: "archmage" },
  caravan_guide: { id: "caravan_guide", name: "대상단 길잡이", regionId: "central", role: "유틸", glyph: "◎", color: "#d4bc7a", maxHp: 36, damage: 4, range: 20, speed: 12, attackMs: 1000, armor: 0.09, commandAura: 0.1, heal: 2, healMs: 4700, scores: [1, 1, 4], primary: "보급 지휘", weakness: "전투를 끝낼 결정력이 부족하다.", baseClassId: "tracker" }
};

export const ENEMY_COMBATANTS = {
  northGoblin: { name: "북부 홉고블린", species: "goblin", variant: "대형종", glyph: "G", maxHp: 29, damage: 7, range: 8, speed: 7, attackMs: 1380, armor: 0.08, color: "#789db0" },
  northOrc: { name: "서리갑주 오크", species: "orc", variant: "빙철 갑주", glyph: "O", maxHp: 34, damage: 7, range: 8, speed: 6, attackMs: 1460, armor: 0.16, color: "#7292a3", statusOnHit: { id: "frost", stacks: 1 }, statusEvery: 2 },
  northWolf: { name: "설원 늑대", species: "wolf", variant: "빙결 송곳니", glyph: "Λ", maxHp: 21, damage: 5, range: 7, speed: 13, attackMs: 1020, color: "#8cb9cd", statusOnHit: { id: "frost", stacks: 1 }, statusEvery: 3 },
  northBear: { name: "빙맥 큰곰", species: "bear", variant: "빙맥 우두머리", glyph: "B", maxHp: 96, damage: 11, range: 9, speed: 4, attackMs: 1650, armor: 0.12, color: "#79aec7", boss: true, patterns: ["groundSlam"], statusOnHit: { id: "stun", durationMs: 850 }, statusEvery: 3 },

  southGoblin: { name: "독침 고블린", species: "goblin", variant: "독침 사수", glyph: "G", maxHp: 19, damage: 4, range: 21, speed: 10, attackMs: 1080, color: "#6fa66d", statusOnHit: { id: "poison", stacks: 1 } },
  southOrc: { name: "덩굴갑주 오크", species: "orc", variant: "재생 갑주", glyph: "O", maxHp: 31, damage: 6, range: 8, speed: 6, attackMs: 1390, armor: 0.14, hpRegen: 0.2, color: "#638f63" },
  southWolf: { name: "수풀 늑대", species: "wolf", variant: "독니 매복종", glyph: "Λ", maxHp: 20, damage: 5, range: 7, speed: 13, attackMs: 1010, color: "#80a965", statusOnHit: { id: "poison", stacks: 1 }, statusEvery: 2 },
  southBear: { name: "수관 큰곰", species: "bear", variant: "맹독 우두머리", glyph: "B", maxHp: 88, damage: 9, range: 9, speed: 5, attackMs: 1500, armor: 0.1, hpRegen: 0.25, color: "#6e9e62", boss: true, statusOnHit: { id: "poison", stacks: 2 } },

  eastGoblin: { name: "산성 고블린 궁수", species: "goblin", variant: "장궁 사수", glyph: "G", maxHp: 20, damage: 6, range: 24, speed: 9, attackMs: 1220, color: "#b37b60" },
  eastOrc: { name: "단조갑주 오크", species: "orc", variant: "중갑 수문병", glyph: "O", maxHp: 34, damage: 6, range: 8, speed: 5, attackMs: 1460, armor: 0.21, color: "#9f765f" },
  eastWolf: { name: "산등성이 늑대", species: "wolf", variant: "절벽 추격종", glyph: "Λ", maxHp: 22, damage: 7, range: 7, speed: 13, attackMs: 1050, color: "#9a7562", statusOnHit: { id: "bleed", stacks: 1 }, statusEvery: 2 },
  eastBear: { name: "철발톱 큰곰", species: "bear", variant: "단조성 우두머리", glyph: "B", maxHp: 94, damage: 10, range: 9, speed: 5, attackMs: 1500, armor: 0.18, color: "#bd7459", boss: true, statusOnHit: { id: "bleed", stacks: 2 }, statusEvery: 2 },

  westGoblin: { name: "마나 고블린 술사", species: "goblin", variant: "화염 마법종", glyph: "G", maxHp: 18, damage: 6, range: 24, speed: 9, attackMs: 1180, color: "#9b82bd", statusOnHit: { id: "burn" }, statusEvery: 3 },
  westOrc: { name: "서약 파기 오크", species: "orc", variant: "기사 무장", glyph: "O", maxHp: 29, damage: 8, range: 8, speed: 7, attackMs: 1300, armor: 0.13, color: "#a17870" },
  westWolf: { name: "정령숲 늑대", species: "wolf", variant: "마력 추적종", glyph: "Λ", maxHp: 22, damage: 5, range: 8, speed: 14, attackMs: 990, color: "#7f9c71", statusOnHit: { id: "decay" }, statusEvery: 3 },
  westBear: { name: "룬갑주 큰곰", species: "bear", variant: "폐서약당 우두머리", glyph: "B", maxHp: 98, damage: 10, range: 10, speed: 5, attackMs: 1540, armor: 0.16, color: "#b29378", boss: true, statusOnHit: { id: "stun", durationMs: 800 }, statusEvery: 3 },

  centralGoblin: { name: "화염병 고블린", species: "goblin", variant: "연금 투척수", glyph: "G", maxHp: 19, damage: 5, range: 22, speed: 10, attackMs: 1150, color: "#cf9257", statusOnHit: { id: "burn" }, statusEvery: 3 },
  centralOrc: { name: "사구 도끼오크", species: "orc", variant: "대상로 약탈자", glyph: "O", maxHp: 31, damage: 8, range: 8, speed: 7, attackMs: 1320, armor: 0.1, color: "#b97648", statusOnHit: { id: "bleed", stacks: 1 }, statusEvery: 2 },
  centralWolf: { name: "모래 늑대", species: "wolf", variant: "고속 추적종", glyph: "Λ", maxHp: 20, damage: 6, range: 7, speed: 14, attackMs: 1000, color: "#c18b52", statusOnHit: { id: "bleed", stacks: 1 }, statusEvery: 3 },
  centralBear: { name: "사구 큰곰", species: "bear", variant: "유리사 우두머리", glyph: "B", maxHp: 90, damage: 11, range: 9, speed: 5, attackMs: 1480, armor: 0.13, color: "#cf8b46", boss: true, statusOnHit: { id: "stun", durationMs: 750 }, statusEvery: 3 }
};

export const ENCOUNTER_DEFS = {
  sandHunters: { name: "모래 늑대 매복", glyph: "!", enemies: ["centralWolf", "centralWolf", "centralGoblin"], scrap: 3 },
  duneRaiders: { name: "사구 혼성 약탈대", glyph: "!", enemies: ["centralOrc", "centralGoblin", "centralWolf"], scrap: 4 },
  glassBeetles: { name: "유리 협곡 수문대", glyph: "!", enemies: ["centralOrc", "centralOrc", "centralGoblin"], scrap: 4 },
  frostWolves: { name: "설원 늑대 무리", glyph: "!", enemies: ["northWolf", "northWolf", "northGoblin"], scrap: 4 },
  iceRaiders: { name: "빙철 혼성대", glyph: "!", enemies: ["northOrc", "northGoblin", "northWolf"], scrap: 5 },
  snowGolems: { name: "설벽 중장대", glyph: "!", enemies: ["northOrc", "northGoblin"], scrap: 5 },
  venomStalkers: { name: "독침 고블린 매복대", glyph: "!", enemies: ["southGoblin", "southGoblin", "southWolf"], scrap: 4 },
  vineBrood: { name: "덩굴갑주 순찰대", glyph: "!", enemies: ["southOrc", "southWolf", "southGoblin"], scrap: 4 },
  mireHunters: { name: "우림 혼성 사냥대", glyph: "!", enemies: ["southWolf", "southOrc", "southGoblin"], scrap: 5 },
  canopyMatriarchPack: { name: "수관 아래 큰곰", glyph: "☠", enemies: ["southBear", "southOrc", "southGoblin"], scrap: 12, boss: true },
  mountainBandits: { name: "산성 고블린 궁수대", glyph: "!", enemies: ["eastGoblin", "eastGoblin", "eastWolf"], scrap: 4 },
  ironGuard: { name: "단조갑주 수문대", glyph: "!", enemies: ["eastOrc", "eastOrc", "eastGoblin"], scrap: 5 },
  stoneApes: { name: "산등성이 추격대", glyph: "!", enemies: ["eastWolf", "eastWolf", "eastOrc"], scrap: 5 },
  forgeGuardianPack: { name: "단조성 철발톱", glyph: "☠", enemies: ["eastBear", "eastOrc", "eastGoblin"], scrap: 12, boss: true },
  thornBeasts: { name: "정령숲 늑대 무리", glyph: "!", enemies: ["westWolf", "westWolf", "westGoblin"], scrap: 4 },
  oathbreakers: { name: "서약 파기 혼성대", glyph: "!", enemies: ["westOrc", "westOrc", "westGoblin"], scrap: 5 },
  manaWraiths: { name: "마나 고블린 술사대", glyph: "!", enemies: ["westGoblin", "westGoblin", "westWolf"], scrap: 5 },
  ruinWardenPack: { name: "폐서약당 룬갑주", glyph: "☠", enemies: ["westBear", "westOrc", "westGoblin"], scrap: 12, boss: true },
  duneTyrantPack: { name: "유리사의 사구 큰곰", glyph: "☠", enemies: ["centralBear", "centralOrc", "centralGoblin"], scrap: 11, boss: true },
  frostColossusPack: { name: "빙맥 큰곰", glyph: "☠", enemies: ["northBear", "northOrc", "northGoblin"], scrap: 13, boss: true }
};

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let output = value;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function reachableKeys(tiles, start) {
  const queue = [{ ...start }];
  const reached = new Set([keyOf(start.x, start.y)]);
  while (queue.length) {
    const current = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (tiles[y]?.[x] !== "floor") continue;
      const key = keyOf(x, y);
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push({ x, y });
    }
  }
  return reached;
}

function reveal(zone, player, radius) {
  const seen = new Set(zone.seen || []);
  for (let y = Math.max(0, player.y - radius); y <= Math.min(zone.height - 1, player.y + radius); y += 1) {
    for (let x = Math.max(0, player.x - radius); x <= Math.min(zone.width - 1, player.x + radius); x += 1) {
      if (Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) <= radius) seen.add(keyOf(x, y));
    }
  }
  zone.seen = [...seen];
}

function chooseReachableCell(random, tiles, reachable, occupied, minDistance, from) {
  const candidates = [];
  for (const key of reachable) {
    if (occupied.has(key)) continue;
    const [x, y] = key.split(",").map(Number);
    if (Math.abs(x - from.x) + Math.abs(y - from.y) < minDistance) continue;
    if (tiles[y]?.[x] === "floor") candidates.push({ x, y });
  }
  return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
}

function makeFieldTiles(random, start, entrance) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const tiles = Array.from({ length: FIELD_SIZE }, (_, y) => Array.from({ length: FIELD_SIZE }, (_, x) => (
      x === 0 || y === 0 || x === FIELD_SIZE - 1 || y === FIELD_SIZE - 1 ? "wall" : "floor"
    )));
    for (let cluster = 0; cluster < 52; cluster += 1) {
      const cx = 2 + Math.floor(random() * (FIELD_SIZE - 4));
      const cy = 2 + Math.floor(random() * (FIELD_SIZE - 4));
      const width = 1 + Math.floor(random() * 3);
      const height = 1 + Math.floor(random() * 3);
      for (let y = cy; y < Math.min(FIELD_SIZE - 1, cy + height); y += 1) {
        for (let x = cx; x < Math.min(FIELD_SIZE - 1, cx + width); x += 1) tiles[y][x] = "wall";
      }
    }
    for (const point of [start, entrance]) {
      for (let y = point.y - 1; y <= point.y + 1; y += 1) {
        for (let x = point.x - 1; x <= point.x + 1; x += 1) tiles[y][x] = "floor";
      }
    }
    for (let x = start.x; x <= entrance.x; x += 1) tiles[start.y][x] = "floor";
    for (let y = Math.min(start.y, entrance.y); y <= Math.max(start.y, entrance.y); y += 1) tiles[y][entrance.x] = "floor";
    const reached = reachableKeys(tiles, start);
    if (reached.has(keyOf(entrance.x, entrance.y)) && reached.size > 1050) return { tiles, reached };
  }
  throw new Error("Unable to generate connected field");
}

export function createField(seed, regionId) {
  const region = WORLD_REGION_DEFS[regionId] || WORLD_REGION_DEFS.central;
  const random = mulberry32(seed + region.id.length * 7919);
  const start = { x: 3, y: 20 };
  const entrance = { x: 36, y: 8 + Math.floor(random() * 25) };
  const { tiles, reached } = makeFieldTiles(random, start, entrance);
  const occupied = new Set([keyOf(start.x, start.y), keyOf(entrance.x, entrance.y)]);
  const features = {
    [keyOf(start.x, start.y)]: { type: "fieldExit", name: "영지 귀환로", glyph: "⌂" },
    [keyOf(entrance.x, entrance.y)]: { type: "dungeonEntrance", name: region.dungeonName, glyph: region.dungeonGlyph }
  };
  for (let index = 0; index < 7; index += 1) {
    const position = chooseReachableCell(random, tiles, reached, occupied, 7, start);
    if (!position) continue;
    occupied.add(keyOf(position.x, position.y));
    const encounterId = region.enemyPool[index % region.enemyPool.length];
    features[keyOf(position.x, position.y)] = {
      id: `field-${index + 1}`,
      type: "encounter",
      encounterId,
      name: ENCOUNTER_DEFS[encounterId].name,
      glyph: ENCOUNTER_DEFS[encounterId].glyph,
      cleared: false
    };
  }
  const settlementPosition = chooseReachableCell(random, tiles, reached, occupied, 9, start);
  if (settlementPosition) {
    occupied.add(keyOf(settlementPosition.x, settlementPosition.y));
    features[keyOf(settlementPosition.x, settlementPosition.y)] = {
      id: "field-settlement",
      type: "settlement",
      name: region.villageName,
      glyph: "▤",
      visited: false
    };
  }
  for (let index = 0; index < 5; index += 1) {
    const position = chooseReachableCell(random, tiles, reached, occupied, 6, start);
    if (!position) continue;
    occupied.add(keyOf(position.x, position.y));
    features[keyOf(position.x, position.y)] = { type: "landmark", name: `${region.name} 표식`, glyph: "⌖", visited: false };
  }
  const field = { id: `${region.id}-field`, kind: "field", regionId: region.id, width: FIELD_SIZE, height: FIELD_SIZE, tiles, features, start, entrance, seen: [] };
  reveal(field, start, 5);
  return field;
}

export function createDungeon(seed, regionId, bossEncounterId = null) {
  const region = WORLD_REGION_DEFS[regionId] || WORLD_REGION_DEFS.central;
  const finalEncounterId = bossEncounterId || region.bossEncounterId;
  const tiles = Array.from({ length: DUNGEON_SIZE }, () => Array.from({ length: DUNGEON_SIZE }, () => "wall"));
  const carveRoom = (left, top, width, height) => {
    for (let y = top; y < top + height; y += 1) {
      for (let x = left; x < left + width; x += 1) tiles[y][x] = "floor";
    }
  };
  carveRoom(1, 5, 4, 5);
  carveRoom(5, 6, 5, 3);
  carveRoom(9, 3, 5, 5);
  carveRoom(9, 9, 5, 4);
  for (let y = 7; y <= 10; y += 1) tiles[y][11] = "floor";
  const start = { x: 2, y: 7 };
  const features = {
    [keyOf(start.x, start.y)]: { type: "dungeonExit", name: "필드로 나가기", glyph: "⇦" },
    "7,7": { id: "dungeon-guard-1", type: "encounter", encounterId: region.enemyPool[0], name: "입구 수문대", glyph: "!", cleared: false },
    "11,5": { id: "dungeon-guard-2", type: "encounter", encounterId: region.enemyPool[1] || region.enemyPool[0], name: "내부 경비대", glyph: "!", cleared: false },
    "11,11": { id: "dungeon-boss", type: "encounter", encounterId: finalEncounterId, name: ENCOUNTER_DEFS[finalEncounterId]?.name || "던전 지배자", glyph: "☠", cleared: false, boss: true },
    // 보스를 쓰러뜨려야 열리는 최심부 보물 상자. 무기 설계도가 낮은 확률로
    // 드랍되며(WEAPON_BLUEPRINT_DROP_CHANCE), 확정 보상이 아니라서 같은
    // 던전을 여러 번 돌게 만드는 파밍 목표가 된다.
    "13,12": { id: "dungeon-chest", type: "treasure", name: "봉인된 보물상자", glyph: "▣", opened: false }
  };
  const dungeon = { id: `${region.id}-dungeon`, kind: "dungeon", regionId: region.id, name: region.dungeonName, width: DUNGEON_SIZE, height: DUNGEON_SIZE, tiles, features, start, seen: [], seed };
  reveal(dungeon, start, 4);
  return dungeon;
}

export function createRegionRun(regionId, seed = Date.now() % 2147483647, partyIds = STARTING_PARTY, unitProgress = {}, commander = {}, options = {}) {
  const region = WORLD_REGION_DEFS[regionId];
  if (!region || region.locked) return null;
  // fieldBattle 모드에서는 격자 필드를 아예 만들지 않는다 — 필드 자체가
  // 하나의 광역 전투 아레나가 되고, 이동·교전이 전부 그 안에서 일어난다.
  const useFieldBattle = Boolean(options.fieldBattle);
  const field = useFieldBattle ? null : createField(seed, regionId);
  const party = [...new Set(partyIds)].filter((unitId) => UNIT_DEFS[unitId]).slice(0, PARTY_LIMIT);
  const hazardMitigation = party.reduce((total, unitId) => {
    const unit = UNIT_DEFS[unitId];
    const progress = unitProgress[unitId] || {};
    return total + (unit.regionId === regionId ? 1 : 0) + (progress.secondaryId === region.hazard.techniqueId ? 1 : 0);
  }, 0);
  const ambushInterval = Array.isArray(options.ambushInterval) ? options.ambushInterval : [7, 12];
  const firstAmbushRandom = mulberry32(seed + 99173)();
  const firstAmbushStep = ambushInterval[0] + Math.floor(firstAmbushRandom * (ambushInterval[1] - ambushInterval[0] + 1));
  const commanderState = { name: "개척자", level: 1, xp: 0, ...commander };
  const fieldBattle = useFieldBattle
    ? createFieldBattle(regionId, partyIds, unitProgress, {
      seed,
      commander: commanderState,
      hazardMitigation: 0,
      groupCount: options.groupCount,
      obstacleCount: options.obstacleCount
    })
    : null;
  return {
    seed,
    regionId,
    subregionId: options.subregionId || null,
    // 이번 원정이 이 지역의 몇 번째 클리어 시도인지 — 던전 상자 확정 보상 단계에 쓴다.
    clearCount: Math.max(1, Number(options.clearCount) || 1),
    purpose: options.purpose || "exploration",
    bossEncounterId: options.bossEncounterId || null,
    location: "field",
    status: "active",
    fieldBattle: useFieldBattle,
    player: field ? { ...field.start } : null,
    field,
    dungeon: null,
    battle: fieldBattle,
    pendingEntrance: false,
    pendingExit: false,
    pendingSettlement: null,
    settlementVisit: null,
    dungeonEntered: false,
    fieldSteps: 0,
    irregularAmbushes: 0,
    ambushInterval,
    nextAmbushStep: firstAmbushStep,
    party,
    commander: { name: "개척자", level: 1, xp: 0, ...commander },
    commanderXp: 0,
    unitProgress: Object.fromEntries(party.map((unitId) => [unitId, { level: 1, xp: 0, ...(unitProgress[unitId] || {}) }])),
    unitXp: Object.fromEntries(party.map((unitId) => [unitId, 0])),
    hazardMitigation,
    cargo: { scrap: 0, materials: {}, weaponBlueprints: [] },
    encountersWon: 0,
    bossDefeated: false,
    capturedBoss: null,
    result: null
  };
}

function maybeStartIrregularAmbush(run) {
  if (run.location !== "field" || run.purpose !== "conquest" || run.dungeonEntered || run.fieldSteps < run.nextAmbushStep) return null;
  const region = WORLD_REGION_DEFS[run.regionId] || WORLD_REGION_DEFS.central;
  const encounterIndex = Math.floor(mulberry32(run.seed + run.irregularAmbushes * 137 + run.fieldSteps * 17)() * region.enemyPool.length);
  const encounterId = region.enemyPool[Math.min(region.enemyPool.length - 1, encounterIndex)];
  run.irregularAmbushes += 1;
  const [minInterval, maxInterval] = run.ambushInterval;
  const intervalRoll = mulberry32(run.seed + run.irregularAmbushes * 3571)();
  run.nextAmbushStep = run.fieldSteps + minInterval + Math.floor(intervalRoll * (maxInterval - minInterval + 1));
  const feature = {
    id: `roaming-ambush-${run.irregularAmbushes}`,
    type: "ambush",
    encounterId,
    name: `${ENCOUNTER_DEFS[encounterId].name}의 기습`,
    glyph: "!"
  };
  run.battle = createAutoBattle(encounterId, feature.id, "field", run.party, run.unitProgress, {
    regionId: run.regionId,
    hazardMitigation: run.hazardMitigation,
    commander: run.commander,
    awaitingPlayerStart: true,
    enemyCopies: 2
  });
  return feature;
}

export function currentZone(run) {
  return run?.location === "dungeon" ? run.dungeon : run?.field;
}

export function revealCurrentZone(run) {
  const zone = currentZone(run);
  if (zone) reveal(zone, run.player, zone.kind === "field" ? 5 : 4);
}

// 지역별로 어느 방어구 세트가 나오는지. 지역 성격에 맞춰 배정했다.
export const REGION_ARMOR_SET = {
  north: "ironbound",   // 설산 — 버티는 중장
  west: "ironbound",    // 신성 제국·몰락 왕국 — 중장
  east: "ranger",       // 산악 문파 — 경량·회전
  south: "ranger",      // 우림 추적 — 경량
  central: "warden"     // 사막 마탑권 — 마력
};

// 던전 상자 보상. 확률 드랍이 아니라 **클리어 횟수에 따른 확정 보상**이다.
// (예전엔 1/3 확률로 굴렸는데, 반복 던전 방향을 잡으면서 운빨을 걷어냈다 —
//  docs/CHOICE_DESIGN.md. "평균 3회 파밍" 요구는 회차 단계로 그대로 유지된다.)
//
//   1회차 → 그 지역 출신 직업의 무기 설계도
//   2회차 → 그 지역 방어구 세트 설계도 (방어구 + 짝 장신구를 한 번에 해금)
//   3회차 → 그 지역 출신 두 번째 직업의 무기 설계도 (있는 경우)
//   5회차+ → 그 지역 전설 장비 설계도 (한 번에 하나씩)
//
// 이미 가진 설계도는 건너뛰고 다음 후보로 넘어가므로 같은 던전을 계속 돌아도
// 중복 보상이 쌓이지 않는다. 다 받은 뒤에는 빈 배열(설계도 보상 없음)이 된다.
export function dungeonClearRewards(regionId, clearCount, ownedBlueprints = []) {
  const owned = new Set(ownedBlueprints);
  const weapons = Object.values(PLAYER_BASE_CLASS_DEFS)
    .filter((baseClass) => baseClass.originRegionId === regionId)
    .map((baseClass) => Object.values(EQUIPMENT_DEFS)
      .find((entry) => entry.slot === "weapon" && !entry.legendary && entry.baseClassId === baseClass.id))
    .filter(Boolean);

  const armorSet = ARMOR_SET_DEFS[REGION_ARMOR_SET[regionId]];
  const schedule = [
    weapons[0] ? [weapons[0].id] : [],
    armorSet ? [...armorSet.pieces] : [],
    weapons[1] ? [weapons[1].id] : []
  ];

  const stage = Math.max(1, Number(clearCount) || 1);

  // 3단계를 다 받은 뒤에도 계속 돌 이유를 남긴다 — 전설 설계도는 회차 요구가 있어서
  // 아래 "앞 회차 미수령분 보충"에는 끼워넣지 않고 여기서 따로 처리한다.
  // 한 번에 하나씩만 줘서 지역에 전설이 둘인 곳(북부·서부)은 더 돌아야 한다.
  if (stage >= LEGENDARY_CLEAR_REQUIREMENT) {
    const pending = legendariesForRegion(regionId)
      .map((entry) => entry.id)
      .filter((id) => !owned.has(id));
    if (pending.length) return [pending[0]];
  }

  // 해당 회차 칸부터 훑고, 그래도 없으면 앞 회차 미수령분을 채워준다
  // (순서를 건너뛰었거나 이미 다른 경로로 얻은 경우 대비).
  const order = [
    ...schedule.slice(Math.min(stage, schedule.length) - 1),
    ...schedule.slice(0, Math.min(stage, schedule.length) - 1)
  ];
  for (const group of order) {
    const remaining = group.filter((id) => !owned.has(id));
    if (remaining.length) return remaining;
  }
  return [];
}

export function moveRunPlayer(run, x, y) {
  if (!run || run.status !== "active" || run.battle) return { moved: false };
  const zone = currentZone(run);
  if (!zone || zone.tiles[y]?.[x] !== "floor") return { moved: false };
  const distance = Math.abs(x - run.player.x) + Math.abs(y - run.player.y);
  if (distance !== 1) return { moved: false };
  run.player.x = x;
  run.player.y = y;
  if (zone.kind === "field") run.fieldSteps = (run.fieldSteps || 0) + 1;
  revealCurrentZone(run);
  const feature = zone.features[keyOf(x, y)];
  if (!feature) {
    const ambush = maybeStartIrregularAmbush(run);
    return ambush ? { moved: true, type: "ambush", feature: ambush } : { moved: true, type: "move" };
  }
  if (feature.type === "encounter" && !feature.cleared) {
    run.battle = createAutoBattle(feature.encounterId, feature.id, zone.kind, run.party, run.unitProgress, {
      regionId: run.regionId,
      hazardMitigation: run.hazardMitigation,
      commander: run.commander,
      forceBoss: Boolean(feature.boss),
      awaitingPlayerStart: true,
      enemyCopies: feature.boss ? 1 : 2
    });
    return { moved: true, type: "encounter", feature };
  }
  if (feature.type === "dungeonEntrance") {
    run.pendingEntrance = true;
    return { moved: true, type: "dungeonEntrance", feature };
  }
  if (feature.type === "dungeonExit") {
    run.pendingExit = true;
    return { moved: true, type: "dungeonExit", feature };
  }
  if (feature.type === "fieldExit") {
    run.pendingExit = true;
    return { moved: true, type: "fieldExit", feature };
  }
  if (feature.type === "settlement") {
    run.pendingSettlement = { featureId: feature.id, name: feature.name, firstVisit: !feature.visited };
    return { moved: true, type: "settlement", feature };
  }
  if (feature.type === "treasure" && !feature.opened) {
    const bossCleared = Object.values(zone.features).some((entry) => entry.boss && entry.cleared);
    if (!bossCleared) return { moved: true, type: "treasureLocked", feature };
    feature.opened = true;
    // 이번이 몇 번째 클리어인지에 따라 확정 보상이 정해진다(run.clearCount는
    // 게임 엔진이 런 생성 시 넣어준다 — 없으면 첫 클리어로 본다).
    const rewards = dungeonClearRewards(
      run.regionId,
      run.clearCount || 1,
      [...(run.commander?.unlockedBlueprints || []), ...run.cargo.weaponBlueprints]
    );
    for (const id of rewards) run.cargo.weaponBlueprints.push(id);
    return { moved: true, type: "treasure", feature, blueprintIds: rewards };
  }
  if (feature.type === "landmark" && !feature.visited) {
    feature.visited = true;
    return { moved: true, type: "landmark", feature };
  }
  const ambush = maybeStartIrregularAmbush(run);
  return ambush ? { moved: true, type: "ambush", feature: ambush } : { moved: true, type: "move", feature };
}

function createCombatant(definition, id, team, index, progress = {}, secondary = null) {
  const unitSide = team === "unit";
  const level = unitSide ? Math.max(1, progress.level || 1) : 1;
  const levelScale = definition.preScaled ? 0 : level - 1;
  const maxHp = Math.max(1, Math.round(definition.maxHp * (1 + levelScale * 0.07 + (secondary?.hpBonus || 0))));
  const damage = Math.max(1, Math.round(definition.damage * (1 + levelScale * 0.06 + (secondary?.damageBonus || 0))));
  const unitY = [35, 65, 20, 50, 80][index] ?? 50;
  const enemyY = [28, 50, 72, 38, 62][index] ?? 50;
  return {
    id,
    defId: definition.id || id,
    name: definition.name,
    role: definition.role || (definition.boss ? "우두머리" : "적"),
    glyph: definition.glyph,
    color: definition.color,
    regionId: definition.regionId || null,
    species: definition.species || null,
    variant: definition.variant || null,
    portraitIndex: definition.portraitIndex ?? REGION_PORTRAIT_INDEX[definition.regionId] ?? null,
    team,
    level,
    hp: maxHp,
    maxHp,
    baseMaxHp: maxHp,
    damage,
    baseDamage: damage,
    range: definition.range,
    speed: definition.speed * (1 + (secondary?.speedBonus || 0)),
    attackMs: Math.max(560, definition.attackMs + (secondary?.attackMsBonus || 0)),
    armor: Math.min(0.58, (definition.armor || 0) + (secondary?.armorBonus || 0)),
    defense: definition.defense || 0,
    strength: definition.strength || 0,
    agility: definition.agility || 0,
    intelligence: definition.intelligence || 0,
    divineAffinity: definition.divineAffinity || 0,
    natureAffinity: definition.natureAffinity || 0,
    statusPotency: definition.statusPotency || 1,
    statusResistance: definition.statusResistance || 0,
    healingPower: definition.healingPower || 1,
    summonPower: definition.summonPower || 1,
    criticalChance: definition.criticalChance ?? null,
    cooldownMultiplier: definition.cooldownMultiplier || 1,
    maxMana: definition.maxMana || 0,
    mana: definition.maxMana || 0,
    manaRegen: definition.manaRegen || 0,
    hpRegen: definition.hpRegen || 0,
    regenRemainder: 0,
    heal: Math.max(definition.heal || 0, secondary?.heal || 0),
    healMs: Math.min(definition.healMs || Number.POSITIVE_INFINITY, secondary?.healMs || Number.POSITIVE_INFINITY),
    healCooldown: 900,
    poisonDamage: Math.max(definition.poisonDamage || 0, secondary?.poisonDamage || 0),
    statusOnHit: definition.statusOnHit ? { ...definition.statusOnHit } : null,
    statusEvery: Math.max(1, Number(definition.statusEvery || 1)),
    attackCount: 0,
    lifeSteal: definition.lifeSteal || 0,
    finisher: definition.finisher || 1,
    buffCarry: definition.buffCarry || 0,
    chargeDamage: definition.chargeDamage || 0,
    partyArmor: (definition.partyArmor || 0) + (secondary?.partyArmor || 0),
    commandAura: (definition.commandAura || 0) + (secondary?.commandAura || 0),
    cooldown: index * 140,
    x: unitSide ? 14 : 86,
    y: unitSide ? unitY : enemyY,
    boss: Boolean(definition.boss),
    // 보스 패턴 목록. 있으면 평타 대신 예고 장판을 깐다.
    patterns: [...(definition.patterns || [])],
    patternReadyAt: {},
    castingUntil: 0,
    lastHit: 0,
    telegraphTargetId: null,
    statuses: {},
    positiveEffects: {}
  };
}

export function createAutoBattle(encounterId, sourceFeatureId, sourceZone, partyIds = STARTING_PARTY, unitProgress = {}, options = {}) {
  const encounter = ENCOUNTER_DEFS[encounterId] || ENCOUNTER_DEFS.sandHunters;
  const partyLimit = Math.max(1, Number(options.partyLimit || PARTY_LIMIT));
  const selectedParty = [...new Set(partyIds)].filter((unitId) => UNIT_DEFS[unitId]).slice(0, partyLimit);
  const playerKit = playerKitDefinition(options.commander?.combatKitId);
  const playerBaseClass = playerBaseClassDefinition(playerKit.baseClassId);
  const playerSkills = normalizedPlayerLoadout(options.commander || {}, playerKit.id);
  const computedPlayerStats = playerCombatStats(options.commander || {}, playerKit.id);
  const playerHpGrowth = computedPlayerStats.maxHp / playerKit.stats.maxHp;
  const playerDamageGrowth = computedPlayerStats.damage / playerKit.stats.damage;
  const companions = selectedParty.map((unitId, index) => {
    const definition = UNIT_DEFS[unitId];
    const progress = unitProgress[unitId] || { level: 1, xp: 0 };
    const secondary = SECONDARY_DEFS[progress.secondaryId] || null;
    const scaledDefinition = {
      ...definition,
      maxHp: Math.max(1, Math.round(definition.maxHp * playerHpGrowth * COMPANION_POWER_MULTIPLIER)),
      damage: Math.max(1, Math.round(definition.damage * playerDamageGrowth * COMPANION_POWER_MULTIPLIER)),
      preScaled: true
    };
    const companion = createCombatant(scaledDefinition, `unit-${definition.id}`, "unit", index, progress, secondary);
    companion.baseClassId = definition.baseClassId || null;
    companion.basePassive = definition.baseClassId ? { ...playerBaseClassDefinition(definition.baseClassId).passive } : null;
    return companion;
  });
  const player = createCombatant(
    { ...PLAYER_COMBAT_DEF, ...computedPlayerStats, preScaled: true, name: options.commander?.name || PLAYER_COMBAT_DEF.name },
    "player-controlled",
    "unit",
    2,
    options.commander || { level: 1, xp: 0 }
  );
  player.controlled = true;
  player.baseClassId = playerBaseClass.id;
  player.combatKitId = playerKit.id;
  player.basePassiveId = playerBaseClass.passive.id;
  player.basePassive = { ...playerBaseClass.passive };
  player.passiveId = playerKit.passive.id;
  player.x = 27;
  player.y = 50;
  player.moveTarget = null;
  const units = [player, ...companions];
  const enemyCopies = Math.max(1, Math.min(4, Number(options.enemyCopies || 1)));
  const enemyIds = Array.from({ length: enemyCopies }, () => encounter.enemies).flat();
  const enemies = enemyIds.map((defId, index) => createCombatant({ id: defId, ...ENEMY_COMBATANTS[defId] }, `enemy-${index}-${defId}`, "enemy", index));
  const encounterEndurance = encounter.boss || options.forceBoss ? 2.15 : 2.4;
  for (const enemy of enemies) {
    enemy.maxHp = Math.round(enemy.maxHp * encounterEndurance);
    enemy.hp = enemy.maxHp;
  }
  const partyArmor = units.reduce((sum, unit) => sum + unit.partyArmor, 0);
  for (const unit of units) unit.armor = Math.min(0.58, unit.armor + partyArmor);
  const commandAura = Math.min(0.35, units.reduce((sum, unit) => sum + unit.commandAura, 0));
  const region = WORLD_REGION_DEFS[options.regionId];
  return {
    encounterId,
    encounterName: encounter.name,
    sourceFeatureId,
    sourceZone,
    elapsed: 0,
    status: "active",
    // 이동·넉백·끌어당김이 모두 이 경계 안에서만 일어난다. 조우 전투는 기존
    // 좁은 아레나(ARENA_BOUNDS) 그대로이고, 넓은 필드 전투는 여기에 더 큰 값을
    // 넘겨 디아블로식 광역 전장으로 쓴다.
    bounds: options.bounds ? { ...options.bounds } : { ...ARENA_BOUNDS },
    rollSeed: options.rollSeed ?? null,
    rollCount: 0,
    awaitingPlayerStart: Boolean(options.awaitingPlayerStart),
    resultRevealAt: 0,
    units,
    enemies,
    regionId: options.regionId || null,
    hazard: options.defense ? null : region?.hazard || null,
    hazardMitigation: options.hazardMitigation || 0,
    nextHazardAt: 5200,
    commandAura,
    defense: Boolean(options.defense),
    playerId: player.id,
    playerBaseClassId: playerBaseClass.id,
    playerBasePassive: { ...playerBaseClass.passive },
    playerKitId: playerKit.id,
    playerSkillIds: playerSkills,
    playerPassive: { ...playerKit.passive },
    storedBoss: options.commander?.storedBoss ? { ...options.commander.storedBoss } : null,
    playerTargetId: null,
    playerMoveInput: { x: 0, y: 0 },
    playerFacing: 0,
    playerReadyAt: { attack: 0, dodge: 0, skill1: 0, skill2: 0, skill3: 0, ultimate: 0 },
    playerDodgeUntil: 0,
    focusTargetId: enemies.find((enemy) => enemy.boss)?.id || null,
    command: { chargeUntil: 0, guardUntil: 0, focusUntil: 0 },
    commandReadyAt: { charge: 0, guard: 0, focus: 0 },
    passiveState: {},
    consumedCorpseIds: [],
    groundEffects: [],
    log: [options.defense ? `개척자와 자동 전투 동료 ${companions.length}명이 전선에 합류했다.` : `${playerBaseClass.name}의 기본 패시브와 ${playerKit.shortName} 전승을 활성화했다.`],
    rewardScrap: encounter.scrap,
    boss: Boolean(encounter.boss || options.forceBoss),
    fieldMode: Boolean(options.fieldMode),
    // 원형 장애물. 좁은 조우 아레나는 비워두고 넓은 필드에서만 채운다.
    obstacles: (options.obstacles || []).map((obstacle) => ({ ...obstacle })),
    triggers: (options.triggers || []).map((trigger) => ({ ...trigger, fired: false })),
    pendingTrigger: null,
    blockedTrigger: null,
    // 보스가 깔아둔 예고 장판. 시간이 되면 터지고 사라진다.
    zones: [],
    zoneSeq: 0
  };
}

// 화면 전환 없는 광역 필드 전투. createAutoBattle을 그대로 재사용하되(전투
// 규칙·스킬·상태이상이 전부 동일해야 하므로) 경계를 FIELD_BOUNDS로 넓히고,
// 한 줄로 마주보게 배치된 적들을 여러 무리로 흩어 놓은 뒤 전부 잠재운다.
// 플레이어가 다가간 무리만 깨어나므로 무리 단위 순차 교전이 된다.
export function createFieldBattle(regionId, partyIds = STARTING_PARTY, unitProgress = {}, options = {}) {
  const region = WORLD_REGION_DEFS[regionId];
  if (!region) return null;
  const groupCount = Math.max(1, Math.min(4, Number(options.groupCount || 3)));
  const bounds = options.bounds ? { ...options.bounds } : { ...FIELD_BOUNDS };
  const rng = mulberry32((options.seed || 1) + 5501);

  const battle = createAutoBattle(region.enemyPool[0], options.sourceFeatureId || `${regionId}-field`, "field", partyIds, unitProgress, {
    ...options,
    regionId,
    bounds,
    fieldMode: true,
    enemyCopies: groupCount,
    triggers: options.triggers || [{
      id: `${regionId}-dungeon-entrance`,
      type: "dungeonEntrance",
      name: region.dungeonName,
      // 필드 오른쪽 끝 근처 — 무리들을 지나 안쪽까지 들어가야 닿는다.
      x: bounds.maxX - 30,
      y: (bounds.minY + bounds.maxY) / 2,
      radius: 8,
      requiresClear: true
    }]
  });
  if (!battle) return null;

  const spawnX = bounds.minX + 20;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const trigger = battle.triggers[0] || null;

  // 장애물(바위·잔해)을 먼저 깔고, 그 다음 유닛·적을 배치한다 — 순서를
  // 뒤집으면 바위 안에 갇힌 채로 시작하는 개체가 생긴다.
  // 시작 지점과 던전 입구 주변은 비워둬서 스폰 즉시 끼거나 입구가 막히지 않게 한다.
  const obstacleCount = Math.max(0, Number(options.obstacleCount ?? 14));
  const obstacles = [];
  for (let attempt = 0; attempt < obstacleCount * 12 && obstacles.length < obstacleCount; attempt += 1) {
    const radius = 6 + rng() * 9;
    const x = bounds.minX + 40 + rng() * (bounds.maxX - bounds.minX - 60);
    const y = bounds.minY + 10 + rng() * (bounds.maxY - bounds.minY - 20);
    if (Math.hypot(x - spawnX, y - centerY) < 45 + radius) continue;
    if (trigger && Math.hypot(x - trigger.x, y - trigger.y) < 30 + radius) continue;
    if (obstacles.some((other) => Math.hypot(x - other.x, y - other.y) < radius + other.radius + 14)) continue;
    obstacles.push({ x, y, radius });
  }
  battle.obstacles = obstacles;

  // 플레이어·동료는 왼쪽 입구 쪽에서 시작.
  for (const unit of battle.units) {
    const placed = resolveMove(battle, spawnX, clampToArena(bounds, 0, unit.y + centerY - 50).y);
    unit.x = placed.x;
    unit.y = placed.y;
  }

  const perGroup = Math.max(1, Math.round(battle.enemies.length / groupCount));
  battle.enemies.forEach((enemy, index) => {
    const groupIndex = Math.min(groupCount - 1, Math.floor(index / perGroup));
    // 무리 앵커를 필드 가로축에 고르게 흩고, 세로는 시드 기반으로 흔든다.
    const anchorX = bounds.minX + 70 + ((bounds.maxX - bounds.minX - 110) * groupIndex) / Math.max(1, groupCount - 1 || 1);
    const anchorY = bounds.minY + 30 + rng() * (bounds.maxY - bounds.minY - 60);
    const spread = 10;
    const placed = resolveMove(battle, anchorX + (rng() - 0.5) * spread * 2, anchorY + (rng() - 0.5) * spread * 2);
    enemy.x = placed.x;
    enemy.y = placed.y;
    enemy.groupIndex = groupIndex;
    enemy.dormant = true;
  });
  battle.log.unshift(`${region.name} 필드에 진입했다. 흩어진 무리를 헤치고 ${region.dungeonName} 입구로.`);
  return battle;
}

function living(list) {
  return list.filter((entry) => entry.hp > 0);
}

function nearestTarget(actor, targets) {
  return [...targets].sort((a, b) => distanceBetween(actor, a) - distanceBetween(actor, b))[0] || null;
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dashToTarget(player, target, standoff = 6, battle = null) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const travel = Math.max(0, distance - standoff);
  const next = resolveMove(battle, player.x + (dx / distance) * travel, player.y + (dy / distance) * travel);
  player.x = next.x;
  player.y = next.y;
}

function retreatFromTarget(player, target, distance = 8, battle = null) {
  const dx = player.x - target.x;
  const dy = player.y - target.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const next = resolveMove(battle, player.x + (dx / length) * distance, player.y + (dy / length) * distance);
  player.x = next.x;
  player.y = next.y;
}

function knockback(source, target, distance = 5, battle = null) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const next = resolveMove(battle, target.x + (dx / length) * distance, target.y + (dy / length) * distance);
  target.x = next.x;
  target.y = next.y;
}

// 플레이어가 가까이 가면 그 무리 전체를 한꺼번에 깨운다. 무리 단위로 깨워야
// 같은 무리의 한 마리만 쫓아오고 나머지는 가만히 있는 어색한 그림이 안 나온다.
function wakeNearbyFieldGroups(battle) {
  if (!battle.fieldMode) return;
  const player = battle.units.find((unit) => unit.id === battle.playerId && unit.hp > 0);
  if (!player) return;
  const wokenGroups = new Set();
  for (const enemy of battle.enemies) {
    if (!enemy.dormant || enemy.hp <= 0) continue;
    if (distanceBetween(player, enemy) <= FIELD_AGGRO_RADIUS) wokenGroups.add(enemy.groupIndex);
  }
  if (!wokenGroups.size) return;
  for (const enemy of battle.enemies) {
    if (enemy.dormant && wokenGroups.has(enemy.groupIndex)) enemy.dormant = false;
  }
}

// 던전 입구 같은 지점 트리거. 사거리 안에 들어오면 battle.pendingTrigger에
// 올려두고, 실제 화면 전환/던전 진입 처리는 상위(게임 엔진) 쪽에서 소비한다.
function checkFieldTriggers(battle) {
  if (!battle.fieldMode || !battle.triggers?.length || battle.pendingTrigger) return;
  const player = battle.units.find((unit) => unit.id === battle.playerId && unit.hp > 0);
  if (!player) return;
  for (const trigger of battle.triggers) {
    if (trigger.fired) continue;
    if (Math.hypot(player.x - trigger.x, player.y - trigger.y) > (trigger.radius || 6)) continue;
    // 적대적인 무리가 아직 붙어 있으면 던전에 못 들어간다 — 전투 도중 도주
    // 수단으로 쓰이지 않게.
    if (trigger.requiresClear && battle.enemies.some((enemy) => enemy.hp > 0 && !enemy.dormant)) {
      battle.blockedTrigger = trigger.id;
      return;
    }
    battle.blockedTrigger = null;
    trigger.fired = true;
    battle.pendingTrigger = { ...trigger };
    return;
  }
  battle.blockedTrigger = null;
}

export function consumeFieldTrigger(battle) {
  const trigger = battle?.pendingTrigger || null;
  if (battle) battle.pendingTrigger = null;
  return trigger;
}

function pushBattleLog(battle, text) {
  battle.log.unshift(text);
  battle.log = battle.log.slice(0, 5);
}

function effectiveArmor(actor) {
  const decayShred = actor.statuses?.decay?.armorShred || 0;
  return Math.max(0, Math.min(0.58, (actor.armor || 0) - decayShred));
}

function statusStackTotal(target) {
  return Object.values(target.statuses || {}).reduce((sum, status) => sum + (status.stacks || 0), 0);
}

function effectDuration(target, definition, source, options) {
  const potency = Math.max(0.5, Number(options.potency || source?.statusPotency || 1));
  const resistance = Math.max(0, Math.min(0.6, Number(target.statusResistance || 0)));
  const controlResistance = target.boss && ["stun", "frost"].includes(definition.id) ? 0.5 : 0;
  const requested = Number(options.durationMs || definition.durationMs || 1000);
  return Math.max(250, Math.round(requested * Math.min(1.5, potency) * (1 - resistance) * (1 - controlResistance)));
}

export function applyCombatStatus(battle, target, statusId, source = null, options = {}) {
  const definition = STATUS_EFFECT_DEFS[statusId];
  if (!battle || !target || target.hp <= 0 || !definition) return false;
  target.statuses ||= {};
  const previous = target.statuses[statusId];
  const requestedStacks = Math.max(1, Number(options.stacks || 1));
  const stackCapMultiplier = source?.id === battle.playerId && battle.playerKitId === "spiritArchmage" ? 2 : 1;
  const stacks = statusId === "burn"
    ? 1
    : Math.min((definition.maxStacks || 1) * stackCapMultiplier, (previous?.stacks || 0) + requestedStacks);
  const potency = Math.max(0.5, Number(options.potency || source?.statusPotency || 1));
  const tickDamage = Math.max(previous?.tickDamage || 0, Math.max(1, Math.round((options.damage || definition.damage || 0) * potency)));
  target.statuses[statusId] = {
    id: statusId,
    stacks,
    expiresAt: battle.elapsed + effectDuration(target, definition, source, options),
    nextTickAt: previous?.nextTickAt && previous.nextTickAt > battle.elapsed ? previous.nextTickAt : battle.elapsed + (definition.tickMs || 0),
    tickDamage,
    armorShred: Math.max(previous?.armorShred || 0, Number(options.armorShred || 0)),
    sourceId: source?.id || previous?.sourceId || null
  };
  if (statusId === "frost" && stacks >= definition.maxStacks) {
    const freezeMs = Math.round(900 * (1 - Math.max(0, target.statusResistance || 0)) * (target.boss ? 0.5 : 1));
    target.frozenUntil = Math.max(target.frozenUntil || 0, battle.elapsed + Math.max(300, freezeMs));
  }
  return true;
}

export function dispelHarmfulStatus(target) {
  if (!target?.statuses) return null;
  for (const statusId of ["stun", "frost", "decay", "poison", "bleed", "burn"]) {
    if (!target.statuses[statusId]) continue;
    delete target.statuses[statusId];
    if (statusId === "frost") target.frozenUntil = 0;
    return STATUS_EFFECT_DEFS[statusId];
  }
  return null;
}

function healingMultiplier(target) {
  return target.statuses?.decay ? 0.65 : 1;
}

function healCombatant(target, amount) {
  if (!target || target.hp <= 0 || amount <= 0) return 0;
  const adjusted = Math.max(0, Math.round(amount * healingMultiplier(target)));
  const healed = Math.min(adjusted, target.maxHp - target.hp);
  target.hp += healed;
  return healed;
}

function actorDisabled(actor, battle) {
  return Boolean(actor.statuses?.stun || (actor.frozenUntil || 0) > battle.elapsed);
}

function speedDebuffMultiplier(actor) {
  const frostStacks = actor.statuses?.frost?.stacks || 0;
  const poisonStacks = actor.statuses?.poison?.stacks || 0;
  return Math.max(0.5, 1 - frostStacks * 0.12 - poisonStacks * 0.05);
}

function hasteSpeedMultiplier(actor, battle) {
  const haste = actor.positiveEffects?.haste;
  return haste && haste.endsAt > battle.elapsed ? (haste.speedMultiplier || 1) : 1;
}

function hasteAttackDivisor(actor, battle) {
  const haste = actor.positiveEffects?.haste;
  return haste && haste.endsAt > battle.elapsed ? (haste.attackSpeedMultiplier || 1) : 1;
}

function tickCombatantEffects(battle, actor, step) {
  actor.statuses ||= {};
  actor.positiveEffects ||= {};
  if (actor.hp <= 0) return;
  for (const [statusId, effect] of Object.entries(actor.statuses)) {
    const definition = STATUS_EFFECT_DEFS[statusId];
    if (!definition || battle.elapsed >= effect.expiresAt) {
      delete actor.statuses[statusId];
      continue;
    }
    if (definition.tickMs && effect.nextTickAt <= battle.elapsed) {
      const stacks = statusId === "bleed" || statusId === "poison" ? effect.stacks : 1;
      const damage = Math.max(1, effect.tickDamage * stacks);
      actor.hp = Math.max(0, actor.hp - damage);
      actor.lastHit = 260;
      effect.nextTickAt += definition.tickMs;
      if (actor.hp <= 0) pushBattleLog(battle, `${actor.name}이 ${definition.name}으로 쓰러졌다.`);
    }
  }
  const regeneration = actor.positiveEffects.regeneration;
  if (regeneration) {
    if (battle.elapsed >= regeneration.endsAt) delete actor.positiveEffects.regeneration;
    else if (regeneration.nextTickAt <= battle.elapsed) {
      healCombatant(actor, regeneration.amount);
      regeneration.nextTickAt += 1000;
    }
  }
  for (const [effectId, effect] of Object.entries(actor.positiveEffects)) {
    if (effect.endsAt && battle.elapsed >= effect.endsAt) delete actor.positiveEffects[effectId];
  }
  if (actor.hp > 0 && actor.hpRegen > 0) {
    actor.regenRemainder = (actor.regenRemainder || 0) + actor.hpRegen * (step / 1000);
    const whole = Math.floor(actor.regenRemainder);
    if (whole > 0) {
      healCombatant(actor, whole);
      actor.regenRemainder -= whole;
    }
  }
  if (actor.hp > 0 && actor.manaRegen > 0 && actor.maxMana > 0) {
    actor.mana = Math.min(actor.maxMana, actor.mana + actor.manaRegen * (step / 1000));
  }
}

function tickGroundEffects(battle) {
  for (const effect of battle.groundEffects || []) {
    if (battle.elapsed >= effect.endsAt || effect.nextPulseAt > battle.elapsed) continue;
    const targets = living(effect.team === "unit" ? battle.enemies : battle.units).filter((target) => distanceBetween(effect, target) <= effect.radius);
    const source = [...battle.units, ...battle.enemies].find((actor) => actor.id === effect.sourceId) || null;
    for (const target of targets) applyCombatStatus(battle, target, effect.statusId, source, effect.statusOptions || {});
    effect.nextPulseAt += effect.pulseMs;
  }
  battle.groundEffects = (battle.groundEffects || []).filter((effect) => battle.elapsed < effect.endsAt);
}

function ensureBasePassiveState(battle, unitId) {
  battle.passiveState ||= {};
  battle.passiveState[unitId] ||= { hitCount: 0, soulStacks: 0, soulExpiresAt: 0, harvestedEnemyIds: [], lastActionAt: 0 };
  return battle.passiveState[unitId];
}

function markUnitActive(battle, unit) {
  ensureBasePassiveState(battle, unit.id).lastActionAt = battle.elapsed;
}

function markPlayerActive(battle) {
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  if (player) markUnitActive(battle, player);
}

function applyBasePassiveEffect(battle, unit, passive) {
  const state = ensureBasePassiveState(battle, unit.id);
  const announce = Boolean(unit.controlled);
  if (passive.effect === "soulHarvest") {
    if (state.soulStacks > 0 && battle.elapsed >= state.soulExpiresAt) {
      state.soulStacks = 0;
      state.soulExpiresAt = 0;
      if (announce) pushBattleLog(battle, `${passive.name}: 붙잡아 둔 영혼이 흩어졌다.`);
    }
    const newlyDefeated = battle.enemies.filter((enemy) => enemy.hp <= 0 && !state.harvestedEnemyIds.includes(enemy.id));
    if (newlyDefeated.length) {
      state.harvestedEnemyIds.push(...newlyDefeated.map((enemy) => enemy.id));
      const previous = state.soulStacks || 0;
      state.soulStacks = Math.min(passive.maxStacks || 3, previous + newlyDefeated.length);
      state.soulExpiresAt = battle.elapsed + (passive.durationMs || 12000);
      if (announce && state.soulStacks > previous) pushBattleLog(battle, `${passive.name}: 영혼 ${state.soulStacks}/${passive.maxStacks}`);
    }
    const summonMultiplier = 1 + (state.soulStacks || 0) * (passive.summonDamagePerStack || 0);
    unit.passiveDamageMultiplier = summonMultiplier;
    if (announce) {
      for (const summon of battle.units.filter((entry) => entry.summonType)) summon.passiveDamageMultiplier = summonMultiplier;
    }
  } else if (passive.effect === "rageScaling") {
    unit.rageBaseArmor ??= unit.armor;
    unit.rageBaseHpRegen ??= unit.hpRegen;
    const missing = unit.hp > 0 ? 1 - unit.hp / unit.maxHp : 0;
    const berserk = unit.positiveEffects?.berserk?.endsAt > battle.elapsed ? unit.positiveEffects.berserk : null;
    unit.passiveDamageMultiplier = 1 + missing * (passive.damagePerMissing || 0.6) + (berserk?.bonus || 0);
    unit.armor = Math.min(0.58, unit.rageBaseArmor + missing * (passive.armorPerMissing || 0.15));
    unit.hpRegen = unit.rageBaseHpRegen + missing * (passive.hpRegenPerMissing || 1.5);
  } else if (passive.effect === "manaFocus") {
    const manaRatio = unit.maxMana > 0 ? unit.mana / unit.maxMana : 1;
    unit.passiveDamageMultiplier = 1 + manaRatio * (passive.damagePerMana || 0.4);
  } else if (passive.effect === "stealthWhenIdle") {
    const isPlayer = unit.id === battle.playerId;
    if (isPlayer && battle.playerKitId === "heavyTracker") {
      // 중갑 추적자는 은신 대신 저격 태세를 쓰므로 자동 은신을 받지 않는다.
    } else {
      const idleMs = isPlayer && battle.playerKitId === "spiritTracker" ? 1800 : (passive.idleMs || 3000);
      const idleFor = battle.elapsed - (state.lastActionAt || 0);
      if (idleFor >= idleMs) {
        unit.positiveEffects ||= {};
        unit.positiveEffects.stealth = { endsAt: battle.elapsed + 500 };
      }
    }
  }
}

function refreshBaseClassPassive(battle) {
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  if (player?.hp > 0 && battle.playerBasePassive) applyBasePassiveEffect(battle, player, battle.playerBasePassive);
  if (player?.hp > 0 && battle.playerKitId === "archeryMaehwa") {
    const state = battle.passiveState?.[battle.playerId];
    const idleFor = battle.elapsed - (state?.lastActionAt || 0);
    if (idleFor >= 2000) {
      player.positiveEffects ||= {};
      player.positiveEffects.stealth = { endsAt: battle.elapsed + 500 };
    }
  }
  for (const companion of battle.units) {
    if (companion.id === battle.playerId || companion.hp <= 0 || !companion.basePassive) continue;
    applyBasePassiveEffect(battle, companion, companion.basePassive);
  }
}

function recordUnitHit(battle, target, damage) {
  if (target.team !== "unit" || target.hp <= 0 || damage <= 0) return;
  markUnitActive(battle, target);
  const passive = target.basePassive;
  if (passive?.effect !== "hitCycleHeal") return;
  const state = ensureBasePassiveState(battle, target.id);
  state.hitCount = (state.hitCount || 0) + 1;
  if (state.hitCount < passive.hitsRequired) return;
  state.hitCount = 0;
  const amount = Math.max(1, Math.round(target.maxHp * passive.healRatio));
  const healed = healCombatant(target, amount);
  if (target.controlled) pushBattleLog(battle, `${passive.name}: 피격 순환 완성 · 체력 ${healed} 회복`);
}

export function tickAutoBattle(battle, deltaMs) {
  if (!battle || battle.status !== "active") return battle?.status || "idle";
  const step = Math.min(250, Math.max(16, deltaMs));
  battle.elapsed += step;
  const all = [...battle.units, ...battle.enemies];
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  if (player?.hp > 0 && !actorDisabled(player, battle)) {
    const inputX = Number(battle.playerMoveInput?.x || 0);
    const inputY = Number(battle.playerMoveInput?.y || 0);
    const inputLength = Math.hypot(inputX, inputY);
    if (inputLength > 0.08) {
      const normalizedX = inputX / Math.max(1, inputLength);
      const normalizedY = inputY / Math.max(1, inputLength);
      const travel = player.speed * speedDebuffMultiplier(player) * hasteSpeedMultiplier(player, battle) * Math.min(1, inputLength) * (step / 1000);
      player.moveTarget = null;
      const moved = resolveMove(battle, player.x + normalizedX * travel, player.y + normalizedY * travel);
      player.x = moved.x;
      player.y = moved.y;
      battle.playerFacing = Math.atan2(normalizedY, normalizedX);
    } else if (player.moveTarget) {
      const dx = player.moveTarget.x - player.x;
      const dy = player.moveTarget.y - player.y;
      const distance = Math.hypot(dx, dy);
      const travel = player.speed * speedDebuffMultiplier(player) * hasteSpeedMultiplier(player, battle) * (step / 1000);
      if (distance <= travel || distance < 0.8) {
        const arrived = resolveMove(battle, player.moveTarget.x, player.moveTarget.y);
        player.x = arrived.x;
        player.y = arrived.y;
        player.moveTarget = null;
      } else {
        const stepped = resolveMove(battle, player.x + (dx / distance) * travel, player.y + (dy / distance) * travel);
        player.x = stepped.x;
        player.y = stepped.y;
        battle.playerFacing = Math.atan2(dy, dx);
      }
    }
  }
  for (const actor of all) tickCombatantEffects(battle, actor, step);
  tickGroundEffects(battle);
  refreshBaseClassPassive(battle);
  if (battle.hazard && battle.elapsed >= battle.nextHazardAt) {
    const damage = Math.max(0, 2 - Math.floor((battle.hazardMitigation || 0) / 2));
    if (damage > 0) {
      for (const unit of living(battle.units)) {
        if (unit.invulnerable) continue;
        unit.hp = Math.max(0, unit.hp - damage);
        unit.lastHit = 260;
      }
      pushBattleLog(battle, `${battle.hazard.name}: 원정대 피해 ${damage}`);
    } else {
      pushBattleLog(battle, `${battle.hazard.name} 대응 성공`);
    }
    battle.nextHazardAt += 5200;
  }
  wakeNearbyFieldGroups(battle);
  checkFieldTriggers(battle);
  advanceBossZones(battle);
  for (const actor of all) {
    if (actor.hp <= 0) continue;
    // 아직 안 깨어난 무리는 시간도 흐르지 않는다 — 쿨다운·재생이 진행되면
    // 플레이어가 멀리서 다른 무리와 싸우는 동안 이쪽이 유리해져 버린다.
    if (actor.dormant) continue;
    actor.cooldown = Math.max(0, actor.cooldown - step * speedDebuffMultiplier(actor));
    actor.lastHit = Math.max(0, actor.lastHit - step);
    if (actor.team === "unit" && actor.heal && Number.isFinite(actor.healMs)) {
      actor.healCooldown -= step;
      if (actor.healCooldown <= 0) {
        const damaged = living(battle.units).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        if (damaged && damaged.hp < damaged.maxHp) {
          const amount = healCombatant(damaged, actor.heal);
          actor.healCooldown = actor.healMs;
          pushBattleLog(battle, `${actor.name}이 ${damaged.name}을 ${amount} 회복시켰다.`);
        }
      }
    }
    if (actor.controlled) continue;
    if (actorDisabled(actor, battle)) {
      actor.telegraphTargetId = null;
      continue;
    }
    const targets = living(actor.team === "unit" ? battle.enemies : battle.units).filter((entry) => !entry.invulnerable);
    if (!targets.length) {
      actor.telegraphTargetId = null;
      continue;
    }
    let target = null;
    if (actor.team === "enemy" && actor.forcedTargetUntil > battle.elapsed && actor.forcedTargetId) {
      target = targets.find((entry) => entry.id === actor.forcedTargetId) || null;
    }
    if (actor.team === "unit" && battle.command.focusUntil > battle.elapsed && battle.focusTargetId) {
      target = targets.find((entry) => entry.id === battle.focusTargetId) || null;
    }
    target ||= nearestTarget(actor, targets);
    const distance = distanceBetween(target, actor);

    // 보스 패턴은 평타보다 우선한다. 시전 중에는 이동도 평타도 하지 않는다 —
    // 예고와 본체 행동이 겹치면 무엇을 보고 피해야 할지 알 수 없어진다.
    if (actor.patterns?.length) {
      if ((actor.castingUntil || 0) > battle.elapsed) {
        actor.telegraphTargetId = null;
        continue;
      }
      const pattern = pickBossPattern(battle, actor);
      if (pattern) {
        spawnBossZone(battle, actor, pattern, target);
        actor.telegraphTargetId = null;
        continue;
      }
    }

    const chargeBoost = actor.team === "unit" && battle.command.chargeUntil > battle.elapsed;
    if (distance > actor.range) {
      actor.telegraphTargetId = null;
      if ((actor.rootedUntil || 0) > battle.elapsed) continue;
      const dx = target.x - actor.x;
      const dy = target.y - actor.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      actor.x += (dx / length) * actor.speed * speedDebuffMultiplier(actor) * (chargeBoost ? 1.7 : 1) * (step / 1000);
      actor.y += (dy / length) * actor.speed * speedDebuffMultiplier(actor) * (chargeBoost ? 1.7 : 1) * (step / 1000);
      const chased = resolveMove(battle, actor.x, actor.y);
      actor.x = chased.x;
      actor.y = chased.y;
      continue;
    }
    actor.telegraphTargetId = actor.cooldown > 0 && actor.cooldown <= ATTACK_TELEGRAPH_MS ? target.id : null;
    if (actor.cooldown > 0) continue;
    const dodging = target.id === battle.playerId && battle.playerDodgeUntil > battle.elapsed;
    const personalDefense = (target.defenseUntil || 0) > battle.elapsed ? (target.defenseMultiplier || 0.55) : 1;
    // 회피 감소량은 직업별 회피 정의에서 온다(방패 막기가 이동기보다 더 줄여준다).
    const dodgeReduction = 1 - playerDodgeDefinition(battle.playerKitId).reduction;
    const guardReduction = (dodging ? dodgeReduction : target.team === "unit" && battle.command.guardUntil > battle.elapsed ? 0.5 : 1) * personalDefense;
    const armorReduction = 1 - effectiveArmor(target);
    const activeBuffs = actor.team === "unit"
      ? [battle.command.chargeUntil, battle.command.guardUntil, battle.command.focusUntil].filter((until) => until > battle.elapsed).length
      : 0;
    const lowHealthBonus = actor.hp / actor.maxHp <= 0.5 ? actor.finisher : 1;
    const carryBonus = 1 + activeBuffs * actor.buffCarry;
    const chargeDamage = chargeBoost ? 1.35 + actor.chargeDamage : 1;
    const rawDamage = actor.damage * (actor.passiveDamageMultiplier || 1) * chargeDamage * lowHealthBonus * carryBonus;
    const fullDamage = Math.max(1, Math.round(rawDamage * guardReduction * armorReduction));
    const isPlayerTarget = target.id === battle.playerId;
    const dodgeChance = (target.team === "unit" && target.basePassive?.effect === "dodgeChance" ? target.basePassive.chance || 0 : 0)
      + (isPlayerTarget ? Math.min(0.3, (actor.maehwaMarks || 0) * 0.05) : 0);
    const dodged = dodgeChance > 0 && battleRoll(battle) < dodgeChance;
    actor.cooldown = actor.attackMs;
    actor.telegraphTargetId = null;
    if (dodged) {
      pushBattleLog(battle, `${target.name}이 ${actor.name}의 공격을 회피했다.`);
    } else {
      const shield = target.positiveEffects?.shield;
      let damage = fullDamage;
      if (shield && shield.amount > 0) {
        const absorbed = Math.min(shield.amount, damage);
        shield.amount -= absorbed;
        damage -= absorbed;
        if (shield.amount <= 0) delete target.positiveEffects.shield;
      }
      target.hp = Math.max(0, target.hp - damage);
      actor.attackCount = (actor.attackCount || 0) + 1;
      if (target.hp > 0 && actor.poisonDamage) applyCombatStatus(battle, target, "poison", actor, { stacks: actor.poisonDamage });
      if (target.hp > 0 && actor.statusOnHit && actor.attackCount % (actor.statusEvery || 1) === 0) {
        applyCombatStatus(battle, target, actor.statusOnHit.id, actor, actor.statusOnHit);
      }
      if (target.hp > 0 && target.positiveEffects?.frostRetaliation?.endsAt > battle.elapsed) {
        applyCombatStatus(battle, actor, "frost", target, { stacks: 1 });
      }
      if (target.hp > 0 && target.positiveEffects?.bleedRetaliation?.endsAt > battle.elapsed) {
        applyCombatStatus(battle, actor, "bleed", target, { stacks: 1 });
      }
      if (isPlayerTarget && battle.playerKitId === "heavyCrusader" && damage > 0) {
        battle.vengeanceStored = Math.min(240, (battle.vengeanceStored || 0) + damage * (battle.vengeanceGainBoostUntil > battle.elapsed ? 1 : 0.5));
      }
      if (isPlayerTarget && battle.playerKitId === "spiritCrusader" && damage > 0 && battleRoll(battle) < 0.25) {
        applyCombatStatus(battle, actor, battleRoll(battle) < 0.5 ? "burn" : "frost", target, { stacks: 1 });
      }
      if (actor.lifeSteal && actor.hp > 0) actor.hp = Math.min(actor.maxHp, actor.hp + Math.max(1, Math.floor(damage * actor.lifeSteal)));
      target.lastHit = 260;
      recordUnitHit(battle, target, damage);
      if (target.hp <= 0) pushBattleLog(battle, `${actor.name}이 ${target.name}을 쓰러뜨렸다.`);
    }
    if (actor.team === "unit") markUnitActive(battle, actor);
  }
  refreshBaseClassPassive(battle);
  if (!living(battle.enemies).length) {
    // 필드 전투는 적을 다 잡아도 끝나지 않는다 — 정리한 뒤 던전 입구까지
    // 걸어가야 하므로 전투를 계속 active로 두고 "정리됨" 표시만 남긴다.
    if (battle.fieldMode) {
      if (!battle.fieldCleared) {
        battle.fieldCleared = true;
        pushBattleLog(battle, "필드의 무리를 모두 정리했다. 던전 입구로 이동할 수 있다.");
      }
    } else {
      battle.status = "victory";
      pushBattleLog(battle, `교전 승리 · 고철 ${battle.rewardScrap} 확보`);
    }
  } else if (!living(battle.units).length) {
    battle.status = "defeated";
    pushBattleLog(battle, "부대가 전멸했다.");
  }
  return battle.status;
}

export function moveBattlePlayer(battle, x, y) {
  if (!battle || battle.status !== "active") return false;
  const player = battle.units.find((unit) => unit.id === battle.playerId && unit.hp > 0);
  if (!player) return false;
  // 목적지가 바위 안이면 도달 불가능한 지점이 되므로 미리 가장자리로 밀어낸다.
  player.moveTarget = resolveMove(battle, Number(x), Number(y));
  return true;
}

export function steerBattlePlayer(battle, x, y) {
  if (!battle || battle.status !== "active") return false;
  const player = battle.units.find((unit) => unit.id === battle.playerId && unit.hp > 0);
  if (!player) return false;
  const rawX = Number(x) || 0;
  const rawY = Number(y) || 0;
  const length = Math.hypot(rawX, rawY);
  battle.playerMoveInput = length > 1
    ? { x: rawX / length, y: rawY / length }
    : { x: rawX, y: rawY };
  if (length > 0.08) {
    player.moveTarget = null;
    battle.playerFacing = Math.atan2(rawY, rawX);
  }
  return true;
}

export function selectPlayerTarget(battle, targetId) {
  if (!battle || battle.status !== "active") return false;
  const target = battle.enemies.find((enemy) => enemy.id === targetId && enemy.hp > 0);
  if (!target) return false;
  battle.playerTargetId = target.id;
  pushBattleLog(battle, `개척자 목표 지정: ${target.name}`);
  return true;
}

function damageCombatant(attacker, target, multiplier = 1) {
  if (target.invulnerable) return 0;
  const damage = Math.max(1, Math.round(attacker.damage * (attacker.passiveDamageMultiplier || 1) * multiplier * (1 - effectiveArmor(target))));
  target.hp = Math.max(0, target.hp - damage);
  target.lastHit = 320;
  return damage;
}

function damageArea(battle, attacker, center, radius, multiplier) {
  const targets = living(battle.enemies).filter((enemy) => distanceBetween(center, enemy) <= radius);
  let totalDamage = 0;
  for (const enemy of targets) totalDamage += damageCombatant(attacker, enemy, multiplier);
  return { targets, totalDamage };
}

function summonWeapon(species) {
  return ({ goblin: "greatsword", orc: "warhammer", wolf: "ironTeeth", bear: "ironClaws" })[species] || "greatsword";
}

function applySummonScaling(battle, summon, player, bossSummon = false, armed = true) {
  const power = Math.max(1, player.summonPower || 1);
  const baseHp = summon.baseMaxHp || summon.maxHp;
  const baseDamage = summon.baseDamage || summon.damage;
  summon.maxHp = Math.max(20, Math.round(baseHp * power * (bossSummon ? 1.05 : 0.72)));
  summon.hp = summon.maxHp;
  summon.damage = Math.max(4, Math.round(baseDamage * power * (bossSummon ? 1.0 : 0.82)));
  summon.armor = Math.min(0.58, (summon.armor || 0) + (bossSummon ? 0.18 : 0.12));
  summon.attackMs = Math.round(summon.attackMs * (bossSummon ? 1.08 : 1.18));
  if (armed) {
    summon.weaponOverlay = summonWeapon(summon.species);
    if (summon.weaponOverlay === "ironTeeth" || summon.weaponOverlay === "ironClaws") {
      summon.statusOnHit = { id: "bleed", stacks: bossSummon ? 2 : 1 };
      summon.statusEvery = bossSummon ? 2 : 3;
    }
  }
  const passive = battle.playerBasePassive;
  summon.passiveDamageMultiplier = passive?.effect === "soulHarvest"
    ? 1 + (battle.passiveState?.[battle.playerId]?.soulStacks || 0) * (passive.summonDamagePerStack || 0)
    : 1;
}

function raisedDead(battle) {
  return battle.units.filter((unit) => unit.summonType === "raisedDead" && unit.hp > 0);
}

function raiseAvailableCorpses(battle, player, { limit = 3, armed = true } = {}) {
  const slots = Math.max(0, Math.min(limit, 3 - raisedDead(battle).length));
  if (!slots) return [];
  const corpses = battle.enemies.filter((enemy) => enemy.hp <= 0 && !enemy.boss && !battle.consumedCorpseIds.includes(enemy.id)).slice(0, slots);
  const summons = [];
  for (const corpse of corpses) {
    battle.consumedCorpseIds.push(corpse.id);
    battle.enemies.splice(battle.enemies.indexOf(corpse), 1);
    corpse.team = "unit";
    corpse.summonType = "raisedDead";
    corpse.role = armed ? "무장 망자" : "하급 망자";
    corpse.name = armed ? `무장 ${corpse.name} 망자` : `하급 ${corpse.name} 망자`;
    corpse.boss = false;
    corpse.statuses = {};
    corpse.positiveEffects = {};
    corpse.cooldown = 300;
    corpse.lastHit = 0;
    corpse.x = Math.max(7, Math.min(93, player.x + 4 + summons.length * 2));
    corpse.y = Math.max(10, Math.min(90, player.y - 5 + summons.length * 5));
    applySummonScaling(battle, corpse, player, false, armed);
    battle.units.push(corpse);
    summons.push(corpse);
  }
  return summons;
}

function summonStoredBoss(battle, player) {
  const stored = battle.storedBoss;
  if (!stored) return null;
  battle.units = battle.units.filter((unit) => unit.summonType !== "storedBoss");
  const summon = createCombatant(
    { ...stored, id: `stored_${stored.defId || stored.species}`, name: `철갑 ${stored.name}`, boss: false, preScaled: true },
    `summon-stored-boss-${Math.round(battle.elapsed)}`,
    "unit",
    6,
    { level: player.level }
  );
  summon.summonType = "storedBoss";
  summon.role = "봉인 우두머리";
  summon.normalPatternsOnly = true;
  summon.x = Math.max(7, Math.min(93, player.x + 7));
  summon.y = Math.max(10, Math.min(90, player.y + 5));
  applySummonScaling(battle, summon, player, true);
  battle.units.push(summon);
  return summon;
}

function applyKitPassive(battle, player) {
  if (battle.playerKitId === "heavyNecromancer") {
    const stacks = battle.passiveState?.[battle.playerId]?.soulStacks || 0;
    player.necroBaseArmor ??= player.armor;
    player.armor = Math.min(0.58, player.necroBaseArmor + stacks * 0.03);
  }
  if (battle.playerKitId === "archeryNecromancer") {
    const stacks = battle.passiveState?.[battle.playerId]?.soulStacks || 0;
    const surge = player.positiveEffects?.spiritSurge?.endsAt > battle.elapsed ? 0.3 : 0;
    player.passiveDamageMultiplier = 1 + stacks * 0.06 + surge;
    if (stacks > 0) {
      player.positiveEffects ||= {};
      player.positiveEffects.stealth = { endsAt: battle.elapsed + 500 };
    }
  }
  if (battle.playerKitId === "spiritArchmage") {
    player.statusPotency = Math.max(player.statusPotency || 1, 1.25);
    if (player.positiveEffects?.elementalSurge?.endsAt > battle.elapsed) {
      player.statusPotency = Math.max(player.statusPotency, 1.5);
    }
    const manaRatio = player.maxMana > 0 ? player.mana / player.maxMana : 0;
    player.manaRegenBase ??= player.manaRegen;
    player.manaRegen = player.manaRegenBase * (1 + (1 - manaRatio) * 0.8);
    if (!battle.units.some((unit) => unit.summonType === "spiritWisp" && unit.hp > 0)) {
      const wisp = createCombatant(
        { id: "spiritWisp", name: "정령 결속", glyph: "♧", color: "#8fd0b0", maxHp: 20, damage: 4, range: 18, speed: 14, attackMs: 900, armor: 0 },
        `summon-wisp-${Math.round(battle.elapsed)}`,
        "unit",
        5,
        { level: player.level }
      );
      wisp.summonType = "spiritWisp";
      wisp.role = "정령";
      wisp.x = Math.max(7, Math.min(93, player.x + 4));
      wisp.y = Math.max(10, Math.min(90, player.y - 4));
      applySummonScaling(battle, wisp, player, false, false);
      wisp.invulnerable = true;
      battle.units.push(wisp);
      pushBattleLog(battle, "자연 친화: 정령이 나타나 함께 싸운다.");
    }
  }
  if (battle.playerKitId === "holyArchmage") {
    const manaRatio = player.maxMana > 0 ? player.mana / player.maxMana : 0;
    player.healingPower = Math.max(player.healingPower || 1, 1 + manaRatio * 0.5);
    const allyMultiplier = 1 + manaRatio * 0.3;
    for (const ally of living(battle.units)) {
      if (ally.id === player.id) continue;
      ally.passiveDamageMultiplier = allyMultiplier;
    }
  }
  if (battle.playerKitId === "heavyTracker" && player.positiveEffects?.siegeMode?.endsAt > battle.elapsed) {
    player.defenseUntil = Math.max(player.defenseUntil || 0, battle.elapsed + 1500);
    player.defenseMultiplier = Math.min(player.defenseMultiplier ?? 1, 0.7);
  }
}

function resolvePlayerSkill(battle, player, skill) {
  const target = battle.enemies.find((enemy) => enemy.id === battle.playerTargetId && enemy.hp > 0)
    || nearestTarget(player, living(battle.enemies));
  if (target) battle.playerTargetId = target.id;

  if (skill.effect === "spiritMending") {
    const ally = living(battle.units).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    if (!ally) return false;
    const dispelled = dispelHarmfulStatus(ally);
    const healed = healCombatant(ally, 12 * player.healingPower);
    ally.positiveEffects ||= {};
    ally.positiveEffects.regeneration = {
      amount: Math.max(1, Math.round(2.5 * player.healingPower)),
      nextTickAt: battle.elapsed + 1000,
      endsAt: battle.elapsed + 5200
    };
    pushBattleLog(battle, `${skill.name}: ${ally.name} ${healed} 회복${dispelled ? ` · ${dispelled.name} 해제` : ""} · 지속 회복`);
  } else if (skill.effect === "winterAegis") {
    for (const unit of living(battle.units)) {
      unit.defenseUntil = battle.elapsed + 5200;
      unit.defenseMultiplier = 0.55;
      unit.positiveEffects ||= {};
      unit.positiveEffects.frostRetaliation = { endsAt: battle.elapsed + 5200 };
    }
    pushBattleLog(battle, `${skill.name}: 아군 ${living(battle.units).length}명 보호 · 피격 시 빙결`);
  } else if (skill.effect === "thunderLance") {
    if (!target || distanceBetween(player, target) > 50) return false;
    const damage = damageCombatant(player, target, 1.7);
    if (target.hp > 0) applyCombatStatus(battle, target, "stun", player, { durationMs: 900 });
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해 · 기절`);
  } else if (skill.effect === "spiritBulwark") {
    const taunted = living(battle.enemies).filter((enemy) => distanceBetween(player, enemy) <= 30);
    for (const enemy of taunted) {
      enemy.forcedTargetId = player.id;
      enemy.forcedTargetUntil = battle.elapsed + 4200;
    }
    player.defenseUntil = battle.elapsed + 4200;
    player.defenseMultiplier = 0.55;
    pushBattleLog(battle, `${skill.name}: 적 ${taunted.length}명의 시선을 끌고 방어를 높였다.`);
  } else if (skill.effect === "spiritConflagration") {
    const result = damageArea(battle, player, player, 26, 1.1);
    for (const enemy of result.targets) applyCombatStatus(battle, enemy, "burn", player);
    battle.groundEffects.push({ x: player.x, y: player.y, radius: 25, team: "unit", sourceId: player.id, statusId: "burn", statusOptions: {}, pulseMs: 600, nextPulseAt: battle.elapsed + 600, endsAt: battle.elapsed + 5600 });
    pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명 타격 · 불 장판 5.6초`);
  } else if (skill.effect === "storedApex") {
    const summon = summonStoredBoss(battle, player);
    if (!summon) return false;
    let extra = " · 일반 전투 패턴만 사용";
    if (battle.playerKitId === "heavyNecromancer") {
      summon.maxHp = Math.round(summon.maxHp * 1.3);
      summon.hp = summon.maxHp;
      summon.damage = Math.round(summon.damage * 1.3);
      summon.normalPatternsOnly = false;
      extra = " · 공방 강화 · 특수 패턴 해금";
    } else if (battle.playerKitId === "archeryNecromancer") {
      player.positiveEffects ||= {};
      player.positiveEffects.berserk = { bonus: 0.3, lifeSteal: 0.15, endsAt: battle.elapsed + 8000 };
      extra = " · 광폭화";
    }
    pushBattleLog(battle, `${skill.name}: ${summon.name} 소환${extra}`);
  } else if (skill.effect === "holyBlessing") {
    const ally = living(battle.units).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    if (!ally) return false;
    const healed = healCombatant(ally, 12 * player.healingPower);
    pushBattleLog(battle, `${skill.name}: ${ally.name} ${healed} 회복`);
  } else if (skill.effect === "holyWard") {
    for (const unit of living(battle.units)) {
      unit.defenseUntil = battle.elapsed + 4600;
      unit.defenseMultiplier = 0.6;
    }
    pushBattleLog(battle, `${skill.name}: 아군 ${living(battle.units).length}명 보호`);
  } else if (skill.effect === "holyLance") {
    if (!target || distanceBetween(player, target) > 46) return false;
    const damage = damageCombatant(player, target, 1.4);
    if (target.hp > 0) applyCombatStatus(battle, target, "stun", player, { durationMs: 800 });
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해 · 기절`);
  } else if (skill.effect === "holyBulwark") {
    const taunted = living(battle.enemies).filter((enemy) => distanceBetween(player, enemy) <= 30);
    for (const enemy of taunted) {
      enemy.forcedTargetId = player.id;
      enemy.forcedTargetUntil = battle.elapsed + 4200;
    }
    player.defenseUntil = battle.elapsed + 4200;
    player.defenseMultiplier = 0.55;
    pushBattleLog(battle, `${skill.name}: 적 ${taunted.length}명의 시선을 끌고 방어를 높였다.`);
  } else if (skill.effect === "holyJudgment") {
    if (!target || distanceBetween(player, target) > 55) return false;
    const result = damageArea(battle, player, target, 26, 1.1);
    pushBattleLog(battle, `${skill.name}: ${result.targets.length}명에게 신성 파도`);
  } else if (skill.effect === "spiritDecay") {
    const heavy = battle.playerKitId === "heavyNecromancer";
    const archer = battle.playerKitId === "archeryNecromancer";
    const summonAtk = heavy ? battle.units.filter((unit) => unit.summonType && unit.hp > 0).reduce((sum, unit) => sum + unit.damage, 0) : 0;
    const result = damageArea(battle, player, player, 22, 0.55 + summonAtk * 0.01);
    for (const enemy of result.targets) applyCombatStatus(battle, enemy, "decay", player, archer ? { armorShred: 0.12 } : {});
    pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명에게 부패${archer ? " · 방어 감소" : ""}`);
  } else if (skill.effect === "spiritBolt") {
    if (!target || distanceBetween(player, target) > 50) return false;
    const heavy = battle.playerKitId === "heavyNecromancer";
    const archer = battle.playerKitId === "archeryNecromancer";
    const crit = archer && battleRoll(battle) < 0.5;
    const damage = damageCombatant(player, target, crit ? 1.9 : 1.3);
    if (heavy) {
      const summons = battle.units.filter((unit) => unit.summonType && unit.hp > 0);
      const bestArmor = summons.reduce((max, unit) => Math.max(max, unit.armor || 0), 0);
      if (bestArmor > 0) {
        player.defenseUntil = battle.elapsed + 4000;
        player.defenseMultiplier = Math.min(player.defenseMultiplier ?? 1, 1 - bestArmor * 0.4);
      }
    }
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해${crit ? " · 치명타" : ""}`);
  } else if (skill.effect === "spiritRaise") {
    if (battle.spiritRaiseUsed) return false;
    const heavy = battle.playerKitId === "heavyNecromancer";
    const archer = battle.playerKitId === "archeryNecromancer";
    const summons = raiseAvailableCorpses(battle, player, { limit: 3, armed: heavy });
    if (!summons.length) return false;
    const hpBonus = heavy ? 0.5 : 0.3;
    const dmgBonus = heavy || archer ? 0.5 : 0.3;
    for (const summon of summons) {
      summon.maxHp = Math.round(summon.maxHp + player.maxHp * hpBonus);
      summon.hp = summon.maxHp;
      summon.damage = Math.round(summon.damage + player.damage * dmgBonus);
    }
    battle.spiritRaiseUsed = true;
    const flavor = heavy ? " · 무장 강화" : archer ? " · 공격력 폭증" : "";
    pushBattleLog(battle, `${skill.name}: 망자 ${summons.length}기 부활 · 전투당 1회${flavor}`);
  } else if (skill.effect === "spiritWard") {
    player.defenseUntil = battle.elapsed + 5400;
    player.defenseMultiplier = 0.6;
    healCombatant(player, 8);
    let extra = "";
    if (battle.playerKitId === "heavyNecromancer") {
      const summons = battle.units.filter((unit) => unit.summonType && unit.hp > 0);
      for (const summon of summons) {
        summon.defenseUntil = battle.elapsed + 5400;
        summon.defenseMultiplier = Math.min(summon.defenseMultiplier ?? 1, 0.7);
        summon.passiveDamageMultiplier = Math.max(summon.passiveDamageMultiplier || 1, 1.25);
      }
      extra = summons.length ? ` · 소환수 ${summons.length}기 강화` : "";
    } else if (battle.playerKitId === "archeryNecromancer") {
      player.positiveEffects ||= {};
      player.positiveEffects.spiritSurge = { endsAt: battle.elapsed + 5400 };
      extra = " · 공격력 상승";
    }
    pushBattleLog(battle, `${skill.name}: 자신 방어 강화 · 소량 회복${extra}`);
  } else if (skill.effect === "battleRoar") {
    const isSpiritBarbarian = battle.playerKitId === "spiritBarbarian";
    const missing = player.hp > 0 ? 1 - player.hp / player.maxHp : 0;
    const berserkActive = player.positiveEffects?.berserk?.endsAt > battle.elapsed;
    const factor = (isSpiritBarbarian ? 1.35 : 1.25) + missing * (isSpiritBarbarian ? 0.5 : 0.35) + (berserkActive ? 0.2 : 0);
    player.positiveEffects ||= {};
    player.positiveEffects.haste = { speedMultiplier: factor, attackSpeedMultiplier: factor, endsAt: battle.elapsed + 5000 };
    pushBattleLog(battle, `${skill.name}: 공격·이동 속도 상승`);
  } else if (skill.effect === "earthSlam") {
    const result = damageArea(battle, player, player, 20, 1.0);
    if (battle.playerKitId === "spiritBarbarian") {
      for (const enemy of result.targets) if (enemy.hp > 0) applyCombatStatus(battle, enemy, "bleed", player, { stacks: 1 });
    }
    pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명 타격`);
  } else if (skill.effect === "recklessCharge") {
    if (!target) return false;
    const isSpiritBarbarian = battle.playerKitId === "spiritBarbarian";
    dashToTarget(player, target, isSpiritBarbarian ? 2 : 6, battle);
    const damage = damageCombatant(player, target, 1.5);
    if (isSpiritBarbarian) {
      player.positiveEffects ||= {};
      player.positiveEffects.haste = { speedMultiplier: 1.3, attackSpeedMultiplier: 1.3, endsAt: battle.elapsed + 2000 };
    }
    pushBattleLog(battle, `${skill.name}: ${target.name}에게 돌진해 ${damage} 피해`);
  } else if (skill.effect === "cleave") {
    if (!target || distanceBetween(player, target) > 18) return false;
    const damage = damageCombatant(player, target, battle.playerKitId === "spiritBarbarian" ? 2.4 : 1.6);
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해`);
  } else if (skill.effect === "berserkerRage") {
    const isSpiritBarbarian = battle.playerKitId === "spiritBarbarian";
    player.positiveEffects ||= {};
    player.positiveEffects.berserk = { bonus: isSpiritBarbarian ? 0.5 : 0.35, lifeSteal: 0.25, endsAt: battle.elapsed + 8000 };
    if (isSpiritBarbarian) {
      player.positiveEffects.wolfForm = { endsAt: battle.elapsed + 8000 };
      pushBattleLog(battle, `${skill.name}: 격노가 폭증하고 늑대인간으로 변신했다.`);
    } else {
      pushBattleLog(battle, `${skill.name}: 격노가 폭증하고 흡혈이 붙었다.`);
    }
  } else if (skill.effect === "aimedShot") {
    if (!target || distanceBetween(player, target) > 60) return false;
    const damage = damageCombatant(player, target, 1.5);
    if (target.hp > 0 && battle.playerKitId === "spiritTracker") applyCombatStatus(battle, target, "stun", player, { durationMs: 1200 });
    if (target.hp > 0 && battle.playerKitId === "heavyTracker") {
      const behind = living(battle.enemies).find((enemy) => enemy.id !== target.id && distanceBetween(target, enemy) <= 10);
      if (behind) damageCombatant(player, behind, 1.0);
    }
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해`);
  } else if (skill.effect === "scatterShot") {
    if (!target || distanceBetween(player, target) > 55) return false;
    const sieged = Boolean(player.positiveEffects?.siegeMode);
    const result = damageArea(battle, player, target, sieged ? 30 : 22, sieged ? 1.3 : 0.75);
    if (battle.playerKitId === "spiritTracker") {
      for (const enemy of result.targets) if (enemy.hp > 0) applyCombatStatus(battle, enemy, "burn", player);
    }
    if (battle.playerKitId === "heavyTracker") {
      for (const enemy of result.targets) if (enemy.hp > 0) applyCombatStatus(battle, enemy, "stun", player, { durationMs: 900 });
    }
    pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명 타격${sieged ? " · 포격 강화" : ""}`);
  } else if (skill.effect === "shadowStrike") {
    if (!target || distanceBetween(player, target) > 16) return false;
    const damage = damageCombatant(player, target, 1.4);
    if (battle.playerKitId === "heavyTracker") {
      const nearby = living(battle.enemies).filter((enemy) => distanceBetween(player, enemy) <= 14);
      for (const enemy of nearby) knockback(player, enemy, 6, battle);
      pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해 · 주변 넉백`);
    } else {
      retreatFromTarget(player, target, 8, battle);
      if (battle.playerKitId === "spiritTracker" && target.hp > 0) {
        const nearby = living(battle.enemies).filter((enemy) => distanceBetween(target, enemy) <= 14);
        for (const enemy of nearby) applyCombatStatus(battle, enemy, "frost", player, { stacks: 1 });
      }
      pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해 · 후퇴`);
    }
  } else if (skill.effect === "vanish") {
    player.positiveEffects ||= {};
    if (battle.playerKitId === "heavyTracker") {
      player.positiveEffects.siegeMode = { endsAt: battle.elapsed + 7000 };
      player.positiveEffects.haste = { speedMultiplier: 0.08, attackSpeedMultiplier: 0.55, endsAt: battle.elapsed + 7000 };
      player.defenseUntil = battle.elapsed + 7000;
      player.defenseMultiplier = 0.55;
      pushBattleLog(battle, `${skill.name}: 저격 태세 돌입 · 방어 강화, 이동·공속 저하`);
    } else {
      player.positiveEffects.stealth = { endsAt: battle.elapsed + 4000 };
      if (battle.playerKitId === "spiritTracker") {
        player.positiveEffects.haste = { speedMultiplier: 1.25, attackSpeedMultiplier: 1, endsAt: battle.elapsed + 4000 };
      }
      pushBattleLog(battle, `${skill.name}: 즉시 은신했다.`);
    }
  } else if (skill.effect === "arrowStorm") {
    if (!target || distanceBetween(player, target) > 60) return false;
    const result = damageArea(battle, player, target, 30, 1.3);
    if (battle.playerKitId === "spiritTracker") {
      for (const enemy of result.targets) {
        const statusId = ["burn", "frost", "poison"][Math.floor(battleRoll(battle) * 3)];
        applyCombatStatus(battle, enemy, statusId, player);
      }
    }
    pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명에게 화살 세례${battle.playerKitId === "spiritTracker" ? " · 상태이상" : ""}`);
  } else if (skill.effect === "swiftStrike") {
    if (!target) return false;
    dashToTarget(player, target, 5, battle);
    const stealthy = battle.playerKitId === "archeryMaehwa" && Boolean(player.positiveEffects?.stealth);
    const damage = damageCombatant(player, target, stealthy ? 2.6 : 1.4);
    if (stealthy) delete player.positiveEffects.stealth;
    if (battle.playerKitId === "magicMaehwa" && target.hp > 0) applyCombatStatus(battle, target, "burn", player);
    pushBattleLog(battle, `${skill.name}: ${target.name}에게 접근해 ${damage} 피해${stealthy ? " · 은신 암습" : ""}`);
  } else if (skill.effect === "whirlwindSlash") {
    const result = damageArea(battle, player, player, 18, 0.85);
    if (battle.playerKitId === "magicMaehwa") {
      for (const enemy of result.targets) if (enemy.hp > 0) applyCombatStatus(battle, enemy, "frost", player, { stacks: 1 });
    }
    if (battle.playerKitId === "archeryMaehwa") {
      const nearest = nearestTarget(player, living(battle.enemies));
      if (nearest) retreatFromTarget(player, nearest, 10, battle);
      player.positiveEffects ||= {};
      player.positiveEffects.stealth = { endsAt: battle.elapsed + 2000 };
    }
    pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명 타격`);
  } else if (skill.effect === "phantomCut") {
    const maxRange = battle.playerKitId === "magicMaehwa" ? 50 : 20;
    if (!target || distanceBetween(player, target) > maxRange) return false;
    const hadBuffs = Boolean(target.positiveEffects && Object.keys(target.positiveEffects).length);
    target.positiveEffects = {};
    const critical = battle.playerKitId === "archeryMaehwa" && battleRoll(battle) < 0.35;
    const damage = damageCombatant(player, target, (hadBuffs ? 2.0 : 1.6) * (critical ? 1.5 : 1));
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해${hadBuffs ? " · 이로운 효과 제거" : ""}${critical ? " · 치명타" : ""}`);
  } else if (skill.effect === "fleetStep") {
    player.positiveEffects ||= {};
    player.positiveEffects.haste = { speedMultiplier: 1.15, attackSpeedMultiplier: 1.5, endsAt: battle.elapsed + 5000 };
    player.positiveEffects.decayOnHit = { endsAt: battle.elapsed + 5000 };
    if (battle.playerKitId === "archeryMaehwa") player.positiveEffects.stealth = { endsAt: battle.elapsed + 1500 };
    pushBattleLog(battle, `${skill.name}: 공격 속도가 크게 상승 · 표식 부여 시작`);
  } else if (skill.effect === "plumBlossomDance") {
    if (!target || distanceBetween(player, target) > 22) return false;
    const marks = target.maehwaMarks || 0;
    const stealthy = battle.playerKitId === "archeryMaehwa" && Boolean(player.positiveEffects?.stealth);
    const damage = damageCombatant(player, target, 1.5 + marks * 0.3 + (stealthy ? 1.0 : 0));
    target.maehwaMarks = 0;
    if (stealthy) delete player.positiveEffects.stealth;
    if (battle.playerKitId === "magicMaehwa" && target.hp > 0) {
      applyCombatStatus(battle, target, "burn", player);
      applyCombatStatus(battle, target, "frost", player, { stacks: 1 });
    }
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해 · 표식 제거${stealthy ? " · 은신 일격" : ""}`);
  } else if (skill.effect === "fireBolt") {
    if (!target || distanceBetween(player, target) > 55) return false;
    if (battle.playerKitId === "holyArchmage") {
      const result = damageArea(battle, player, target, 20, 1.1);
      const healed = healCombatant(player, Math.round(player.maxHp * 0.06));
      pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명에게 신성 피해 · 자신 ${healed} 회복`);
    } else {
      const damage = damageCombatant(player, target, 1.4);
      if (target.hp > 0) applyCombatStatus(battle, target, "burn", player);
      if (battle.playerKitId === "spiritArchmage") {
        const nearby = living(battle.enemies).filter((enemy) => enemy.id !== target.id && distanceBetween(target, enemy) <= 14);
        for (const enemy of nearby) {
          damageCombatant(player, enemy, 0.8);
          if (enemy.hp > 0) applyCombatStatus(battle, enemy, "burn", player);
        }
      }
      pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해 · 화상`);
    }
  } else if (skill.effect === "frostNova") {
    if (!target || distanceBetween(player, target) > 55) return false;
    if (battle.playerKitId === "holyArchmage") {
      const result = damageArea(battle, player, target, 22, 0.9);
      for (const enemy of result.targets) applyCombatStatus(battle, enemy, "decay", player);
      pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명에게 신성 피해 · 지속 피해`);
    } else {
      const alreadyFrosted = new Set(living(battle.enemies).filter((enemy) => enemy.statuses?.frost).map((enemy) => enemy.id));
      const result = damageArea(battle, player, target, 22, 0.9);
      for (const enemy of result.targets) {
        if (battle.playerKitId === "spiritArchmage" && alreadyFrosted.has(enemy.id) && enemy.hp > 0) damageCombatant(player, enemy, 0.6);
        applyCombatStatus(battle, enemy, "frost", player, { stacks: 1 });
      }
      pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명에게 냉기 피해 · 빙결`);
    }
  } else if (skill.effect === "gravityWell") {
    if (!target || distanceBetween(player, target) > 55) return false;
    const pulled = living(battle.enemies).filter((enemy) => distanceBetween(target, enemy) <= 26);
    for (const enemy of pulled) {
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      const pull = Math.min(dist, 10);
      const pulledTo = resolveMove(battle, enemy.x + (dx / dist) * pull, enemy.y + (dy / dist) * pull);
      enemy.x = pulledTo.x;
      enemy.y = pulledTo.y;
    }
    if (battle.playerKitId === "holyArchmage") {
      for (const enemy of pulled) {
        enemy.rootedUntil = battle.elapsed + 2600;
        applyCombatStatus(battle, enemy, "decay", player);
      }
      pushBattleLog(battle, `${skill.name}: 적 ${pulled.length}명을 속박하고 지속 피해를 남겼다.`);
    } else {
      let totalDamage = 0;
      for (const enemy of pulled) totalDamage += damageCombatant(player, enemy, 0.9);
      if (battle.playerKitId === "spiritArchmage" && pulled.length) {
        player.positiveEffects ||= {};
        player.positiveEffects.elementalSurge = { endsAt: battle.elapsed + 4000 };
      }
      pushBattleLog(battle, `${skill.name}: 적 ${pulled.length}명을 끌어당겨 ${totalDamage} 피해${battle.playerKitId === "spiritArchmage" ? " · 원소 폭주" : ""}`);
    }
  } else if (skill.effect === "lightningRicochet") {
    if (battle.playerKitId === "holyArchmage") {
      const healAmount = Math.max(1, Math.round(player.maxHp * 0.05 * (player.healingPower || 1)));
      const shieldAmount = Math.max(1, Math.round(player.maxHp * 0.06));
      const chainHeal = (unit) => {
        const healed = healCombatant(unit, healAmount);
        unit.positiveEffects ||= {};
        unit.positiveEffects.shield = { amount: (unit.positiveEffects.shield?.amount || 0) + shieldAmount, endsAt: battle.elapsed + 6000 };
        return healed;
      };
      let current = living(battle.units).sort((a, b) => distanceBetween(player, a) - distanceBetween(player, b))[0];
      if (!current) return false;
      let totalHealed = chainHeal(current);
      let hits = 1;
      const alreadyHit = new Set([current.id]);
      for (let bounce = 0; bounce < 2; bounce += 1) {
        const next = living(battle.units)
          .filter((unit) => !alreadyHit.has(unit.id) && distanceBetween(current, unit) <= 20)
          .sort((a, b) => distanceBetween(current, a) - distanceBetween(current, b))[0];
        if (!next) break;
        totalHealed += chainHeal(next);
        alreadyHit.add(next.id);
        current = next;
        hits += 1;
      }
      pushBattleLog(battle, `${skill.name}: 아군 ${hits}명에게 신성한 빛 연쇄 · 회복 ${totalHealed} · 보호막 부여`);
    } else {
      if (!target || distanceBetween(player, target) > 55) return false;
      const overload = battle.playerKitId === "spiritArchmage";
      const overloadBonus = (enemy) => {
        if (!overload || enemy.hp <= 0) return 0;
        const stacks = statusStackTotal(enemy);
        if (stacks <= 0) return 0;
        const bonus = Math.max(1, Math.round(player.damage * (player.passiveDamageMultiplier || 1) * stacks * 0.2 * (1 - effectiveArmor(enemy))));
        enemy.hp = Math.max(0, enemy.hp - bonus);
        return bonus;
      };
      let current = target;
      let totalDamage = damageCombatant(player, current, 1.3);
      totalDamage += overloadBonus(current);
      let hits = 1;
      const alreadyHit = new Set([current.id]);
      if (current.hp > 0) applyCombatStatus(battle, current, "stun", player, { durationMs: 700 });
      for (let bounce = 0; bounce < 2; bounce += 1) {
        const next = living(battle.enemies)
          .filter((enemy) => !alreadyHit.has(enemy.id) && distanceBetween(current, enemy) <= 20)
          .sort((a, b) => distanceBetween(current, a) - distanceBetween(current, b))[0];
        if (!next) break;
        totalDamage += damageCombatant(player, next, 1.0);
        totalDamage += overloadBonus(next);
        alreadyHit.add(next.id);
        current = next;
        hits += 1;
        if (current.hp > 0) applyCombatStatus(battle, current, "stun", player, { durationMs: 700 });
      }
      pushBattleLog(battle, `${skill.name}: 적 ${hits}명에게 번개 연쇄 ${totalDamage} 피해 · 감전${overload ? " · 상태이상 폭주 피해" : ""}`);
    }
  } else if (skill.effect === "triElementJudgment") {
    if (!target || distanceBetween(player, target) > 50) return false;
    const radius = 12;
    const frostResult = damageArea(battle, player, target, radius, 0.85);
    for (const enemy of frostResult.targets) applyCombatStatus(battle, enemy, "frost", player, { stacks: 1 });
    const lightningResult = damageArea(battle, player, target, radius, 0.85);
    for (const enemy of lightningResult.targets) applyCombatStatus(battle, enemy, "stun", player, { durationMs: 1000 });
    const fireResult = damageArea(battle, player, target, radius, 0.85);
    for (const enemy of fireResult.targets) applyCombatStatus(battle, enemy, "burn", player);
    const totalDamage = frostResult.totalDamage + lightningResult.totalDamage + fireResult.totalDamage;
    pushBattleLog(battle, `${skill.name}: 빙결 → 감전 → 화상을 연속으로 내리쳐 ${totalDamage} 피해`);
  } else if (skill.effect === "manaBurst") {
    if (!target || distanceBetween(player, target) > 50) return false;
    const result = damageArea(battle, player, target, 16, 1.7);
    pushBattleLog(battle, `${skill.name}: 적 ${result.targets.length}명에게 순수 마력 피해`);
  } else if (skill.effect === "heavyBlessing") {
    const ally = living(battle.units).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    if (!ally) return false;
    const vengeance = battle.vengeanceStored || 0;
    const bonus = Math.round(vengeance * 0.5);
    battle.vengeanceStored = vengeance - bonus;
    const healed = healCombatant(ally, 10 * player.healingPower + bonus);
    pushBattleLog(battle, `${skill.name}: ${ally.name} ${healed} 회복`);
  } else if (skill.effect === "heavyWard") {
    for (const unit of living(battle.units)) {
      unit.defenseUntil = battle.elapsed + 4600;
      unit.defenseMultiplier = 0.6;
      unit.positiveEffects ||= {};
      unit.positiveEffects.bleedRetaliation = { endsAt: battle.elapsed + 4600 };
    }
    pushBattleLog(battle, `${skill.name}: 아군 ${living(battle.units).length}명 보호 · 피격 시 출혈 반격`);
  } else if (skill.effect === "heavyLance") {
    if (!target || distanceBetween(player, target) > 46) return false;
    const vengeance = battle.vengeanceStored || 0;
    const bonus = Math.min(1.2, vengeance * 0.01);
    battle.vengeanceStored = vengeance * 0.5;
    const damage = damageCombatant(player, target, 1.4 + bonus);
    if (target.hp > 0) {
      applyCombatStatus(battle, target, "stun", player, { durationMs: 800 });
      applyCombatStatus(battle, target, "bleed", player, { stacks: 1 });
    }
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해 · 기절 · 출혈`);
  } else if (skill.effect === "heavyBulwark") {
    const taunted = living(battle.enemies).filter((enemy) => distanceBetween(player, enemy) <= 30);
    for (const enemy of taunted) {
      enemy.forcedTargetId = player.id;
      enemy.forcedTargetUntil = battle.elapsed + 4200;
    }
    player.defenseUntil = battle.elapsed + 4200;
    player.defenseMultiplier = 0.55;
    battle.vengeanceGainBoostUntil = battle.elapsed + 4200;
    pushBattleLog(battle, `${skill.name}: 적 ${taunted.length}명의 시선을 끌고 복수치 축적 속도가 크게 늘었다.`);
  } else if (skill.effect === "heavyJudgment") {
    if (!target || distanceBetween(player, target) > 55) return false;
    const vengeance = battle.vengeanceStored || 0;
    const result = damageArea(battle, player, target, 26, 1.1 + vengeance * 0.012);
    for (const enemy of result.targets) applyCombatStatus(battle, enemy, "bleed", player, { stacks: 3 });
    battle.vengeanceStored = 0;
    pushBattleLog(battle, `${skill.name}: ${result.targets.length}명에게 복수의 출혈`);
  } else if (skill.effect === "elementalConvergence") {
    if (!target || distanceBetween(player, target) > 55) return false;
    const result = damageArea(battle, player, target, 24, 1.2);
    for (const enemy of result.targets) {
      applyCombatStatus(battle, enemy, "burn", player);
      applyCombatStatus(battle, enemy, "frost", player, { stacks: 1 });
      applyCombatStatus(battle, enemy, "decay", player);
    }
    pushBattleLog(battle, `${skill.name}: ${result.targets.length}명에게 삼원소 재앙`);
  } else if (skill.effect === "heavenlyJudgment") {
    if (!target || distanceBetween(player, target) > 55) return false;
    const result = damageArea(battle, player, target, 26, 1.1);
    for (const unit of living(battle.units)) {
      healCombatant(unit, 10 * (player.healingPower || 1));
      unit.positiveEffects ||= {};
      unit.positiveEffects.shield = { amount: Math.round(unit.maxHp * 0.08), endsAt: battle.elapsed + 4000 };
    }
    pushBattleLog(battle, `${skill.name}: ${result.targets.length}명 타격 · 아군 전체 회복 및 축복`);
  } else if (skill.effect === "piercingShot") {
    if (!target || distanceBetween(player, target) > 55) return false;
    const sieged = Boolean(player.positiveEffects?.siegeMode);
    const damage = damageCombatant(player, target, sieged ? 3.4 : 2.4);
    if (target.hp > 0) target.rootedUntil = battle.elapsed + 2000;
    pushBattleLog(battle, `${skill.name}: ${target.name} ${damage} 피해 · 강한 속박${sieged ? " · 포격 강화" : ""}`);
  } else {
    return false;
  }
  applyKitPassive(battle, player);
  markPlayerActive(battle);
  battle.lastPlayerSkillId = skill.id;
  return true;
}

export function issuePlayerAction(battle, action) {
  if (!battle || battle.status !== "active") return false;
  battle.lastPlayerSkillId = null;
  const player = battle.units.find((unit) => unit.id === battle.playerId && unit.hp > 0);
  if (!player || actorDisabled(player, battle) || (battle.playerReadyAt[action] || 0) > battle.elapsed) return false;
  if (action === "dodge") {
    const dodge = playerDodgeDefinition(battle.playerKitId);
    battle.playerDodgeUntil = battle.elapsed + dodge.durationMs;
    battle.playerReadyAt.dodge = battle.elapsed + dodge.cooldownMs;

    if (dodge.type === "dash") {
      // 바라보는 방향으로 즉시 이동한다. 예고 장판에서 빠져나오는 게 주 용도라
      // 이동은 즉발이어야 한다 — 이동하는 동안 장판이 터지면 회피의 의미가 없다.
      const facing = battle.playerFacing || 0;
      const moved = resolveMove(
        battle,
        player.x + Math.cos(facing) * dodge.distance,
        player.y + Math.sin(facing) * dodge.distance
      );
      player.x = moved.x;
      player.y = moved.y;
      player.moveTarget = null;
    }
    pushBattleLog(battle, `${dodge.name}: ${dodge.logSuffix}`);
    return true;
  }
  const target = battle.enemies.find((enemy) => enemy.id === battle.playerTargetId && enemy.hp > 0)
    || nearestTarget(player, living(battle.enemies));
  if (action === "attack") {
    if (!target) return false;
    battle.playerTargetId = target.id;
    if (distanceBetween(player, target) > player.range) {
      pushBattleLog(battle, "기본 공격 실패: 적에게 더 가까이 이동해야 한다.");
      battle.playerReadyAt.attack = battle.elapsed + 280;
      return false;
    }
    const stealthy = Boolean(player.positiveEffects?.stealth);
    const damage = Math.max(1, Math.round(player.damage * (player.passiveDamageMultiplier || 1) * (stealthy ? 1.8 : 1) * (1 - effectiveArmor(target))));
    target.hp = Math.max(0, target.hp - damage);
    target.lastHit = 260;
    if (stealthy) delete player.positiveEffects.stealth;
    if (target.hp > 0 && battle.playerKitId === "spiritBarbarian") applyCombatStatus(battle, target, "bleed", player, { stacks: 1 });
    if (target.hp > 0 && battle.playerKitId === "heavyTracker" && player.positiveEffects?.siegeMode?.endsAt > battle.elapsed) knockback(player, target, 5, battle);
    if (target.hp > 0 && player.positiveEffects?.decayOnHit?.endsAt > battle.elapsed) {
      target.maehwaMarks = Math.min(5, (target.maehwaMarks || 0) + 1);
      if (battle.playerKitId === "magicMaehwa") applyCombatStatus(battle, target, "frost", player, { stacks: 1 });
    }
    const lifeSteal = player.positiveEffects?.berserk?.endsAt > battle.elapsed ? player.positiveEffects.berserk.lifeSteal || 0 : 0;
    if (lifeSteal > 0) player.hp = Math.min(player.maxHp, player.hp + Math.max(1, Math.round(damage * lifeSteal)));
    battle.playerReadyAt.attack = battle.elapsed + player.attackMs / hasteAttackDivisor(player, battle);
    markPlayerActive(battle);
    if (target.hp <= 0) {
      pushBattleLog(battle, `개척자가 ${target.name}을 쓰러뜨렸다.`);
      if (player.positiveEffects?.wolfForm?.endsAt > battle.elapsed) player.positiveEffects.wolfForm.endsAt += 3000;
    }
    refreshBaseClassPassive(battle);
    return true;
  }
  if (["skill1", "skill2", "skill3"].includes(action)) {
    const slot = Number(action.slice(-1)) - 1;
    const skillId = battle.playerSkillIds?.[slot];
    const skill = playerSkillDefinition(battle.playerKitId, skillId);
    if (!skill || !resolvePlayerSkill(battle, player, skill)) return false;
    battle.playerReadyAt[action] = battle.elapsed + skill.cooldownMs * (player.cooldownMultiplier || 1);
    refreshBaseClassPassive(battle);
    return true;
  }
  if (action === "ultimate") {
    const ultimate = playerUltimateDefinition(battle.playerKitId);
    if (!ultimate || !resolvePlayerSkill(battle, player, ultimate)) return false;
    battle.playerReadyAt.ultimate = battle.elapsed + ultimate.cooldownMs * (player.cooldownMultiplier || 1);
    refreshBaseClassPassive(battle);
    return true;
  }
  return false;
}

export function issueBattleCommand(battle, command, targetId = null) {
  if (!battle || battle.status !== "active") return false;
  if ((battle.commandReadyAt[command] || 0) > battle.elapsed) return false;
  if (command === "focus") {
    const target = battle.enemies.find((entry) => entry.id === targetId && entry.hp > 0)
      || living(battle.enemies).sort((a, b) => a.hp - b.hp)[0];
    if (!target) return false;
    battle.focusTargetId = target.id;
    battle.command.focusUntil = battle.elapsed + 5000 * (1 + battle.commandAura);
    battle.commandReadyAt.focus = battle.elapsed + 7000 * (1 - battle.commandAura);
    pushBattleLog(battle, `집중 공격 지정: ${target.name}`);
  }
  if (command === "guard") {
    battle.command.guardUntil = battle.elapsed + 4000 * (1 + battle.commandAura);
    battle.commandReadyAt.guard = battle.elapsed + 9000 * (1 - battle.commandAura);
    pushBattleLog(battle, "방어진 전개: 받는 피해 감소");
  }
  if (command === "charge") {
    battle.command.chargeUntil = battle.elapsed + 3200 * (1 + battle.commandAura);
    battle.commandReadyAt.charge = battle.elapsed + 8500 * (1 - battle.commandAura);
    pushBattleLog(battle, "돌격 명령: 이동·공격 강화");
  }
  return true;
}

export function completeBattle(run) {
  const battle = run?.battle;
  if (!battle || battle.status === "active") return null;
  if (battle.status === "defeated") {
    run.status = "defeated";
    run.result = { type: "defeated", title: "원정대 붕괴", description: "개척자와 동료들이 모두 쓰러졌다. 확보한 전리품의 절반만 회수한다." };
    return run.result;
  }
  const zone = battle.sourceZone === "dungeon" ? run.dungeon : run.field;
  const feature = Object.values(zone.features).find((entry) => entry.id === battle.sourceFeatureId);
  if (feature) feature.cleared = true;
  run.cargo.scrap += battle.rewardScrap;
  run.encountersWon += 1;
  const xp = battle.boss ? 12 : 4;
  for (const unitId of run.party || []) run.unitXp[unitId] = (run.unitXp[unitId] || 0) + xp;
  run.commanderXp = (run.commanderXp || 0) + xp;
  if (battle.boss) {
    const region = WORLD_REGION_DEFS[run.regionId];
    const capturable = battle.enemies.find((enemy) => enemy.boss)
      || [...battle.enemies].sort((a, b) => (b.baseMaxHp || b.maxHp) - (a.baseMaxHp || a.maxHp))[0];
    if (capturable) {
      run.capturedBoss = {
        defId: capturable.defId,
        name: capturable.name,
        species: capturable.species || "bear",
        variant: capturable.variant || `${region.direction} 우두머리`,
        glyph: capturable.glyph,
        color: capturable.color,
        maxHp: capturable.baseMaxHp || Math.round(capturable.maxHp / 2.15),
        damage: capturable.baseDamage || capturable.damage,
        range: capturable.range,
        speed: capturable.speed,
        attackMs: capturable.attackMs,
        armor: capturable.armor || 0
      };
    }
    run.bossDefeated = true;
    run.status = "completed";
    run.cargo.materials[region.rewardMaterial] = (run.cargo.materials[region.rewardMaterial] || 0) + region.rewardAmount;
    run.result = { type: "completed", title: `${region.dungeonName} 정복`, description: `던전 지배자를 쓰러뜨렸다. 희귀 재료와 ${run.capturedBoss?.name || "우두머리"}의 봉인 정보를 가져간다.` };
  } else {
    run.result = { type: "battleVictory", title: "조우 승리", description: `부대가 자동 교전에서 승리했다. 고철 ${battle.rewardScrap}개를 확보했다.` };
  }
  return run.result;
}

export function enterRunDungeon(run) {
  if (!run?.pendingEntrance || run.location !== "field") return false;
  run.dungeon ||= createDungeon(run.seed + 1717, run.regionId, run.bossEncounterId);
  run.location = "dungeon";
  run.dungeonEntered = true;
  run.player = { ...run.dungeon.start };
  run.pendingEntrance = false;
  run.pendingExit = false;
  revealCurrentZone(run);
  return true;
}

export function enterRunSettlement(run) {
  if (!run?.pendingSettlement || run.location !== "field") return null;
  const pending = run.pendingSettlement;
  const feature = Object.values(run.field.features).find((entry) => entry.id === pending.featureId);
  if (!feature) return null;
  feature.visited = true;
  run.settlementVisit = { featureId: feature.id, name: feature.name, firstVisit: pending.firstVisit };
  run.pendingSettlement = null;
  return feature;
}

export function leaveRunSettlement(run) {
  if (!run?.settlementVisit) return false;
  run.settlementVisit = null;
  return true;
}

export function leaveRunDungeon(run) {
  if (!run || run.location !== "dungeon" || !run.pendingExit) return false;
  run.location = "field";
  run.player = { x: run.field.entrance.x, y: run.field.entrance.y };
  run.pendingExit = false;
  run.pendingEntrance = false;
  revealCurrentZone(run);
  return true;
}

export function explorationPath(tiles, start, target, blocked = new Set()) {
  if (!tiles[target.y] || tiles[target.y][target.x] !== "floor") return [];
  const queue = [{ x: start.x, y: start.y }];
  const previous = new Map([[keyOf(start.x, start.y), null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current.x === target.x && current.y === target.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = keyOf(x, y);
      if (tiles[y]?.[x] !== "floor" || blocked.has(key) || previous.has(key)) continue;
      previous.set(key, keyOf(current.x, current.y));
      queue.push({ x, y });
    }
  }
  const targetKey = keyOf(target.x, target.y);
  if (!previous.has(targetKey)) return [];
  const path = [];
  let cursor = targetKey;
  while (cursor) {
    const [x, y] = cursor.split(",").map(Number);
    path.push({ x, y });
    cursor = previous.get(cursor);
  }
  return path.reverse();
}

export function adventureZoneIsConnected(zone) {
  const reached = reachableKeys(zone.tiles, zone.start);
  return Object.entries(zone.features)
    .filter(([, feature]) => ["dungeonEntrance", "dungeonExit", "encounter", "settlement"].includes(feature.type))
    .every(([key]) => reached.has(key));
}
