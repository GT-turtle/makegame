import { ORE_SMELTING_DEFS } from "./data.js";
import { DISCOVERY_SITE_DEFS } from "./frontier.js";
import { COMBAT_TEMPO, ARMOR_MAX_REDUCTION, ARMOR_SOFTCAP, MASTERY_BRANCH_DEFS, MASTERY_STEPS, MASTERY_TRAIT_SLOTS, MASTERY_MAX, masterySlots, masteryBranchUnlocked, masteryXpNeeded, ARMOR_SET_DEFS, armorReduction, combatPowerScore, companionBonuses, EQUIPMENT_DEFS, equippedUniqueEffects, LEGENDARY_CLEAR_REQUIREMENT, legendariesForRegion, PLAYER_BASE_CLASS_DEFS, normalizedPlayerLoadout, playerBaseClassDefinition, playerCombatStats, playerKitDefinition, playerSkillDefinition, playerUltimateDefinition } from "./classes.js";

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
export const FIELD_BOUNDS = { minX: 5, maxX: 815, minY: 8, maxY: 520 };

// 몬스터 무리가 "깨어나는" 거리. 이 거리 밖에서는 적이 플레이어를 추격하지도
// 공격하지도 않아서, 넓은 전장을 한 번에 다 어그로 끌지 않고 무리 단위로
// 차례차례 교전하게 된다.
// 한 지역은 필드 셋을 지나 던전(지역 보스)으로 이어진다(몬스터 컨셉.txt).
// 필드 끝에 닿으면 다음 필드로 넘어가고, 마지막 필드 끝에 던전 입구가 있다.
export const FIELD_STAGE_COUNT = 3;

// 단계가 오를수록 무리를 더 깔고 적도 더 붙인다.
export function fieldStageGroups(stage = 1) {
  return 3 + Math.max(0, Math.min(FIELD_STAGE_COUNT, stage) - 1);
}

// 다음 필드로 넘어가는 지점. 마지막 단계에서는 던전 입구가 그 자리를 대신한다.
export function fieldExitTrigger(stage, bounds) {
  if (stage >= FIELD_STAGE_COUNT) return null;
  return {
    id: `field-exit-${stage}`,
    type: "fieldExit",
    name: `${stage + 1}번째 필드`,
    stage,
    x: bounds.maxX - 30,
    y: (bounds.minY + bounds.maxY) / 2,
    radius: 10,
    // 뒤에 남겨둔 무리를 상대하지 않고 지나갈 수 있다 — 필드는 통로지 관문이 아니다.
    requiresClear: false
  };
}

export const FIELD_AGGRO_RADIUS = 26;

// 예고. 이 시간 동안 붉은 테두리와 ! 가 뜬 뒤에 판정이 나간다.
// 320ms일 때는 반응속도(250ms 근처)와 겹쳐서 볼 틈이 없었다.
export const ATTACK_TELEGRAPH_MS = 700;

// 회피 버튼의 성격은 직업마다 다르다.
// 크루세이더는 방패를 세워 버티고(이동 없음, 대신 감소량이 크고 오래간다),
// 나머지는 앞으로 파고드는 이동기다(예고 장판을 보고 빠져나오는 용도).
//
// 이동 거리와 감소량은 서로 맞바꾼 값이다 — 이동으로 피할 수 있으면 감소가 덜 필요하고,
// 못 피하는 대신 버티는 쪽은 감소가 커야 한다.
export const PLAYER_DODGE_DEFS = {
  block: {
    type: "block", name: "방패 막기", durationMs: 1500, reduction: 0.85, cooldownMs: 1500,
    logSuffix: "방패를 세워 받는 피해를 크게 줄인다"
  },
  dash: {
    type: "dash", name: "회피 기동", durationMs: 900, reduction: 0.7, cooldownMs: 1500,
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
//
// **모든 패턴의 난이도 기준식**:
//   예고 시간(초) × 플레이어 이동속도(17) > 장판 반경   → 보고 걸어 나갈 수 있다
// 이 부등식이 깨지면 아무리 잘 피해도 못 빠져나오는 패턴이 된다.
// 새 패턴을 추가할 때 반드시 확인할 것(테스트로도 고정해뒀다).
export const BOSS_PATTERN_DEFS = {
  // 원형 장판 — 기본기. 플레이어 발밑에 깔린다.
  // ── 연쇄 장판 (kind: "chain") ──────────────────────────────────────────
  //
  // 보스에서 대상 쪽으로 줄지어 깔리고 **순서대로** 터진다. 무작위 연발
  // (volleyCount)이 운으로 피하는 것이라면, 이건 순서를 읽으면 확실히 피한다.
  //
  // 정답 동작이 다르다는 게 핵심이다:
  //   원형 장판 → 아무 방향으로나 벗어나면 된다
  //   연쇄 장판 → 뒤로 물러나면 다음 칸에 걸린다. **옆으로** 빠져야 한다
  //
  // 회피 가능성: 첫 칸은 예고시간 안에 반경을 벗어나면 되고(원형과 같은 기준),
  // 뒤 칸들은 옆으로 한 번만 빠지면 전부 벗어난다 — 칸이 일직선이기 때문이다.
  // chainIntervalMs가 짧아도 부당하지 않은 이유가 이것이다.
  stoneRow: {
    id: "stoneRow", name: "석주 연쇄", kind: "chain",
    telegraphMs: 1100, radius: 11, damageMultiplier: 1.35,
    chainCount: 4, chainSpacing: 17, chainIntervalMs: 260,
    cooldownMs: 8600, aim: "target"
  },

  // 남부. 촉수가 순서대로 내리꽂힌다. 칸이 좁고 촘촘해서 더 정확히 읽어야 한다.
  tentacleCascade: {
    id: "tentacleCascade", name: "촉수 연타", kind: "chain",
    telegraphMs: 1000, radius: 9, damageMultiplier: 1.2,
    chainCount: 5, chainSpacing: 13, chainIntervalMs: 220,
    status: { id: "bleed", stacks: 1 },
    cooldownMs: 9000, aim: "target"
  },

  // 서부. 맞을 때마다 저주가 쌓인다 — 지역 효과(공포 → 이탈)와 이어진다.
  // 칸이 크고 느려서 피하기는 쉽지만, 한 번 잘못 읽으면 대가가 크다.
  cursedProcession: {
    id: "cursedProcession", name: "저주 행렬", kind: "chain",
    telegraphMs: 1250, radius: 13, damageMultiplier: 1.3,
    chainCount: 3, chainSpacing: 19, chainIntervalMs: 340,
    // 서부 저주는 상태이상이 아니라 별도 누적치다(battle.curse). 여기서는
    // 출혈로 두고, 저주 누적은 지역 효과 쪽에서만 굴린다 — 존재하지 않는
    // 상태 id를 쓰면 조용히 아무 일도 일어나지 않는다.
    status: { id: "bleed", stacks: 2 },
    cooldownMs: 9400, aim: "target"
  },

  groundSlam: {
    id: "groundSlam", name: "대지 강타", kind: "circle",
    telegraphMs: 1050, radius: 15, damageMultiplier: 1.7,
    cooldownMs: 6200, aim: "target"
  },

  // 직선 돌진 — 보스에서 플레이어 방향으로 긴 띠. 옆으로 비켜야 한다.
  // 뒤로 도망치는 게 정답이 아니라는 점에서 원형 장판과 대응법이 다르다.
  chargeRush: {
    id: "chargeRush", name: "돌진", kind: "line",
    telegraphMs: 1150, length: 70, width: 14, damageMultiplier: 1.5,
    cooldownMs: 9000, aim: "target"
  },

  // 연속 장판 — 작은 원이 시간차로 여러 개. 한 번 피하고 끝이 아니라 계속 움직여야 한다.
  frostVolley: {
    id: "frostVolley", name: "빙결 연격", kind: "circle",
    telegraphMs: 900, radius: 11, damageMultiplier: 0.9,
    cooldownMs: 11000, aim: "scatter",
    // 시간차로 3발. 간격이 예고보다 짧아 앞발이 터지기 전에 뒷발이 깔린다.
    volleyCount: 3, volleyIntervalMs: 650, volleySpread: 20,
    status: { id: "frost" }
  },

  // 광역 포효 — 보스 자신을 중심으로 크게. 붙어 있으면 맞으니 거리를 벌려야 한다.
  // 반경이 크지만 예고도 길어서 기준식은 지킨다.
  quakeRoar: {
    id: "quakeRoar", name: "포효", kind: "circle",
    telegraphMs: 1600, radius: 25, damageMultiplier: 1.3,
    cooldownMs: 13000, aim: "self",
    status: { id: "stun", durationMs: 700 }
  },


  // ── 남부: 밀림·물가 ──
  // 촉수 후리기 — 맞으면 보스 쪽으로 끌려온다. 거리를 벌리는 게 정답인 보스라
  // "맞으면 다시 붙어야 한다"는 압박이 생긴다.
  tentacleLash: {
    id: "tentacleLash", name: "촉수 후리기", kind: "cone",
    telegraphMs: 1200, radius: 34, coneDegrees: 90, damageMultiplier: 1.2,
    cooldownMs: 8000, aim: "target", pullDistance: 14
  },

  // 먹물 분사 — 터진 자리에 부패 장판이 남는다. 안전지대가 점점 줄어든다.
  inkSpray: {
    id: "inkSpray", name: "먹물 분사", kind: "circle",
    telegraphMs: 1100, radius: 16, damageMultiplier: 1.1,
    cooldownMs: 10000, aim: "target",
    linger: { statusId: "decay", damageMultiplier: 0.25, durationMs: 6000, pulseMs: 800 }
  },

  // 거미줄 — 피해는 적지만 오래 남고 이동을 늦춘다. 다른 패턴과 겹쳐서 위험해진다.
  webTrap: {
    id: "webTrap", name: "거미줄", kind: "circle",
    telegraphMs: 1200, radius: 18, damageMultiplier: 0.6,
    cooldownMs: 9000, aim: "target",
    linger: { statusId: "poison", damageMultiplier: 0.2, durationMs: 8000, pulseMs: 900 }
  },

  // 독니 — 빠른 단발. 예고가 짧아 반응 속도를 요구한다.
  venomFang: {
    id: "venomFang", name: "독니", kind: "circle",
    telegraphMs: 800, radius: 12, damageMultiplier: 1.4,
    cooldownMs: 6000, aim: "target", status: { id: "poison", stacks: 2 }
  },

  // 똬리 조이기 — 보스 중심 광역. 뱀이 몸을 감는 그림.
  coilCrush: {
    id: "coilCrush", name: "똬리 조이기", kind: "circle",
    telegraphMs: 1500, radius: 24, damageMultiplier: 1.5,
    cooldownMs: 11000, aim: "self", status: { id: "bleed", stacks: 2 }
  },

  // ── 동부: 무예·요괴 ──
  // 여우불 — 시간차 4발. 계속 움직이게 만드는 패턴.
  foxfire: {
    id: "foxfire", name: "여우불", kind: "circle",
    telegraphMs: 900, radius: 10, damageMultiplier: 0.85,
    cooldownMs: 10000, aim: "scatter",
    volleyCount: 4, volleyIntervalMs: 550, volleySpread: 24,
    status: { id: "burn" }
  },

  // 참격 — 부채꼴 검기. 오니 대장의 주력.
  oniCleave: {
    id: "oniCleave", name: "참격", kind: "cone",
    telegraphMs: 1000, radius: 30, coneDegrees: 100, damageMultiplier: 1.6,
    cooldownMs: 7000, aim: "target", status: { id: "bleed", stacks: 1 }
  },

  // 지네 돌진 — 길고 좁은 띠. 옆으로만 피할 수 있다.
  centipedeDash: {
    id: "centipedeDash", name: "지네 돌진", kind: "line",
    telegraphMs: 1000, length: 85, width: 11, damageMultiplier: 1.5,
    cooldownMs: 8000, aim: "target"
  },

  // 산성 분무 — 잔류 부식 장판.
  acidMist: {
    id: "acidMist", name: "산성 분무", kind: "circle",
    telegraphMs: 1200, radius: 17, damageMultiplier: 0.9,
    cooldownMs: 11000, aim: "self",
    linger: { statusId: "decay", damageMultiplier: 0.3, durationMs: 5500, pulseMs: 700 }
  },

  // ── 서부: 기사·마법 ──
  // 망령 돌격 — 듀라한의 직선기.
  wraithCharge: {
    id: "wraithCharge", name: "망령 돌격", kind: "line",
    telegraphMs: 1100, length: 75, width: 15, damageMultiplier: 1.6,
    cooldownMs: 8500, aim: "target", status: { id: "bleed", stacks: 2 }
  },

  // 저주 파동 — 보스 중심 광역 + 회복 감소.
  curseWave: {
    id: "curseWave", name: "저주 파동", kind: "circle",
    telegraphMs: 1450, radius: 24, damageMultiplier: 1.2,
    cooldownMs: 10000, aim: "self", status: { id: "decay" }
  },

  // 용의 숨결 — 넓은 부채꼴 + 불 장판 잔류. 서부 최상위 보스의 주력.
  dragonBreath: {
    id: "dragonBreath", name: "용의 숨결", kind: "cone",
    telegraphMs: 1400, radius: 44, coneDegrees: 75, damageMultiplier: 1.8,
    cooldownMs: 10000, aim: "target",
    linger: { statusId: "burn", damageMultiplier: 0.3, durationMs: 4500, pulseMs: 750 }
  },

  // 날갯짓 — 보스 중심에서 밀어내는 대신 끌어당긴다(용이 붙잡는 그림).
  wingSweep: {
    id: "wingSweep", name: "날갯짓", kind: "circle",
    telegraphMs: 1650, radius: 26, damageMultiplier: 1.1,
    cooldownMs: 12000, aim: "self", pullDistance: 10, status: { id: "stun", durationMs: 600 }
  },

  // 성유물 폭발 — 몰락 제국 리치. 시간차 3발 + 화상.
  relicBurst: {
    id: "relicBurst", name: "성유물 폭발", kind: "circle",
    telegraphMs: 950, radius: 13, damageMultiplier: 1.0,
    cooldownMs: 10500, aim: "scatter",
    volleyCount: 3, volleyIntervalMs: 600, volleySpread: 26,
    status: { id: "burn" }
  },

  // 자가 정화 — 자신에게 걸린 해로운 상태이상을 전부 씻어낸다.
  // 동부 카운터 컨셉(디버프를 스스로 씻어낸다)의 핵심이라 장판이 아니라 자기 대상이다.
  // 예고가 있어서, 보고 나면 "지금 상태이상을 더 쌓아도 소용없다"를 알 수 있다.
  spiritCleanse: {
    id: "spiritCleanse", name: "정화", kind: "cleanse",
    telegraphMs: 900, cooldownMs: 12000, aim: "self"
  },

  // ── 지역 보스 전용 ──
  // 2페이즈 전용 광역기. 장갑이 무너진 뒤 핵이 노출되며 쓰는 큰 기술이라
  // 반경이 크고 예고도 길다.
  coreBurst: {
    id: "coreBurst", name: "핵 폭주", kind: "circle",
    telegraphMs: 1800, radius: 28, damageMultiplier: 1.9,
    cooldownMs: 12000, aim: "self",
    status: { id: "burn" }
  },

  // 2페이즈 연속 돌진. 1페이즈 돌진보다 짧게 여러 번.
  ruinCharge: {
    id: "ruinCharge", name: "붕괴 돌진", kind: "line",
    telegraphMs: 1000, length: 60, width: 12, damageMultiplier: 1.4,
    cooldownMs: 7000, aim: "target"
  },

  // 소환 — 장판이 아니라 잡몹을 부른다. 2페이즈 압박용.
  callPack: {
    id: "callPack", name: "무리 부름", kind: "summon",
    telegraphMs: 1200, summonId: "northWolf", summonCount: 2,
    cooldownMs: 16000, aim: "self"
  }
};

export function bossPatternDefinition(patternId) {
  return BOSS_PATTERN_DEFS[patternId] || null;
}

// 보스 페이즈. HP 50% 이하에서 넘어간다(docs/BOSS_DESIGN.md §1·§2).
// - 필드 보스(extend): 기존 패턴은 그대로 두고 새 패턴을 **추가**한다. 형태 유지.
// - 지역 보스(replace): 패턴 풀을 통째로 **교체**하고 형태가 바뀐다.
export const BOSS_PHASE_THRESHOLD = 0.5;

function updateBossPhase(battle, actor) {
  if (!actor.phase2Patterns?.length || actor.phase >= 2) return;
  if (actor.hp / actor.maxHp > BOSS_PHASE_THRESHOLD) return;

  actor.phase = 2;
  actor.patterns = actor.phaseMode === "replace"
    ? [...actor.phase2Patterns]
    : [...actor.patterns, ...actor.phase2Patterns];

  if (actor.phaseMode === "replace") {
    // 지역 보스는 외형/형태가 바뀐다. 렌더러가 이 플래그를 보고 그린다.
    actor.form = actor.phase2Form || "broken";
    pushBattleLog(battle, `${actor.name}: 형태가 무너지며 다른 존재가 되었다!`);
  } else {
    pushBattleLog(battle, `${actor.name}: 분노하며 새로운 공격을 꺼낸다!`);
  }
  // 전환 직후 바로 패턴이 나가면 연출이 묻힌다. 잠깐 숨을 준다.
  actor.castingUntil = Math.max(actor.castingUntil || 0, battle.elapsed + 700);
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

function pushZone(battle, actor, pattern, shape, delayMs = 0) {
  battle.zones.push({
    id: `zone-${battle.zoneSeq = (battle.zoneSeq || 0) + 1}`,
    ownerId: actor.id,
    patternId: pattern.id,
    name: pattern.name,
    kind: pattern.kind,
    damageMultiplier: pattern.damageMultiplier,
    status: pattern.status || null,
    // 터진 뒤 그 자리에 남는 지속 구역(거미줄·독무·불 장판).
    linger: pattern.linger || null,
    // 맞은 대상을 시전자 쪽으로 끌어당기는 거리(촉수형).
    pullDistance: pattern.pullDistance || 0,
    bornAt: battle.elapsed + delayMs,
    fireAt: battle.elapsed + delayMs + pattern.telegraphMs,
    ...shape
  });
}

// 예고를 깐다. 이 시점에는 피해가 없고, fireAt이 되어야 터진다.
export function spawnBossZone(battle, actor, pattern, target) {
  const center = pattern.aim === "self" ? actor : target;

  if (pattern.kind === "line") {
    // 보스에서 대상 방향으로 뻗는 띠. 뒤로 도망치는 것보다 옆으로 비키는 게 정답이다.
    const angle = Math.atan2(target.y - actor.y, target.x - actor.x);
    pushZone(battle, actor, pattern, {
      x: actor.x, y: actor.y,
      x2: actor.x + Math.cos(angle) * pattern.length,
      y2: actor.y + Math.sin(angle) * pattern.length,
      width: pattern.width,
      angle
    });
  } else if (pattern.kind === "cone") {
    // 보스가 대상을 바라보는 방향으로 펼쳐지는 부채꼴. 옆이나 뒤로 돌아야 한다.
    pushZone(battle, actor, pattern, {
      x: actor.x, y: actor.y,
      radius: pattern.radius,
      angle: Math.atan2(target.y - actor.y, target.x - actor.x),
      halfAngle: (pattern.coneDegrees || 70) * Math.PI / 360
    });
  } else if (pattern.kind === "cleanse") {
    pushZone(battle, actor, pattern, { x: actor.x, y: actor.y, radius: 7 });
  } else if (pattern.kind === "summon") {
    pushZone(battle, actor, pattern, { x: actor.x, y: actor.y, radius: 6 });
  } else if (pattern.kind === "chain") {
    // 순서대로 터지는 장판. volleyCount(무작위 연발)와 다른 점은 **배치가
    // 정해져 있다**는 것이다. 무작위로 흩뿌리면 운으로 피하지만, 줄지어 깔면
    // 순서를 읽는 순간 안전한 경로가 보인다 — 그게 이 패턴이 요구하는 것이다.
    //
    // 보스에서 대상 쪽으로 뻗는다. 첫 칸이 대상 발밑이라
    // "뒤로 물러나면 다음 칸에 걸리고, 옆으로 빠지면 전부 피한다"가 성립한다.
    const angle = Math.atan2(target.y - actor.y, target.x - actor.x);
    const count = Math.max(2, pattern.chainCount || 4);
    const baseDistance = Math.hypot(target.x - actor.x, target.y - actor.y);
    for (let i = 0; i < count; i += 1) {
      const distance = baseDistance + i * pattern.chainSpacing;
      pushZone(battle, actor, pattern, {
        x: actor.x + Math.cos(angle) * distance,
        y: actor.y + Math.sin(angle) * distance,
        radius: pattern.radius,
        // 몇 번째 칸인지. 예고를 단계별로 다르게 그려 순서를 보여준다.
        chainIndex: i
      }, i * pattern.chainIntervalMs);
    }
  } else if (pattern.volleyCount > 1) {
    // 시간차 연속 장판. 첫 발은 대상 위치, 이후는 주변으로 흩뿌린다.
    for (let i = 0; i < pattern.volleyCount; i += 1) {
      const spread = i === 0 ? 0 : pattern.volleySpread;
      pushZone(battle, actor, pattern, {
        x: center.x + (battleRoll(battle) - 0.5) * 2 * spread,
        y: center.y + (battleRoll(battle) - 0.5) * 2 * spread,
        radius: pattern.radius
      }, i * pattern.volleyIntervalMs);
    }
  } else {
    pushZone(battle, actor, pattern, { x: center.x, y: center.y, radius: pattern.radius });
  }

  actor.patternReadyAt ||= {};
  actor.patternReadyAt[pattern.id] = battle.elapsed + pattern.cooldownMs;
  // 시전 중에는 움직이거나 평타를 치지 않는다 — 예고와 본체 행동이 겹치면
  // 무엇을 보고 피해야 하는지 알 수 없게 된다.
  const castMs = pattern.kind === "chain"
    ? pattern.telegraphMs + (Math.max(2, pattern.chainCount || 4) - 1) * pattern.chainIntervalMs
    : pattern.volleyCount > 1
      ? pattern.telegraphMs + (pattern.volleyCount - 1) * pattern.volleyIntervalMs
      : pattern.telegraphMs;
  actor.castingUntil = battle.elapsed + castMs;
  pushBattleLog(battle, `${actor.name}: ${pattern.name} 준비`);
}

// 점과 선분 사이 거리. 직선 돌진 판정에 쓴다.
function distanceToSegment(point, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 0.0001) return Math.hypot(point.x - x1, point.y - y1);
  const t = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / lengthSq));
  return Math.hypot(point.x - (x1 + t * dx), point.y - (y1 + t * dy));
}

function zoneCovers(zone, unit) {
  if (zone.kind === "line") {
    return distanceToSegment(unit, zone.x, zone.y, zone.x2, zone.y2) <= zone.width / 2;
  }
  if (zone.kind === "cone") {
    // 부채꼴: 반경 안 + 중심 방향에서 좌우 halfAngle 이내.
    // 이 분기가 없으면 전방향으로 맞아 원형 장판과 다를 게 없어진다.
    if (distanceBetween(zone, unit) > zone.radius) return false;
    let diff = Math.atan2(unit.y - zone.y, unit.x - zone.x) - zone.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= zone.halfAngle;
  }
  return distanceBetween(zone, unit) <= zone.radius;
}

// 자동 동료가 활성 예고 장판 안에 있으면 밖으로 빠져나간다.
// 밟고 있는 장판 중 가장 먼저 터지는 것을 기준으로 삼고, 그 중심의 반대쪽으로 달린다.
// 피했으면 true를 돌려주고, 그 tick에는 공격·추격을 하지 않는다.
function dodgeDangerZone(battle, actor, step) {
  if (!battle.zones?.length) return false;
  const standing = battle.zones
    .filter((zone) => zone.kind !== "summon" && battle.elapsed >= zone.bornAt && zoneCovers(zone, actor))
    .sort((a, b) => a.fireAt - b.fireAt)[0];
  if (!standing) return false;

  // 직선은 중심선에서 옆으로, 나머지는 중심에서 바깥으로.
  let dx;
  let dy;
  if (standing.kind === "line") {
    const angle = Math.atan2(standing.y2 - standing.y, standing.x2 - standing.x);
    const side = Math.sin(Math.atan2(actor.y - standing.y, actor.x - standing.x) - angle) >= 0 ? 1 : -1;
    dx = Math.cos(angle + (Math.PI / 2) * side);
    dy = Math.sin(angle + (Math.PI / 2) * side);
  } else {
    dx = actor.x - standing.x;
    dy = actor.y - standing.y;
    const length = Math.hypot(dx, dy);
    // 정중앙에 서 있으면 방향이 정해지지 않는다 — 유닛마다 다른 쪽으로 흩어지게 한다.
    if (length < 0.001) {
      const spread = (actor.id.length % 8) * (Math.PI / 4);
      dx = Math.cos(spread);
      dy = Math.sin(spread);
    } else {
      dx /= length;
      dy /= length;
    }
  }

  const travel = actor.speed * speedDebuffMultiplier(actor) * (step / 1000);
  const moved = resolveMove(battle, actor.x + dx * travel, actor.y + dy * travel);
  actor.x = moved.x;
  actor.y = moved.y;
  return true;
}

// 시간이 흐르며 동작하는 전설 고유효과들(docs/EQUIPMENT_DESIGN.md §10·§11).
// 피해 계산 시점에 끝나지 않고 tick마다 상태를 봐야 하는 것만 여기 모은다.
function tickLegendaryEffects(battle, step) {
  const legendary = battle.legendary;
  if (!legendary) return;
  const player = battle.units.find((unit) => unit.id === battle.playerId);
  if (!player || player.hp <= 0) return;
  const state = battle.legendaryState;

  // 구미호의 외투: 미뤄둔 피해를 조금씩 흘려보낸다.
  // 총량은 같지만 한 방에 죽지 않게 해주는 게 목적이다.
  if (state.spread?.length) {
    for (const entry of state.spread) {
      const portion = entry.total * (step / entry.durationMs);
      const applied = Math.min(entry.remaining, portion);
      entry.remaining -= applied;
      player.hp = Math.max(1, player.hp - applied); // 분산 피해로는 죽지 않는다
    }
    state.spread = state.spread.filter((entry) => entry.remaining > 0.01);
  }

  // 영혼의 장막: 일정 시간 안 맞으면 1회성 장막이 생긴다.
  const recovery = legendary.recoveryShield;
  if (recovery && battle.elapsed - state.lastPlayerHitAt >= recovery.quietMs) {
    const amount = Math.round(player.maxHp * recovery.maxRatio);
    if (!player.positiveEffects.shield || player.positiveEffects.shield.amount < amount) {
      player.positiveEffects.shield = { amount, endsAt: battle.elapsed + 60000 };
      pushBattleLog(battle, "영혼의 장막: 숨을 고르는 사이 장막이 생겼다");
      state.lastPlayerHitAt = battle.elapsed; // 매 tick 다시 걸리지 않게
    }
  }

  // 동토 수호반지: 지정한 상태이상만 빨리 털어낸다(구미호 목걸이는 전 상태이상 대상).
  const ward = legendary.statusWard;
  if (ward && player.statuses?.[ward.statusId]) {
    const warded = player.statuses[ward.statusId];
    warded.expiresAt -= ward.reduceMs * (step / 1000);
    if (warded.expiresAt <= battle.elapsed) delete player.statuses[ward.statusId];
  }

  // 구미호 영핵 목걸이: 몸에 붙은 해로운 것이 오래 머물지 못한다.
  const shrug = legendary.statusShrug;
  if (shrug) {
    for (const [statusId, status] of Object.entries(player.statuses || {})) {
      if (!status) continue;
      status.expiresAt -= shrug.reduceMs * (step / 1000);
      if (status.expiresAt <= battle.elapsed) delete player.statuses[statusId];
    }
  }

  // 몰락한 성유물 목걸이: 위급할 때 한 번 스스로를 씻는다. 내부 쿨다운이 있다.
  const desperate = legendary.desperateCleanse;
  if (desperate
    && player.hp / player.maxHp <= desperate.threshold
    && battle.elapsed - state.lastCleanseAt >= desperate.cooldownMs) {
    const ids = Object.keys(player.statuses || {});
    if (ids.length) {
      delete player.statuses[ids[0]];
      state.lastCleanseAt = battle.elapsed;
      pushBattleLog(battle, `몰락한 성유물: 무너지기 직전 ${ids[0]} 이상을 씻어냈다`);
    }
  }
}

// ── 지역 진입 요구치 ────────────────────────────────────────────────────────
//
// 지역마다 최소 전투력을 요구한다. 1지역부터 걸어두는 이유는 **동료를 키울 이유**를
// 만들기 위해서다 — 요구치를 파티 전체 전투력으로 재므로, 지휘관만 강해서는 넘지 못하고
// 동료에게도 장비를 물려주게 된다.
//
// 지휘관 혼자로는 어느 지역도 못 넘도록 잡았다. 동료 둘의 몫이 반드시 필요하다.
//
// 수치는 레벨을 없앤 뒤 실제로 도달 가능한 대역에 맞춰 다시 잡았다.
// 2인 파티 기준 실측(맨몸 846 → 신화 +10 1409):
//
//   북부   780  맨몸(846)으로 통과. 첫 지역은 열려 있어야 재료를 캘 수 있다.
//   남부   940  맨몸으로는 못 넘는다. 첫 장비를 제작해야 열린다(일반 +0 = 1082).
//   동부  1100  일반 장비만으론 빠듯하다. 강화나 특성이 필요하다(일반 +3 = 1162).
//   서부  1220  등급을 올려야 한다(희귀 +6 = 1259).
//   중부  1330  희귀 +10 / 전설 +8 / 신화 +6 — 어느 길로 와도 된다.
//
// 마지막 관문에 길을 여럿 둔 건 의도적이다. 한 가지 장비만 정답이 되면
// 파밍이 선택이 아니라 절차가 된다.
export const REGION_ENTRY_POWER = {
  north: 780,
  south: 940,
  east: 1100,
  west: 1220,
  central: 1330
};

// 파티 전체 전투력. 지휘관 + 동료들의 합이다.
// 동료의 방어도 지휘관과 같은 감쇠 곡선을 쓴다. 동료 정의의 armor는 이미
// 감소율(0.28 = 28%)이라 점수로 되돌린 뒤 장비 점수를 더하고 다시 곡선을 태운다.
// 여기서도 감소율이 1에 닿지 않으므로 동료가 피해를 완전히 무시하는 일은 없다.
function companionArmor(definition, gear) {
  const ratio = Math.max(0, Math.min(0.95, definition.armor || 0));
  const basePoints = ARMOR_SOFTCAP * ratio / (1 - ratio);
  return armorReduction(basePoints + (gear.armorBonus || 0) * 100 + (gear.armorFlat || 0));
}

export function partyPowerScore(commander = {}, partyIds = [], unitProgress = {}) {
  const kitId = commander.combatKitId || "crusader";
  let total = combatPowerScore(playerCombatStats(commander, kitId));

  for (const unitId of partyIds) {
    const unit = UNIT_DEFS[unitId];
    if (!unit) continue;
    const gear = companionBonuses(commander, unitId);
    // 특성도 전투력에 들어간다. 숙련도 자체는 들어가지 않는다 —
    // 숙련은 칸을 열 뿐이고, 힘은 그 칸에 무엇을 끼웠느냐에서 나온다.
    const trait = mergeTraits(unitTraits(unitProgress[unitId] || {}));
    // 동료는 전투 스탯 산출식이 지휘관과 달라, 같은 저울에 올리기 위해 근사한다.
    total += combatPowerScore({
      maxHp: unit.maxHp * (1 + gear.maxHpBonus + trait.hpBonus),
      damage: (unit.damage * (1 + trait.damageBonus) + gear.damageFlat) * (1 + gear.damageBonus),
      armor: companionArmor(unit, { armorBonus: gear.armorBonus + trait.armorBonus, armorFlat: gear.armorFlat }),
      criticalChance: 0.03 + gear.criticalChance,
      criticalDamage: 1.5 + gear.criticalDamage,
      cooldownReduction: gear.cooldownReduction,
      speed: (unit.speed || 10) * (1 + gear.moveSpeedBonus + trait.speedBonus),
      statusResistance: (unit.statusResistance || 0) + gear.statusResistBonus,
      attackMs: Math.max(280, ((unit.attackMs || 1200) + trait.attackMsBonus) / (1 + gear.attackSpeedBonus))
    });
  }
  return Math.round(total);
}

// 진입 판정. 못 들어가면 얼마나 모자란지 함께 돌려준다.
export function regionEntryCheck(regionId, commander, partyIds, unitProgress) {
  const required = REGION_ENTRY_POWER[regionId] || 0;
  const power = partyPowerScore(commander, partyIds, unitProgress);
  return { allowed: power >= required, power, required, shortfall: Math.max(0, required - power) };
}

// ── 영지 기억 던전 ──────────────────────────────────────────────────────────
//
// 영지에 마법으로 재현한 던전이다. 겪은 전투를 기억에서 끌어내 다시 세우는 것이라
// **직접 쓰러뜨려 본 보스만** 소환할 수 있다(일회성인 지역 보스까지 포함해서).
//
// 재현이 실제 필드를 대체하면 안 되므로 보상을 줄인다:
// - 부산물은 원본의 절반(올림)만 나온다
// - 설계도는 나오지 않는다
// - 고철·지역 재료 같은 원정 정산도 없다
//
// 즉 재현은 **강화·수리를 위한 반복 수단**이지 새 전설을 여는 길이 아니다.
// ── 지역 패널티 대응: 장비 밖의 세 갈래 ──────────────────────────────────────
//
// 지역 대응 반지(+3)가 유일한 길이면 장신구 세 칸 중 한 칸이 늘 묶인다.
// 그러면 장신구 세트를 2셋까지밖에 못 맞춘다. 그래서 반지 말고도 닿는 길을 연다:
//
//   지역 출신 동료 +1 (이미 있음, createRegionRun의 partyMitigation)
//   지역 대응 소모품 +2 (아래 REGION_TONIC_DEFS)
//   지역 핵 흡수 — 완전 차단 문턱을 0.6배로 (아래 REGION_CORE_ABSORPTION)
//
// 하나로는 못 넘고 섞어야 넘는다는 기존 배분은 유지한다.

// 소모품. 재료는 전부 **그 지역 약재**다 — 재료 컨셉.txt에 적힌 실제 약효가
// 그 지역 패널티와 그대로 맞물린다(로디올라=고지 적응, 알로에=화상 재생 …).
export const REGION_TONIC_DEFS = {
  north: { id: "northTonic", regionId: "north", name: "고지 적응 강장제", mitigation: 2,
    materials: { rhodiola: 2, arnica: 1 }, description: "굳어가는 마력 순환을 억지로 돌린다. 북부의 마나 고갈에 듣는다." },
  south: { id: "southTonic", regionId: "south", name: "해독 탕약", mitigation: 2,
    materials: { cinchonaBark: 2, clove: 1 }, description: "들이켜면 목이 타지만 독이 퍼지지 않는다." },
  east: { id: "eastTonic", regionId: "east", name: "기맥 보약", mitigation: 2,
    materials: { cordyceps: 2, ginseng: 1 }, description: "기맥을 눌러 붙잡는다. 씻겨나가려는 것이 덜 씻긴다." },
  west: { id: "westTonic", regionId: "west", name: "진정 향유", mitigation: 2,
    materials: { chamomile: 2, lavender: 1, willowBark: 1 }, description: "동료의 손 떨림이 멎는다. 저주가 공포로 번지는 것을 늦춘다." },
  central: { id: "centralTonic", regionId: "central", name: "냉각 연고", mitigation: 2,
    materials: { aloeVera: 2, myrrh: 1 }, description: "바르면 살갗이 서늘해진다. 폭염에 살이 익는 것을 막는다." }
};

export const TONIC_CARRY_LIMIT = 3;

// 영지 귀환 부적. 원정 도중 아무 때나 써서 짐을 지킨 채 돌아온다.
//
// 전멸하면 미보관 자원이 절반으로 깎이므로, "여기까지"를 스스로 정할 수단이
// 있어야 깊이 들어가는 판단에 의미가 생긴다. 물러나는 것도 선택이어야 한다.
export const RECALL_CHARM = {
  id: "recallCharm", name: "귀환 부적", carryLimit: 3,
  materials: { herb: 2, ingot: 1, runeFragment: 1 },
  description: "태우면 왔던 길이 접힌다. 짐을 지킨 채 영지로 돌아온다."
};

// 지역 핵 흡수. 그 지역 보스의 핵 계열 부산물을 먹는다 — 신화 장비 재료와
// 같은 것이라 "장비로 만들 것인가, 흡수할 것인가"가 실제 선택이 된다.
// 기억 던전으로 다시 벌 수 있으므로 영구 손실은 아니다.
export const REGION_CORE_ABSORPTION = {
  north: { regionId: "north", material: "titanCore", amount: 1 },
  south: { regionId: "south", material: "abyssEye", amount: 1 },
  east: { regionId: "east", material: "dragonPearl", amount: 1 },
  west: { regionId: "west", material: "fallenCrown", amount: 1 },
  central: { regionId: "central", material: "colossusReactor", amount: 1 }
};

// 흡수해도 **면역은 아니다.** 완전 차단에 필요한 대응 수치가 0.6배로 내려갈 뿐이라
// (기본 4 → 2) 소모품 하나로도 닿게 된다. 영구 면역으로 만들면 지역마다 다른
// 압박을 준다는 설계 자체가 죽는다 — 처음 한 번만 존재하는 관문이 되어버린다.
export const ABSORBED_RESIST_SCALE = 0.6;

export function absorbedResistThreshold(base, absorbed) {
  const threshold = Number(base) || 4;
  return absorbed ? Math.max(1, Math.round(threshold * ABSORBED_RESIST_SCALE)) : threshold;
}

export const MEMORY_YIELD_RATIO = 0.5;

export function memorySummonable(remembered = []) {
  const seen = new Set(remembered);
  return Object.entries(ENCOUNTER_DEFS)
    .filter(([, encounter]) => encounter.boss)
    .filter(([, encounter]) => encounter.enemies.some((id) => seen.has(id)))
    .map(([id, encounter]) => ({ id, name: encounter.name, regionBoss: Boolean(encounter.regionBoss) }));
}

export function createMemoryBattle(encounterId, partyIds = STARTING_PARTY, unitProgress = {}, options = {}) {
  const encounter = ENCOUNTER_DEFS[encounterId];
  if (!encounter?.boss) return null;
  const battle = createAutoBattle(encounterId, null, "memory", partyIds, unitProgress, {
    ...options,
    rollSeed: options.rollSeed ?? ((options.seed || 1) + 61441)
  });
  if (!battle) return null;
  battle.memoryMode = true;
  battle.log.unshift(`기억을 끌어올려 ${encounter.name}을 다시 세운다. 진짜는 아니지만 아프기는 하다.`);
  return battle;
}

// 재현 전투가 주는 경험치. 영지 계층 던전을 여기에 합치면서 생겼다.
//
// 숙련(mastery)은 상한 6에 스탯을 안 주므로 다 찍고 나면 갈 이유가 없었다.
// 동료 **스킬** 경험치를 여기서만 주면 상한 6 이후에도 계속 갈 이유가 남는다.
export const MEMORY_XP_PER_BOSS = 6;
export const MEMORY_SKILL_XP_PER_BOSS = 4;

// 스킬 경험치를 넣고 레벨이 올랐으면 올려 준다. 넘친 경험치는 이월한다.
export function grantCompanionSkillXp(progress = {}, amount = 0) {
  const next = { ...progress };
  next.skillLevel = Math.max(1, Number(next.skillLevel) || 1);
  next.skillXp = Math.max(0, Number(next.skillXp) || 0) + Math.max(0, amount);
  const levels = [];
  while (next.skillLevel < COMPANION_SKILL_MAX_LEVEL) {
    const needed = companionSkillXpNeeded(next.skillLevel);
    if (next.skillXp < needed) break;
    next.skillXp -= needed;
    next.skillLevel += 1;
    levels.push(next.skillLevel);
  }
  // 상한에 닿으면 경험치를 더 쌓지 않는다 — 쌓아둬도 쓸 데가 없다.
  if (next.skillLevel >= COMPANION_SKILL_MAX_LEVEL) next.skillXp = 0;
  return { progress: next, levels };
}

// 재현 전투의 보상. 부산물만, 그것도 절반만 나온다.
export function memoryRewards(battle) {
  const materials = {};
  for (const enemy of battle?.enemies || []) {
    if (enemy.hp > 0 || !enemy.byproducts) continue;
    for (const [id, amount] of Object.entries(enemy.byproducts)) {
      materials[id] = (materials[id] || 0) + Math.max(1, Math.ceil(amount * MEMORY_YIELD_RATIO));
    }
  }
  return materials;
}

// ── 서부 저주 ────────────────────────────────────────────────────────────────
//
// 서부를 탐사하는 동안 **동료에게** 저주가 쌓인다(REGION_PROGRESSION_HAZARDS.md 서부).
// 한계에 닿아도 적으로 돌아서지는 않는다 — 팀 판정이 배열 소속이라 동료를 적으로
// 옮기면 "내 동료를 내가 죽여야 이기는" 구도가 되기 때문이다. 대신 두 단계를 거친다:
//
//   공포(경고)  : 잠시 무력화된다. 시간이 지나면 회복한다.
//   이탈(결과)  : 전장을 벗어난다. 남은 전투를 수적 열세로 치른다.
//
// 공포를 경고로 두는 건 이 게임이 보스 패턴을 전부 "예고 → 결과"로 짠 것과 같은
// 이유다. 동료를 잃기 전에 물러나거나 대응 장신구를 낄 판단 시점이 생긴다.
//
// 플레이어 본인은 저주에 걸리지 않는다 — 플레이어가 무력화되면 조작할 게 없어진다.
function accumulateCurse(battle, counter) {
  battle.curse ||= {};
  const companions = living(battle.units).filter((unit) => unit.id !== battle.playerId);

  for (const unit of companions) {
    const before = battle.curse[unit.id] || 0;
    const now = before + counter.perTick;
    battle.curse[unit.id] = now;

    // 이탈: 배열에서 빼기만 한다. 플레이어가 남아 있어 패배 판정은 유지되고,
    // 승리 조건은 적만 보므로 안전하다. 죽은 게 아니라 이탈이므로 사상자가 아니다.
    if (now >= counter.fleeAt) {
      battle.units = battle.units.filter((entry) => entry.id !== unit.id);
      battle.fledUnits ||= [];
      battle.fledUnits.push(unit.id);
      delete battle.curse[unit.id];
      pushBattleLog(battle, `${unit.name}이 저주를 견디지 못하고 전장을 벗어났다.`);
      continue;
    }

    // 공포: 임계를 처음 넘는 순간에만 건다. 매 tick 다시 걸면 회복할 틈이 없다.
    if (now >= counter.fearAt && before < counter.fearAt) {
      unit.statuses ||= {};
      unit.statuses.stun = { id: "stun", expiresAt: battle.elapsed + counter.fearMs, stacks: 1 };
      pushBattleLog(battle, `${unit.name}이 저주에 질려 몸이 굳었다.`);
    }
  }
}

// ── 그로기 ────────────────────────────────────────────────────────────────
//
// 보스에게만 붙는 별도 게이지다. 피해를 넣으면 차오르고, 가득 차면 보스가 잠시
// 무너져 아무것도 못 하고 받는 피해도 커진다. 안 때리면 서서히 빠진다.
//
// 목적은 "쉬지 않고 몰아쳐서 무너뜨리는 구간"을 만드는 것이다. 패턴을 피하기만
// 해서는 게이지가 빠지므로, 피할 때와 붙을 때를 나누게 된다.
//
// 잡몹에는 붙이지 않는다 — 어차피 금방 죽어서 게이지가 의미가 없고,
// 화면에 게이지만 늘어난다.
const GROGGY_DURATION_MS = 4000;
const GROGGY_DECAY_PER_SEC = 0.055;   // 가만 두면 약 18초에 완충분이 빠진다
const GROGGY_DAMAGE_TAKEN = 1.5;      // 그로기 중 받는 피해 배율
const GROGGY_COOLDOWN_MS = 12000;     // 연속으로 다시 무너지지 않게

// 보스가 그로기에 걸리기까지 필요한 누적 피해. 최대 체력에 비례시켜
// 보스가 커져도 "몇 번 몰아쳐야 무너진다"가 일정하게 유지되도록 한다.
function groggyThreshold(unit) {
  return Math.max(1, unit.maxHp * 0.55);
}

// 피해를 넣을 때 게이지를 채운다. 그로기 중에는 더 차지 않는다.
function addStagger(battle, target, amount) {
  if (!target?.boss || amount <= 0) return;
  if ((target.groggyUntil || 0) > battle.elapsed) return;
  if (battle.elapsed - (target.lastGroggyAt ?? -999999) < GROGGY_COOLDOWN_MS) return;

  target.stagger = (target.stagger || 0) + amount;
  if (target.stagger < groggyThreshold(target)) return;

  target.stagger = 0;
  target.groggyUntil = battle.elapsed + GROGGY_DURATION_MS;
  target.lastGroggyAt = battle.elapsed;
  // 무너지는 순간 시전 중이던 패턴과 깔아둔 예고를 함께 걷는다.
  target.castingUntil = 0;
  battle.zones = (battle.zones || []).filter((zone) => zone.ownerId !== target.id);
  pushBattleLog(battle, `${target.name}이 무너졌다! 지금이 기회다`);
}

// 안 때리면 게이지가 빠진다 — 계속 피하기만 해서는 무너뜨릴 수 없다.
function decayStagger(battle, step) {
  for (const enemy of battle.enemies) {
    if (!enemy.boss || !enemy.stagger) continue;
    if ((enemy.groggyUntil || 0) > battle.elapsed) continue;
    if (battle.elapsed - (enemy.lastStaggerAt || 0) < 1200) continue;
    enemy.stagger = Math.max(0, enemy.stagger - groggyThreshold(enemy) * GROGGY_DECAY_PER_SEC * (step / 1000));
  }
}

// 그로기 중인 대상은 더 아프게 맞는다.
function groggyDamageMultiplier(battle, target) {
  return (target.groggyUntil || 0) > battle.elapsed ? GROGGY_DAMAGE_TAKEN : 1;
}

// 치명타 굴림. 오래 죽어 있던 스탯을 실제 피해 계산에 연결한 것이라
// 플레이어 기본 공격과 AI 공격 양쪽에서 같은 함수를 쓴다.
function rollCritical(battle, actor, target = null) {
  // 급소 표식(독침 추적자)은 플레이어가 지금 노리는 적에게만 붙는다.
  const chance = Number(actor.criticalChance || 0) + markedCritBonus(battle, target);
  if (chance <= 0) return 1;
  if (battleRoll(battle) >= chance) return 1;
  return Number(actor.criticalDamage || 1.5);
}

// 플레이어가 적을 때릴 때의 전설 고유효과. 기본 공격 경로와 AI 경로가 갈려 있어
// 양쪽에서 같은 함수를 부르도록 모아뒀다.

// 오니 파괴반지 등 방어 관통 계열을 반영한 적 방어력.
function legendaryPiercedArmor(battle, target) {
  let armor = effectiveArmor(target);
  const flat = battle.legendary?.armorPierce;
  if (flat) armor = Math.max(0, armor - flat.amount);
  const stack = battle.legendary?.armorPierceStack;
  if (stack) {
    const state = battle.legendaryState.pierce;
    const fresh = state && state.targetId === target.id && battle.elapsed - state.lastAt <= stack.resetMs;
    const stacks = fresh ? Math.min(stack.maxStacks, state.stacks) : 0;
    armor = Math.max(0, armor - stacks * stack.perStack);
    battle.legendaryState.pierce = {
      targetId: target.id,
      stacks: fresh ? Math.min(stack.maxStacks, state.stacks + 1) : 1,
      lastAt: battle.elapsed
    };
  }
  return armor;
}

// 거미독 반지처럼 "특정 상태이상에 걸린 적에게 더 아프게"인 배율.
function legendaryOutgoingMultiplier(battle, target) {
  const execute = battle.legendary?.statusExecute;
  if (execute && target.statuses?.[execute.statusId]) return 1 + execute.bonus;
  return 1;
}

// 거신의 맹세: 일정 횟수를 때릴 때마다 대상 주변이 터진다.
// 단일 대상 공격이 주기적으로 광역이 되므로 "언제 터질지 세면서 몰아넣는" 운용이 생긴다.
// 기본 공격만 센다 - 스킬까지 세면 직업마다 발동 빈도가 제각각이 된다.
function applyChargedBurst(battle, player, target) {
  const burst = battle.legendary?.chargedBurst;
  if (!burst) return;
  const state = battle.legendaryState;
  state.burstHits = (state.burstHits || 0) + 1;
  if (state.burstHits % burst.everyHits !== 0) return;

  const result = damageArea(battle, player, target, burst.radius, burst.damageMultiplier);
  pushBattleLog(battle, result.targets.length
    ? `거신의 맹세: 벼른 힘이 터져 적 ${result.targets.length}명에게 ${result.totalDamage} 피해`
    : "거신의 맹세: 벼른 힘이 허공에서 터졌다");
}

// 역병 3셋: 독에 걸린 적을 때리면 그 자리에서 독이 터져 주변까지 번진다.
//
// 처형(statusExecute)은 너무 셌다 — 조건만 맞으면 그냥 더 아프기만 해서
// "독을 깔고 터뜨린다"는 운용이 안 생긴다. 터지는 쪽은 적을 모아야
// 값을 하므로 배치가 판단거리가 된다.
function applyPlagueBurst(battle, player, target) {
  const burst = battle.legendary?.plagueBurst;
  if (!burst || target.hp <= 0) return;
  if (!target.statuses?.[burst.statusId || "poison"]) return;

  const state = battle.legendaryState;
  if ((state.plagueBurstReadyAt || 0) > battle.elapsed) return;
  state.plagueBurstReadyAt = battle.elapsed + (burst.cooldownMs || 3000);

  const result = damageArea(battle, player, target, burst.radius, burst.damageMultiplier);
  // 번진 자리에도 독을 남긴다 — 터뜨린 값이 다음 폭발로 이어지게.
  for (const hit of result.targets || []) {
    if (hit.hp > 0) applyCombatStatus(battle, hit, burst.statusId || "poison", player);
  }
  pushBattleLog(battle, result.targets.length
    ? `역병: 쌓인 독이 터져 적 ${result.targets.length}명에게 ${result.totalDamage} 피해`
    : "역병: 독이 터졌지만 번질 곳이 없었다");
}

// 적중 시 붙는 것들(상태이상 부여·회복 감소).
function applyLegendaryOnHit(battle, player, target) {
  if (target.hp <= 0) return;
  const execute = battle.legendary?.statusExecute;
  if (execute?.applyDecay && target.statuses?.[execute.statusId]) {
    applyCombatStatus(battle, target, "decay", player);
  }
  applyPlagueBurst(battle, player, target);
  for (const effect of battle.legendaryOnHit || []) {
    if (battleRoll(battle) < effect.chance) applyCombatStatus(battle, target, effect.statusId, player);
  }
}

// 촉수처럼 끌어당기는 패턴. knockback의 반대 방향이다.
function pullToward(source, target, distance, battle) {
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const travel = Math.min(distance, length - 2);
  if (travel <= 0) return;
  const next = resolveMove(battle, target.x + (dx / length) * travel, target.y + (dy / length) * travel);
  target.x = next.x;
  target.y = next.y;
}

// 소환 패턴이 터지면 잡몹이 나온다.
function resolveSummonZone(battle, zone, owner) {
  const pattern = BOSS_PATTERN_DEFS[zone.patternId];
  if (!pattern?.summonId) return;
  for (let i = 0; i < (pattern.summonCount || 1); i += 1) {
    const definition = ENEMY_COMBATANTS[pattern.summonId];
    if (!definition) continue;
    const spawned = createCombatant(
      definition, `summon-${battle.zoneSeq}-${i}`, "enemy", battle.enemies.length % 5
    );
    const spot = resolveMove(battle, owner.x + (battleRoll(battle) - 0.5) * 24, owner.y + (battleRoll(battle) - 0.5) * 24);
    spawned.x = spot.x;
    spawned.y = spot.y;
    battle.enemies.push(spawned);
  }
  pushBattleLog(battle, `${zone.name}: 무리가 나타났다`);
}

// 시간이 된 장판을 터뜨린다. 범위 안에 있는 플레이어·동료가 맞는다.
function advanceBossZones(battle) {
  if (!battle.zones?.length) return;
  const remaining = [];
  for (const zone of battle.zones) {
    if (battle.elapsed < zone.fireAt) { remaining.push(zone); continue; }

    const owner = battle.enemies.find((enemy) => enemy.id === zone.ownerId);
    if (zone.kind === "summon") {
      if (owner) resolveSummonZone(battle, zone, owner);
      continue;
    }
    const hit = living(battle.units).filter((unit) => zoneCovers(zone, unit));
    if (owner) {
      for (const unit of hit) {
        // 회피 중이면 장판도 회피 감소를 받는다(방패 막기로 버티는 선택지가 살아 있게).
        const dodging = unit.id === battle.playerId && battle.playerDodgeUntil > battle.elapsed;
        const reduction = dodging ? 1 - playerDodgeDefinition(battle.playerKitId).reduction : 1;
        const damage = damageCombatant(owner, unit, zone.damageMultiplier * reduction);
        if (zone.status) applyCombatStatus(battle, unit, zone.status, owner);
        // 촉수형 패턴은 맞은 대상을 시전자 쪽으로 끌어당긴다.
        if (zone.pullDistance) pullToward(owner, unit, zone.pullDistance, battle);
        if (unit.id === battle.playerId) battle.playerHitFlash = battle.elapsed;
        pushBattleLog(battle, `${zone.name}: ${unit.name}이 ${damage} 피해`);
      }
    }
    // 잔류 패턴은 터진 뒤 그 자리에 장판을 남긴다(거미줄·독무 같은 것).
    if (zone.linger && owner) {
      battle.groundEffects.push({
        x: zone.x, y: zone.y, radius: zone.radius,
        team: "enemy", sourceId: owner.id,
        statusId: zone.linger.statusId || null,
        statusOptions: {},
        damageMultiplier: zone.linger.damageMultiplier || 0,
        pulseMs: zone.linger.pulseMs || 700,
        nextPulseAt: battle.elapsed + (zone.linger.pulseMs || 700),
        endsAt: battle.elapsed + zone.linger.durationMs,
        name: zone.name
      });
      pushBattleLog(battle, `${zone.name}: 바닥에 남았다`);
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
    hazard: { name: "혹한", glyph: "❄", description: "체력을 깎고 마력 순환을 굳혀 마나를 빼앗는다.", techniqueId: "survival",
      // 북부는 아크메이지 카운터(몬스터 컨셉.txt). 몬스터는 높은 마법저항으로,
      // 환경은 마나 고갈로 같은 방향의 압박을 건다.
      counterEffect: { type: "manaDrain", ratio: 0.12, resistedAt: 4 } },
    enemyPool: ["frostWolves", "iceRaiders", "snowGolems"], fieldBossPool: ["northLichLair", "northWarbandLair"], villageName: "눈골 부락", dungeonName: "빙맥 폐광", dungeonGlyph: "◆",
    bossEncounterId: "frostColossusPack", defenseEncounterId: "iceRaiders", rewardMaterial: "frostIron", rewardAmount: 2,
    recruits: ["snow_guard", "winter_berserker", "snow_shaman"], techniqueId: "survival"
  },
  south: {
    id: "south", direction: "남부", name: "남부 우림", subtitle: "동남아와 중남미풍의 거대 밀림",
    description: "독과 약초, 매복과 소환술이 함께 발달한 습윤 지대. 수관 아래 뿌리 군락이 개척로를 삼킨다.",
    glyph: "♣", accent: "#66a978", danger: "위험 2", pressure: "독성", mapX: 50, mapY: 84,
    hazard: { name: "독성 포자", glyph: "♢", description: "교전이 길어질수록 중독 피해가 쌓인다.", techniqueId: "poison" },
    enemyPool: ["venomStalkers", "vineBrood", "mireHunters"], fieldBossPool: ["southSpawnLair", "southSpiderLair", "southSerpentLair"], villageName: "강둑 부락", dungeonName: "수관 아래 신전", dungeonGlyph: "♧",
    bossEncounterId: "canopyMatriarchPack", defenseEncounterId: "vineBrood", rewardMaterial: "venomSac", rewardAmount: 2,
    recruits: ["venom_tracker", "vine_keeper", "sap_healer"], techniqueId: "poison"
  },
  east: {
    id: "east", direction: "동부", name: "동부 산악권", subtitle: "단조와 무예, 산성의 문화권",
    description: "공방 도시와 문파, 산성국과 도국이 이어진다. 무예서와 단조 설계를 둘러싼 분쟁이 끊이지 않는다.",
    glyph: "山", accent: "#c18469", danger: "위험 2", pressure: "험로", mapX: 81, mapY: 51,
    // 동부는 지역 환경 디버프를 두지 않는다(REGION_PROGRESSION_HAZARDS.md).
    // 매화 카운터는 환경이 아니라 **몬스터 능력**으로만 건다 — 구미호의 자가 정화가 대표.
    hazard: { name: "험로", glyph: "山", description: "거친 지형이 이동과 공격 주기를 방해한다.", techniqueId: "forging" },
    enemyPool: ["mountainBandits", "ironGuard", "stoneApes"], fieldBossPool: ["eastFoxLair", "eastOniLair", "eastCentipedeLair"], villageName: "산성 아래 마을", dungeonName: "봉인된 단조성", dungeonGlyph: "炉",
    bossEncounterId: "forgeGuardianPack", defenseEncounterId: "ironGuard", rewardMaterial: "mountainIron", rewardAmount: 2,
    recruits: ["formation_officer", "duel_swordsman", "meridian_fighter", "blade_dancer"], techniqueId: "forging"
  },
  west: {
    id: "west", direction: "서부", name: "서부 제후국", subtitle: "기사와 마나, 정령의 봉건령",
    description: "석성 사이에 오래된 계약과 마력 유적이 남아 있다. 서약은 정의가 아니라 힘을 빌리는 방식이다.",
    glyph: "♜", accent: "#c6a66b", danger: "위험 2", pressure: "마력 이상", mapX: 18, mapY: 51,
    // 서부는 저주가 동료에게 누적된다(REGION_PROGRESSION_HAZARDS.md 서부).
    // 한계에 닿으면 적으로 돌아서는 게 아니라 공포 → 전장 이탈 두 단계를 거친다.
    hazard: { name: "저주", glyph: "✦", description: "저주가 동료에게 스며든다. 한계에 닿으면 전장을 벗어난다.", techniqueId: "oath",
      counterEffect: { type: "curse", perTick: 12, fearAt: 60, fleeAt: 100, fearMs: 2600, resistedAt: 4 } },
    enemyPool: ["thornBeasts", "oathbreakers", "manaWraiths"], fieldBossPool: ["westDurahanLair", "westLichLair", "westDragonLair"], villageName: "변경 순례촌", dungeonName: "무너진 서약당", dungeonGlyph: "✧",
    bossEncounterId: "ruinWardenPack", defenseEncounterId: "oathbreakers", rewardMaterial: "manaStone", rewardAmount: 2,
    recruits: ["oath_knight", "mana_weaver", "spirit_ranger"], techniqueId: "oath"
  },
  central: {
    id: "central", direction: "중부", name: "중부 사막", subtitle: "대상단과 유목민이 오가는 교역로",
    description: "오아시스와 유리 협곡이 이어지는 대륙의 중심. 물과 보급을 지키는 자가 길을 지배한다.",
    glyph: "☀", accent: "#c99150", danger: "위험 1", pressure: "작열", mapX: 51, mapY: 68,
    hazard: { name: "작열", glyph: "☀", description: "열기와 갈증이 장기 교전을 불리하게 만든다.", techniqueId: "mobility" },
    enemyPool: ["sandHunters", "duneRaiders", "glassBeetles"], fieldBossPool: ["centralSandwormLair", "centralManticoreLair", "centralGolemLair"], villageName: "오아시스 부락", dungeonName: "유리사 지하궁", dungeonGlyph: "◇",
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

// ── 지역별 특수 동료 (docs/COMPANION_EVENT_DESIGN.md §6) ──
//
// 지역마다 하나씩, 총 다섯. 구조하면 각자 큰 시스템(마탑·특수룬·특수단조·골렘·부활)을
// 해금하지만 그건 별도 작업이고, 여기서는 **패시브 하나씩**을 붙인다.
//
// 패시브를 고른 기준은 "그 동료가 열어줄 시스템의 맛보기"다. 마탑 설계자는
// 기술 회전을, 주술사는 상태이상을, 대장장이는 방어를 미리 조금 보여준다.
// 수치는 일부러 작게 잡았다 — 특수 동료가 "있으면 이기고 없으면 지는" 존재가 되면
// 숨겨진 발견 요소가 아니라 필수 체크리스트가 된다.
//
// recruits에 넣지 않았다. 지역 모집 화면에 잠긴 칸으로 뜨면 "총 5명"이라는 사실이
// UI로 새어나가는데, 그건 문서가 명시적으로 금지한 것이다(§6).
// ── 복원 골렘 (중부 · 고고학자) ────────────────────────────────────────
//
// 중부 필드 보스 centralGolem을 복원해 우리 쪽 병기로 쓴다. 스탯은 그 적 정의를
// 그대로 깎아서 가져온다 — 사용자 결정("적군 골렘 가져다 쓰면 된다").
//
// **파티에 넣을 수 없다.** 골렘은 추가 전투원이 아니라 분대장 자리를 대신 채우는
// 독립 병기다. 동료를 쓰지 않고도 분대가 하나 더 돌아가므로, 늘어나는 건 화력이
// 아니라 **동시에 굴릴 수 있는 원정 수**다(docs/COMPANION_EVENT_DESIGN.md §중부).
//
// UNIT_DEFS에 넣은 건 분대 코드가 명부의 유닛을 전제로 짜여 있어서다. 새 경로를
// 파는 대신 기존 통로를 쓰고, 파티 편성만 따로 막는다.
export const GOLEM_UNIT_ID = "restored_golem";

// 한 번에 굴릴 수 있는 골렘 수. 무한히 찍으면 원정이 전부 자동화되고
// 플레이어가 직접 나갈 이유가 사라진다.
export const GOLEM_MAX_COUNT = 2;
export const GOLEM_SOURCE_UNIT_ID = "relic_scholar";

// 골렘 정의는 **미리 다 만들어 둔다**(최대 수만큼). 복원할 때 UNIT_DEFS를 런타임에
// 늘리면 저장을 불러왔을 때 그 정의가 사라져서, 명부에는 있는데 정의가 없는
// 유닛이 생긴다. 개수가 둘뿐이라 미리 박아두는 편이 훨씬 안전하다.
const GOLEM_BASE = {
  name: "복원 골렘", regionId: "central", role: "병기", glyph: "G",
    color: "#9a8f74", species: "construct",
  // 적 정의(centralGolem)의 절반 정도. 원본은 필드 보스라 그대로 쓰면 과하다.
  maxHp: 107, damage: 8, range: 10, speed: 4, attackMs: 1850, armor: 0.26,
  scores: [2, 4, 1], primary: "자동 토벌", weakness: "스스로 판단하지 못한다.",
  baseClassId: "crusader", construct: true,
  materials: { golemCore: 1, ancientAlloy: 3 }
};

export const GOLEM_UNIT_DEFS = Object.fromEntries(
  Array.from({ length: GOLEM_MAX_COUNT }, (unused, index) => {
    const id = `${GOLEM_UNIT_ID}-${index + 1}`;
    return [id, { ...GOLEM_BASE, id, name: `${GOLEM_BASE.name} ${index + 1}호` }];
  })
);

export const GOLEM_MATERIALS = GOLEM_BASE.materials;

export function golemUnlocked(roster = []) {
  return roster.includes(GOLEM_SOURCE_UNIT_ID);
}

export function golemCount(roster = []) {
  return roster.filter((id) => id.startsWith(GOLEM_UNIT_ID)).length;
}

// ── 동료 스킬 ────────────────────────────────────────────────────────────────
//
// 동료는 액티브를 쓰지 않는다. 자동 AI가 스킬을 굴리면 플레이어가 볼 것도
// 할 것도 없어지기 때문이다. 전부 **패시브 아니면 조건부 버프**다.
//
// 그리고 전부 플레이어 쪽을 받치는 방향이다 — 동료 열다섯에 애착이 안 생기던
// 이유는 약해서가 아니라 내 행동과 무관해서였다. 급소 표식(플레이어가 노린
// 적)과 호흡 맞추기(플레이어가 회피할 때)가 그 축이다.
//
// 값은 `base + per * (level - 1)` 로 오른다. 레벨은 1에서 시작해 상한 5.
// 레벨이 올라도 **새 효과가 붙지는 않는다** — 그러면 상한 6짜리 숙련과 역할이 겹친다.
export const COMPANION_SKILL_MAX_LEVEL = 5;

export const COMPANION_SKILL_DEFS = {
  // 크루세이더 — 버티기
  snow_guard: { id: "snowWall", name: "설벽", kind: "partyArmor", base: 0.03, per: 0.012,
    description: "곁에 선 아군의 방어력이 오른다." },
  vine_keeper: { id: "vineBind", name: "덩굴 결박", kind: "enemySlow", base: 0.08, per: 0.03,
    description: "근처 적의 이동이 둔해진다." },
  formation_officer: { id: "battleFormation", name: "진법", kind: "formationArmor", base: 0.05, per: 0.018,
    description: "동료가 하나도 쓰러지지 않았을 때만 진형이 선다. 전원 방어력 증가." },
  oath_knight: { id: "oathShare", name: "서약", kind: "oathArmor", base: 0.08, per: 0.03, threshold: 0.4,
    description: "플레이어가 위험해지면 자기 방비를 나눠 준다." },

  // 바바리안 — 압박
  winter_berserker: { id: "chillAura", name: "한기 발산", kind: "enemyAttackSlow", base: 0.07, per: 0.025,
    description: "근처 적의 공격이 느려진다." },
  meridian_fighter: { id: "meridianFlow", name: "기맥 순환", kind: "woundedParty", base: 0.12, per: 0.05,
    description: "자기 체력이 낮을수록 아군 전체의 공격력이 오른다." },
  desert_lancer: { id: "chargeFormation", name: "돌격 대형", kind: "openingSpeed", base: 0.12, per: 0.04, windowMs: 8000,
    description: "전투 시작 8초 동안 파티가 빠르게 움직인다." },

  // 네크로맨서 — 자원
  snow_shaman: { id: "soulReflux", name: "영혼 환류", kind: "partyHeal", base: 1.2, per: 0.6,
    description: "동료의 치유량이 늘어난다." },
  spirit_ranger: { id: "spiritWard", name: "정령 가호", kind: "partyStatusResist", base: 0.08, per: 0.03,
    description: "아군이 걸린 상태이상이 빨리 풀린다." },

  // 추적자 — 표적
  venom_tracker: { id: "weakPointMark", name: "급소 표식", kind: "markedCrit", base: 0.1, per: 0.04,
    description: "플레이어가 노린 적에게 파티 전체 치명타율이 오른다." },
  caravan_guide: { id: "pathReading", name: "행로 파악", kind: "hazardMitigation", base: 1, per: 0,
    description: "지역 환경 대응 수치가 오른다. 전투 밖에서 작동한다." },

  // 아크메이지 — 마력
  sap_healer: { id: "sapCircuit", name: "수액 순환", kind: "partyRegen", base: 0.5, per: 0.25,
    description: "파티 전체가 천천히 회복한다." },
  mana_weaver: { id: "manaSupply", name: "마력 공급", kind: "playerManaRegen", base: 0.6, per: 0.3,
    description: "플레이어의 마나 회복이 빨라진다." },
  glass_alchemist: { id: "catalyst", name: "촉매", kind: "playerStatusPower", base: 0.12, per: 0.05,
    description: "플레이어가 거는 상태이상이 강해진다." },

  // 매화 — 기회
  duel_swordsman: { id: "breathSync", name: "호흡 맞추기", kind: "dodgeTempo", base: 0.1, per: 0.04,
    description: "플레이어가 회피하는 동안 파티의 공격이 빨라진다." },
  blade_dancer: { id: "guardBreak", name: "방비 허물기", kind: "enemyArmorBreak", base: 0.05, per: 0.02,
    description: "근처 적의 방어력을 깎는다." }
};

export function companionSkillDefinition(unitId) {
  return COMPANION_SKILL_DEFS[unitId] || null;
}

// 레벨 1이 기본, 상한 5. 0이면 아직 안 열린 것으로 보고 1로 취급한다.
export function companionSkillValue(definition, level = 1) {
  if (!definition) return 0;
  const clamped = Math.max(1, Math.min(COMPANION_SKILL_MAX_LEVEL, Number(level) || 1));
  return definition.base + definition.per * (clamped - 1);
}

// 스킬 경험치. 기억 던전에서만 쌓인다(영지 계층 던전과 결합).
export function companionSkillXpNeeded(level = 1) {
  return 8 + Math.max(0, level - 1) * 6;
}

// 전투 밖에서 읽는 것 — 지역 환경 대응. 편성한 동료만 센다.
export function companionHazardMitigation(partyIds = [], unitProgress = {}) {
  return partyIds.reduce((total, unitId) => {
    const definition = COMPANION_SKILL_DEFS[unitId];
    if (definition?.kind !== "hazardMitigation") return total;
    return total + Math.round(companionSkillValue(definition, unitProgress[unitId]?.skillLevel));
  }, 0);
}

// 그 지역에서 아직 못 구한 특수 동료.
//
// 다섯을 다 구할 수 있다. 하나만 고르게 했더니 특수 시설 다섯 중 넷이
// 통째로 잠겼다 — 마탑·주술룬·특수단조·부활·골렘은 역할이 서로 달라서
// 하나로 묶으면 회차마다 되는 것과 안 되는 것이 통째로 갈린다.
// 몇 명까지 허용할지는 밸런싱하면서 다시 본다.
export function pendingRescueUnitId(regionId, roster = []) {
  const special = Object.values(SPECIAL_UNIT_DEFS).find((unit) => unit.regionId === regionId);
  return special && !roster.includes(special.id) ? special.id : null;
}

export const SPECIAL_UNIT_DEFS = {
  tower_architect: {
    id: "tower_architect", name: "마탑 설계자", regionId: "north", role: "유틸", glyph: "▲", color: "#8fb6e0",
    maxHp: 33, damage: 4, range: 22, speed: 8, attackMs: 1150, armor: 0.07, scores: [1, 1, 4],
    primary: "마력 회로", weakness: "직접 전투 능력이 낮다.", baseClassId: "archmage", special: true,
    specialPassive: {
      id: "arcaneCircuit", name: "마력 회로", effect: "partyCooldown", cooldownReduction: 0.06,
      description: "아군 전체의 기술 회전을 조금 빠르게 한다."
    }
  },
  wandering_shaman: {
    id: "wandering_shaman", name: "떠돌이 주술사", regionId: "south", role: "딜·유틸", glyph: "◈", color: "#7fbf8c",
    maxHp: 31, damage: 5, range: 21, speed: 9, attackMs: 1080, armor: 0.06, poisonDamage: 1, scores: [2, 1, 3],
    primary: "주술 각인", weakness: "즉발 화력이 없다.", baseClassId: "necromancer", special: true,
    specialPassive: {
      id: "runeCarving", name: "주술 각인", effect: "partyStatusPower", statusPotency: 0.18,
      description: "아군이 거는 상태이상의 위력과 지속시간을 늘린다."
    }
  },
  hunted_smith: {
    id: "hunted_smith", name: "쫓기던 대장장이", regionId: "east", role: "탱·유틸", glyph: "⚒", color: "#c9925f",
    maxHp: 46, damage: 6, range: 8, speed: 7, attackMs: 1220, armor: 0.2, scores: [1, 3, 2],
    primary: "야전 단조", weakness: "원거리 대응이 어렵다.", baseClassId: "crusader", special: true,
    specialPassive: {
      id: "fieldForge", name: "야전 단조", effect: "partyArmorPoints", armorFlat: 8,
      description: "전투 중 아군의 장구를 손봐 방어 점수를 올린다."
    }
  },
  fallen_paladin: {
    id: "fallen_paladin", name: "타락 직전의 성기사", regionId: "west", role: "탱커", glyph: "†", color: "#b9a2d4",
    maxHp: 54, damage: 6, range: 8, speed: 7, attackMs: 1240, armor: 0.26, scores: [1, 4, 1],
    primary: "금지된 서약", weakness: "스스로를 갉아먹는다.", baseClassId: "crusader", special: true,
    // 이 하나만 동료 본인이 아니라 **플레이어**에게 붙는다. 편성하지 않아도
    // 구조해서 명부에 있기만 하면 금지된 지식이 플레이어에게 남는다
    // (docs/COMPANION_EVENT_DESIGN.md §서부 — 흑마법의 비밀).
    // 동료의 죽음이 아니라 플레이어의 죽음을 되돌리는 게 이 보상의 요점이다.
    grantsPlayerPassive: {
      id: "forbiddenOath", name: "흑마법의 비밀", effect: "reviveOnce", healRatio: 0.35,
      description: "전투당 한 번, 쓰러져도 체력 일부를 안고 다시 일어난다."
    }
  },
  relic_scholar: {
    id: "relic_scholar", name: "고고학자", regionId: "central", role: "유틸", glyph: "◎", color: "#d3b273",
    maxHp: 34, damage: 4, range: 20, speed: 9, attackMs: 1100, armor: 0.09, scores: [1, 2, 4],
    primary: "유물 해독", weakness: "혼자서는 싸우지 못한다.", baseClassId: "tracker", special: true,
    specialPassive: {
      id: "relicReading", name: "유물 해독", effect: "partyCommand", commandAura: 0.08,
      description: "유물에서 읽어낸 전술로 아군의 피해를 조금 올린다."
    }
  }
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
  blade_dancer: { id: "blade_dancer", name: "파쇄검무", regionId: "east", role: "딜·유틸", glyph: "劍", color: "#c98fa8", maxHp: 34, damage: 7, range: 8, speed: 12, attackMs: 820, armor: 0.1, scores: [3, 1, 3], primary: "방비 허물기", weakness: "혼자서는 적을 못 끝낸다.", baseClassId: "maehwa" },
  meridian_fighter: { id: "meridian_fighter", name: "기맥 권사", regionId: "east", role: "딜·탱", glyph: "武", color: "#b98a70", maxHp: 43, damage: 7, range: 7, speed: 12, attackMs: 870, armor: 0.14, lifeSteal: 0.12, scores: [3, 2, 1], primary: "기맥 순환", weakness: "원거리 적에게 접근해야 한다.", baseClassId: "barbarian" },

  oath_knight: { id: "oath_knight", name: "서약 중검기사", regionId: "west", role: "탱커", glyph: "♜", color: "#d0b46f", maxHp: 56, damage: 6, range: 8, speed: 6, attackMs: 1280, armor: 0.3, heal: 2, healMs: 5200, scores: [1, 4, 1], primary: "중검 방벽", weakness: "기동과 공격 주기가 느리다.", baseClassId: "crusader" },
  mana_weaver: { id: "mana_weaver", name: "마나 술사", regionId: "west", role: "딜·유틸", glyph: "✦", color: "#aa91d0", maxHp: 29, damage: 9, range: 25, speed: 8, attackMs: 1120, armor: 0.04, scores: [3, 1, 2], primary: "마나 폭주", weakness: "매우 약한 방어와 체력을 가진다.", baseClassId: "archmage" },
  spirit_ranger: { id: "spirit_ranger", name: "정령 순찰자", regionId: "west", role: "유틸", glyph: "♧", color: "#85b99b", maxHp: 34, damage: 5, range: 23, speed: 10, attackMs: 980, armor: 0.08, heal: 3, healMs: 4100, partyArmor: 0.03, scores: [1, 1, 4], primary: "정령 교감", weakness: "정령 지원이 분산되면 효율이 낮다.", baseClassId: "necromancer" },

  desert_lancer: { id: "desert_lancer", name: "사막 창기병", regionId: "central", role: "딜·탱", glyph: "➶", color: "#d2a25d", maxHp: 41, damage: 7, range: 10, speed: 14, attackMs: 900, armor: 0.13, chargeDamage: 0.25, scores: [3, 2, 1], primary: "돌파 기동", weakness: "좁은 전장과 장기전에 약하다.", baseClassId: "barbarian" },
  glass_alchemist: { id: "glass_alchemist", name: "유리사 연금술사", regionId: "central", role: "딜·유틸", glyph: "⚗", color: "#cf9257", maxHp: 31, damage: 5, range: 22, speed: 8, attackMs: 1080, armor: 0.06, poisonDamage: 1, heal: 2, healMs: 5000, scores: [2, 1, 3], primary: "분진 조합", weakness: "준비 없이 돌입한 전투에 약하다.", baseClassId: "archmage" },
  caravan_guide: { id: "caravan_guide", name: "대상단 길잡이", regionId: "central", role: "유틸", glyph: "◎", color: "#d4bc7a", maxHp: 36, damage: 4, range: 20, speed: 12, attackMs: 1000, armor: 0.09, commandAura: 0.1, heal: 2, healMs: 4700, scores: [1, 1, 4], primary: "보급 지휘", weakness: "전투를 끝낼 결정력이 부족하다.", baseClassId: "tracker" },

  ...SPECIAL_UNIT_DEFS,
  ...GOLEM_UNIT_DEFS
};

// 몬스터 아틀라스에 들어 있는 종. **순서가 곧 아틀라스의 가로 순서다** —
// 잘라내는 위치를 이 배열의 인덱스로 계산하므로(styles.css --monster-index),
// 순서를 바꾸면 전부 다른 그림이 나온다. 새 종은 반드시 뒤에 붙인다.
//
// 종 데이터 옆에 두는 이유: 아래 ENEMY_COMBATANTS에 새 species를 적고 여기
// 추가하는 걸 잊으면 그 몬스터는 화면에 글자 하나로만 뜬다. 테스트가 둘을 맞춰본다.
// **실제로 PNG에 그려져 있는 것만** 적는다. 목록에 미리 적어두면 아틀라스를
// N등분하는 계산이 바뀌어서, 이미 그려진 종까지 엉뚱한 칸을 가리키게 된다.
// 그림이 늘면 PNG · 이 목록 · styles.css의 --monster-count 셋을 함께 고친다.
export const MONSTER_ATLAS_SPECIES = Object.freeze([
  "goblin", "orc", "wolf", "bear"
]);

// 아직 그림이 없는 종. 화면에는 글리프 문자 하나로만 뜬다.
// 알파 전에 채워야 하는 목록이고, 여기 있는 동안은 "빠뜨린 것"이 아니라
// "아직 안 그린 것"으로 취급한다 — 테스트가 이 둘을 구분해서 본다.
export const MONSTER_SPECIES_PENDING_ART = Object.freeze([
  "lich", "dragon", "titan", "oni", "fox", "spider", "serpent",
  "centipede", "undead", "worm", "chimera", "construct", "aberration"
]);

export const ENEMY_COMBATANTS = {
  northGoblin: { name: "북부 홉고블린", species: "goblin", variant: "대형종", glyph: "G", maxHp: 29, damage: 7, range: 8, speed: 7, attackMs: 1380, armor: 0.08, color: "#789db0" },
  northOrc: { name: "서리갑주 오크", species: "orc", variant: "빙철 갑주", glyph: "O", maxHp: 34, damage: 7, range: 8, speed: 6, attackMs: 1460, armor: 0.16, color: "#7292a3", statusOnHit: { id: "frost", stacks: 1 }, statusEvery: 2 },
  northWolf: { name: "설원 늑대", species: "wolf", variant: "빙결 송곳니", glyph: "Λ", maxHp: 21, damage: 5, range: 7, speed: 13, attackMs: 1020, color: "#8cb9cd", statusOnHit: { id: "frost", stacks: 1 }, statusEvery: 3 },
  // ── 필드 보스 (docs/EQUIPMENT_DESIGN.md §9) ──
  // 모두 "기존 전투 규칙 안의 매우 강한 적"이며 HP 50%에서 패턴이 추가된다
  // (형태는 그대로 — 형태가 바뀌는 건 지역 보스뿐이다. docs/BOSS_DESIGN.md §1).
  // 부산물은 보스당 2종씩 확정 지급한다.
  northLich: {
    fieldTier: 1,
    name: "타락한 마탑 리치", species: "lich", variant: "북부 필드 보스", glyph: "L",
    maxHp: 168, damage: 12, range: 26, speed: 6, attackMs: 1500, armor: 0.1,
    color: "#8f7fc0", boss: true, preScaled: true,
    patterns: ["frostVolley", "groundSlam"],
    phase2Patterns: ["quakeRoar", "callPack"],
    byproducts: { frostCore: 2, taintedTome: 1 }
  },
  northWarchief: {
    fieldTier: 3,
    name: "오크 대전사", species: "orc", variant: "북부 필드 보스", glyph: "W",
    maxHp: 190, damage: 14, range: 9, speed: 7, attackMs: 1450, armor: 0.18,
    color: "#8a9c6d", boss: true, preScaled: true,
    patterns: ["chargeRush", "groundSlam"],
    phase2Patterns: ["quakeRoar"],
    byproducts: { warchiefAxe: 1, shamanStone: 2 }
  },

  southStarSpawn: {
    fieldTier: 3,
    name: "어린 스타 스폰", species: "aberration", variant: "남부 필드 보스", glyph: "Y",
    maxHp: 176, damage: 12, range: 14, speed: 5, attackMs: 1600, armor: 0.12,
    color: "#5f7f8c", boss: true, preScaled: true,
    patterns: ["tentacleLash", "inkSpray"],
    phase2Patterns: ["coilCrush"],
    byproducts: { tentacleRoot: 2, inkSac: 1 }
  },
  southSpider: {
    fieldTier: 2,
    name: "인면지주", species: "spider", variant: "남부 필드 보스", glyph: "X",
    maxHp: 158, damage: 11, range: 16, speed: 8, attackMs: 1350, armor: 0.1,
    color: "#7a6a8c", boss: true, preScaled: true,
    patterns: ["webTrap", "venomFang"],
    phase2Patterns: ["frostVolley"],
    byproducts: { spiderFang: 2, spiderSilk: 2 }
  },
  southSerpent: {
    fieldTier: 1,
    name: "거대 뱀", species: "serpent", variant: "남부 필드 보스", glyph: "S",
    maxHp: 184, damage: 13, range: 10, speed: 9, attackMs: 1400, armor: 0.14,
    color: "#6f9a62", boss: true, preScaled: true,
    patterns: ["venomFang", "coilCrush"],
    phase2Patterns: ["chargeRush"],
    byproducts: { serpentHide: 2, venomSac: 1 }
  },

  eastFox: {
    fieldTier: 1,
    name: "구미호", species: "fox", variant: "동부 필드 보스", glyph: "F",
    maxHp: 162, damage: 12, range: 22, speed: 10, attackMs: 1300, armor: 0.08,
    color: "#c98a6b", boss: true, preScaled: true,
    // 매혹·정화 신수. 걸어둔 상태이상을 스스로 씻어내는 게 동부 카운터의 핵심이라
    // 1페이즈부터 정화를 들고 나온다(몬스터 컨셉.txt).
    patterns: ["foxfire", "spiritCleanse"],
    phase2Patterns: ["callPack", "quakeRoar"],
    byproducts: { foxTail: 1, spiritCore: 2 }
  },
  eastOni: {
    fieldTier: 2,
    name: "오니 대장", species: "oni", variant: "동부 필드 보스", glyph: "O",
    maxHp: 196, damage: 15, range: 10, speed: 6, attackMs: 1550, armor: 0.2,
    color: "#b05f52", boss: true, preScaled: true,
    patterns: ["oniCleave", "chargeRush"],
    phase2Patterns: ["quakeRoar"],
    byproducts: { oniBlade: 1, oniHorn: 2 }
  },
  eastCentipede: {
    fieldTier: 3,
    name: "초거대 지네", species: "centipede", variant: "동부 필드 보스", glyph: "C",
    maxHp: 180, damage: 12, range: 9, speed: 11, attackMs: 1250, armor: 0.22,
    color: "#9a7d52", boss: true, preScaled: true,
    patterns: ["centipedeDash", "acidMist"],
    phase2Patterns: ["oniCleave"],
    byproducts: { chitinPlate: 2, greatMandible: 1 }
  },

  westDurahan: {
    fieldTier: 1,
    name: "듀라한", species: "undead", variant: "서부 필드 보스", glyph: "D",
    maxHp: 186, damage: 14, range: 10, speed: 8, attackMs: 1400, armor: 0.2,
    color: "#7a8496", boss: true, preScaled: true,
    patterns: ["wraithCharge", "groundSlam"],
    phase2Patterns: ["curseWave"],
    // 1필드 보스. 듀라한의 영혼은 서부 저주 대응 장신구의 핵심 소재라
    // 기존 두 종에 더해 함께 나온다(REGION_PROGRESSION_HAZARDS.md §4).
    byproducts: { durahanBlade: 1, cursedPlate: 2, durahanSoul: 1 }
  },
  westLich: {
    fieldTier: 3,
    name: "몰락 제국 리치", species: "lich", variant: "서부 필드 보스", glyph: "R",
    maxHp: 170, damage: 13, range: 26, speed: 6, attackMs: 1500, armor: 0.12,
    color: "#9b82bd", boss: true, preScaled: true,
    patterns: ["relicBurst", "curseWave"],
    phase2Patterns: ["callPack"],
    byproducts: { fallenRelic: 1, soulStone: 2 }
  },
  westDragon: {
    fieldTier: 2,
    name: "고룡", species: "dragon", variant: "서부 필드 보스", glyph: "▲",
    maxHp: 240, damage: 16, range: 13, speed: 7, attackMs: 1600, armor: 0.24,
    color: "#a8734f", boss: true, preScaled: true,
    patterns: ["dragonBreath", "wingSweep"],
    phase2Patterns: ["quakeRoar", "chargeRush"],
    byproducts: { dragonBone: 1, dragonScale: 2 }
  },

  // ── 중부 필드 보스 (페르시아·유목 재설계분) ──
  // 문화권이 이집트에서 페르시아·유목으로 바뀌며 확정된 3종.
  centralSandworm: {
    name: "샌드웜", species: "worm", variant: "중부 필드 보스", glyph: "S",
    // 1필드 보스. 열핵이 중부 하드 게이트(내열)를 여는 열쇠라 가장 먼저 만난다.
    fieldTier: 1,
    maxHp: 176, damage: 13, range: 10, speed: 10, attackMs: 1400, armor: 0.18,
    color: "#c99a5c", boss: true, preScaled: true,
    patterns: ["centipedeDash", "quakeRoar"],
    phase2Patterns: ["groundSlam"],
    byproducts: { wormCore: 1, wormPlate: 2 }
  },
  centralManticore: {
    name: "인공 만티코어", species: "chimera", variant: "중부 필드 보스", glyph: "M",
    // 고대 마도공학이 페르시아 전승의 만티코어를 생명 합성으로 재현한 키메라 병기.
    fieldTier: 2,
    maxHp: 182, damage: 14, range: 20, speed: 11, attackMs: 1300, armor: 0.14,
    color: "#b06a5f", boss: true, preScaled: true,
    patterns: ["venomFang", "oniCleave"],
    phase2Patterns: ["frostVolley", "chargeRush"],
    byproducts: { manticoreBarb: 2, synthNerve: 1 }
  },
  centralGolem: {
    name: "거대 골렘", species: "construct", variant: "중부 필드 보스", glyph: "G",
    // 고대 마도공학 문명의 자동 병기. 느리지만 단단하고 한 방이 크다.
    fieldTier: 3,
    maxHp: 214, damage: 16, range: 10, speed: 4, attackMs: 1850, armor: 0.26,
    color: "#9a8f74", boss: true, preScaled: true,
    patterns: ["groundSlam", "chargeRush"],
    phase2Patterns: ["quakeRoar", "coreBurst"],
    byproducts: { golemCore: 1, ancientAlloy: 2 }
  },

  // ── 지역 보스 (몬스터 컨셉.txt) ──
  // 필드 보스와 달리 HP 50%에서 패턴 풀이 **교체**되고 형태가 바뀐다.
  // 전부 단독 전투다 — 기믹으로 싸우는 보스라 잡몹을 섞으면 뭘 봐야 할지 흐려진다.
  southDeepOne: {
    name: "딥원", species: "aberration", variant: "남부 지역 보스", glyph: "D",
    maxHp: 300, damage: 15, range: 16, speed: 6, attackMs: 1700, armor: 0.16,
    color: "#4f7382", boss: true, preScaled: true,
    patterns: ["tentacleLash", "inkSpray", "coilCrush"],
    phase2Patterns: ["tentacleCascade", "coreBurst", "callPack"],
    phaseMode: "replace", phase2Form: "risen",
    byproducts: { abyssEye: 2, voidIchor: 3 }
  },
  eastDragon: {
    name: "동양용", species: "dragon", variant: "동부 지역 보스", glyph: "龍",
    // 산봉우리 지형에서 패턴 회피 위주로 싸우는 보스라, 체력보다 패턴 밀도가 높다.
    maxHp: 285, damage: 14, range: 15, speed: 9, attackMs: 1500, armor: 0.18,
    color: "#6fa38c", boss: true, preScaled: true,
    patterns: ["centipedeDash", "foxfire", "oniCleave"],
    phase2Patterns: ["dragonBreath", "ruinCharge", "spiritCleanse"],
    phaseMode: "replace", phase2Form: "ascended",
    byproducts: { dragonPearl: 2, reverseScale: 3 }
  },
  westFallenKing: {
    name: "타락한 왕", species: "undead", variant: "서부 지역 보스", glyph: "K",
    maxHp: 310, damage: 16, range: 12, speed: 7, attackMs: 1650, armor: 0.22,
    color: "#8d7ba0", boss: true, preScaled: true,
    patterns: ["wraithCharge", "curseWave", "relicBurst"],
    phase2Patterns: ["cursedProcession", "ruinCharge", "coreBurst"],
    phaseMode: "replace", phase2Form: "cursed",
    byproducts: { fallenCrown: 2, regicideSeal: 3 }
  },
  centralColossus: {
    name: "거신병", species: "construct", variant: "중부 지역 보스", glyph: "G",
    maxHp: 340, damage: 15, range: 13, speed: 4, attackMs: 1900, armor: 0.26,
    color: "#b08a55", boss: true, preScaled: true,
    patterns: ["groundSlam", "chargeRush", "callPack"],
    phase2Patterns: ["coreBurst", "quakeRoar", "ruinCharge"],
    phaseMode: "replace", phase2Form: "coreExposed",
    byproducts: { colossusReactor: 2, ancientCircuit: 3 }
  },

  // 북부 지역 보스(docs/BOSS_DESIGN.md §4 타이탄).
  // 필드 보스와 달리 HP 50%에서 패턴 풀이 **교체**되고 형태가 바뀐다.
  // 부위 공략(팔·다리를 노려 자세를 무너뜨리는 기믹)은 유닛에 부위 개념이
  // 필요해서 이번 범위 밖이다 - 문서에서도 타이탄 전용 기믹으로 못박아뒀다.
  northTitan: {
    name: "설산의 타이탄", species: "titan", variant: "지역 보스", glyph: "T",
    maxHp: 320, damage: 14, range: 11, speed: 3, attackMs: 1900, armor: 0.2,
    color: "#8fa6bd", boss: true, preScaled: true,
    // 2페이즈에 연쇄를 넣어 "옆으로 빠지는" 축을 준다. 최종 티어 넷이 2페이즈가
    // 전부 같던 것을 여기서부터 가른다(BOSS_PATTERN_CONCEPT.md §2).
    // replace 모드라 1페이즈 패턴은 2페이즈에 하나도 남지 않는다.
    patterns: ["groundSlam", "chargeRush", "quakeRoar"],
    phase2Patterns: ["coreBurst", "stoneRow", "ruinCharge"],
    phaseMode: "replace",
    phase2Form: "coreExposed",
    byproducts: { titanCore: 2, titanMarrow: 3 }
  },
  northBear: { fieldTier: 2, name: "빙맥 큰곰", species: "bear", variant: "빙맥 우두머리", glyph: "B", maxHp: 96, damage: 11, range: 9, speed: 4, attackMs: 1650, armor: 0.12, color: "#79aec7", boss: true,
    // 북부 필드 보스(docs/EQUIPMENT_DESIGN.md §9 "설원 거대 곰").
    // 1페이즈는 원형·직선 두 종류로 대응법을 나누고, HP 50%부터 연속 장판과
    // 광역 포효가 추가된다(필드 보스이므로 교체가 아니라 추가 - §1).
    patterns: ["groundSlam", "chargeRush"],
    phase2Patterns: ["frostVolley", "quakeRoar"],
    phaseMode: "extend",
    byproducts: { bearHide: 2, bearSinew: 1 }, statusOnHit: { id: "stun", durationMs: 850 }, statusEvery: 3 },

  southGoblin: { name: "독침 고블린", species: "goblin", variant: "독침 사수", glyph: "G", maxHp: 19, damage: 4, range: 21, speed: 10, attackMs: 1080, color: "#6fa66d", statusOnHit: { id: "poison", stacks: 1 } },
  southOrc: { name: "덩굴갑주 오크", species: "orc", variant: "재생 갑주", glyph: "O", maxHp: 31, damage: 6, range: 8, speed: 6, attackMs: 1390, armor: 0.14, hpRegen: 0.2, color: "#638f63" },
  southWolf: { name: "수풀 늑대", species: "wolf", variant: "독니 매복종", glyph: "Λ", maxHp: 20, damage: 5, range: 7, speed: 13, attackMs: 1010, color: "#80a965", statusOnHit: { id: "poison", stacks: 1 }, statusEvery: 2 },
  southBear: { fieldTier: 2, name: "수관 큰곰", species: "bear", variant: "맹독 우두머리", glyph: "B", maxHp: 88, damage: 9, range: 9, speed: 5, attackMs: 1500, armor: 0.1, hpRegen: 0.25, color: "#6e9e62", boss: true, 
    patterns: ["venomFang", "coilCrush"],
    phase2Patterns: ["webTrap"],
    byproducts: { serpentHide: 1, venomSac: 1 },
    statusOnHit: { id: "poison", stacks: 2 } },

  eastGoblin: { name: "산성 고블린 궁수", species: "goblin", variant: "장궁 사수", glyph: "G", maxHp: 20, damage: 6, range: 24, speed: 9, attackMs: 1220, color: "#b37b60" },
  eastOrc: { name: "단조갑주 오크", species: "orc", variant: "중갑 수문병", glyph: "O", maxHp: 34, damage: 6, range: 8, speed: 5, attackMs: 1460, armor: 0.21, color: "#9f765f" },
  eastWolf: { name: "산등성이 늑대", species: "wolf", variant: "절벽 추격종", glyph: "Λ", maxHp: 22, damage: 7, range: 7, speed: 13, attackMs: 1050, color: "#9a7562", statusOnHit: { id: "bleed", stacks: 1 }, statusEvery: 2 },
  eastBear: { fieldTier: 2, name: "철발톱 큰곰", species: "bear", variant: "단조성 우두머리", glyph: "B", maxHp: 94, damage: 10, range: 9, speed: 5, attackMs: 1500, armor: 0.18, color: "#bd7459", boss: true, 
    patterns: ["oniCleave", "chargeRush"],
    phase2Patterns: ["quakeRoar"],
    byproducts: { chitinPlate: 1, mountainIron: 1 },
    statusOnHit: { id: "bleed", stacks: 2 }, statusEvery: 2 },

  westGoblin: { name: "마나 고블린 술사", species: "goblin", variant: "화염 마법종", glyph: "G", maxHp: 18, damage: 6, range: 24, speed: 9, attackMs: 1180, color: "#9b82bd", statusOnHit: { id: "burn" }, statusEvery: 3 },
  westOrc: { name: "서약 파기 오크", species: "orc", variant: "기사 무장", glyph: "O", maxHp: 29, damage: 8, range: 8, speed: 7, attackMs: 1300, armor: 0.13, color: "#a17870" },
  westWolf: { name: "정령숲 늑대", species: "wolf", variant: "마력 추적종", glyph: "Λ", maxHp: 22, damage: 5, range: 8, speed: 14, attackMs: 990, color: "#7f9c71", statusOnHit: { id: "decay" }, statusEvery: 3 },
  westBear: { fieldTier: 2, name: "룬갑주 큰곰", species: "bear", variant: "폐서약당 우두머리", glyph: "B", maxHp: 98, damage: 10, range: 10, speed: 5, attackMs: 1540, armor: 0.16, color: "#b29378", boss: true, 
    patterns: ["groundSlam", "curseWave"],
    phase2Patterns: ["relicBurst"],
    byproducts: { cursedPlate: 1, soulStone: 1 },
    statusOnHit: { id: "stun", durationMs: 800 }, statusEvery: 3 },

  centralGoblin: { name: "화염병 고블린", species: "goblin", variant: "연금 투척수", glyph: "G", maxHp: 19, damage: 5, range: 22, speed: 10, attackMs: 1150, color: "#cf9257", statusOnHit: { id: "burn" }, statusEvery: 3 },
  centralOrc: { name: "사구 도끼오크", species: "orc", variant: "대상로 약탈자", glyph: "O", maxHp: 31, damage: 8, range: 8, speed: 7, attackMs: 1320, armor: 0.1, color: "#b97648", statusOnHit: { id: "bleed", stacks: 1 }, statusEvery: 2 },
  centralWolf: { name: "모래 늑대", species: "wolf", variant: "고속 추적종", glyph: "Λ", maxHp: 20, damage: 6, range: 7, speed: 14, attackMs: 1000, color: "#c18b52", statusOnHit: { id: "bleed", stacks: 1 }, statusEvery: 3 },
  centralBear: { fieldTier: 2, name: "사구 큰곰", species: "bear", variant: "유리사 우두머리", glyph: "B", maxHp: 90, damage: 11, range: 9, speed: 5, attackMs: 1480, armor: 0.13, color: "#cf8b46", boss: true, 
    patterns: ["groundSlam", "chargeRush"],
    phase2Patterns: ["quakeRoar"],
    byproducts: { glassSand: 2, sunShard: 1 },
    statusOnHit: { id: "stun", durationMs: 750 }, statusEvery: 3 }
};

// ── 재료 등급 5단계 ────────────────────────────────────────────────────────
//
// 등급은 **어떻게 손에 넣는가**로 정한다. 이름이나 카테고리가 아니라 획득 경로다 —
// MATERIAL_DEFS의 category는 special 하나에 약초 12종과 보스 부산물 31종이
// 섞여 있어 아무것도 구분해주지 못한다.
//
//   노멀   필드에서 줍거나 캔다        원광·약초·목재
//   고급   한 번 가공한다              제련 주괴, 그리고 환상종 원석·약초
//   희귀   두 번 가공한다              환상종 주괴·정수, 흑철, 마석
//   전설   필드 보스가 떨군다          31종
//   신화   지역 보스가 떨군다          5종
//
// 환상종(오리하르콘·미스릴·아다만타이트·월광초·불꽃뿌리)이 채집 단계에서
// 이미 고급인 이유: 현실에 없는 것들이라 주우는 것 자체가 사건이어야 한다.
// 대신 가공하면 희귀로 올라가 일반 제련품과 한 단계 벌어진다.
export const MATERIAL_RARITY_ORDER = ["normal", "fine", "rare", "legendary", "mythic"];

export const MATERIAL_RARITY_LABELS = {
  normal: "노멀", fine: "고급", rare: "희귀", legendary: "전설", mythic: "신화"
};

// 두 번 가공하거나 그에 준하는 손이 간 것들. 제련표만으로는 못 가려서 손으로 적는다.
const SECOND_STAGE_MATERIALS = new Set([
  "orichalcumIngot", "mithrilIngot", "adamantiteIngot",
  "moonpetalEssence", "emberrootExtract",
  "blackSteel",    // 강적의 장비에서 회수해 다시 벼린 것
  "manaStone",     // 마나를 굳혀 앉힌 것
  "runeFragment"   // 각인을 깎아낸 조각
]);

// 채집 단계지만 이미 고급인 것들 — 환상종 원석·약초.
const FANTASY_RAW_MATERIALS = new Set([
  "orichalcum", "mithril", "adamantite", "moonpetal", "emberroot"
]);

export const MATERIAL_RARITY = (() => {
  const legendary = new Set();
  const mythic = new Set();
  for (const enemy of Object.values(ENEMY_COMBATANTS)) {
    if (!enemy.byproducts) continue;
    // fieldTier가 붙은 것이 필드 보스, 아닌 것이 지역 보스다.
    const target = enemy.fieldTier ? legendary : mythic;
    for (const id of Object.keys(enemy.byproducts)) target.add(id);
  }

  const rarity = {};
  // 제련 산출물은 한 번 가공한 것 → 고급.
  for (const outputs of Object.values(ORE_SMELTING_DEFS)) {
    for (const id of Object.keys(outputs)) rarity[id] = "fine";
  }
  for (const id of FANTASY_RAW_MATERIALS) rarity[id] = "fine";

  // 특수 발견지(위험 12 이상)에서 나오는 것은 최소 고급이다.
  // 같은 심층광산에서 나오는데 산철은 전설, 설철은 노멀이던 상태를 막는다 —
  // 위험을 무릅쓰고 지은 시설의 산출물이 목재와 같은 등급일 수는 없다.
  // 바닥값이라 보스 부산물이나 2차 가공품은 그대로 위에 남는다.
  for (const site of Object.values(DISCOVERY_SITE_DEFS)) {
    if ((site.risk || 0) < 12) continue;
    for (const id of [site.materialId, ...Object.values(site.materialByRegion || {})]) {
      if (!rarity[id]) rarity[id] = "fine";
    }
  }
  for (const id of SECOND_STAGE_MATERIALS) rarity[id] = "rare";
  // 보스 부산물이 가장 세다 — 가공 여부와 무관하게 덮어쓴다.
  // 신화가 전설을 이긴다: "신화 보스가 드랍하는 부산물은 모두 신화"가 규칙이라,
  // 필드 보스와 겹치는 재료도 지역 보스가 떨구면 신화로 올라간다.
  for (const id of legendary) rarity[id] = "legendary";
  for (const id of mythic) rarity[id] = "mythic";
  return rarity;
})();

// 등급을 모르는 재료는 노멀이다 — 필드에서 줍는 것이 기본값이다.
export function materialRarity(materialId) {
  return MATERIAL_RARITY[materialId] || "normal";
}

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
  frostColossusPack: { name: "빙맥 큰곰", glyph: "☠", enemies: ["northBear", "northOrc", "northGoblin"], scrap: 13, boss: true },
  frostTitanLair: { name: "설산의 타이탄", glyph: "☠", enemies: ["northTitan"], scrap: 24, boss: true, regionBoss: true },
  deepOneLair: { name: "딥원", glyph: "☠", enemies: ["southDeepOne"], scrap: 24, boss: true, regionBoss: true },
  eastDragonLair: { name: "동양용", glyph: "☠", enemies: ["eastDragon"], scrap: 24, boss: true, regionBoss: true },
  fallenKingLair: { name: "타락한 왕", glyph: "☠", enemies: ["westFallenKing"], scrap: 24, boss: true, regionBoss: true },
  colossusLair: { name: "거신병", glyph: "☠", enemies: ["centralColossus"], scrap: 26, boss: true, regionBoss: true },
  // 필드 보스 조우. 보스 + 그 지역 잡몹 조합(단독은 지역 보스만).
  northLichLair: { name: "타락한 마탑 리치", glyph: "☠", enemies: ["northLich", "northGoblin"], scrap: 18, boss: true },
  northWarbandLair: { name: "오크 대전사", glyph: "☠", enemies: ["northWarchief", "northOrc"], scrap: 18, boss: true },
  southSpawnLair: { name: "어린 스타 스폰", glyph: "☠", enemies: ["southStarSpawn", "southGoblin"], scrap: 18, boss: true },
  southSpiderLair: { name: "인면지주", glyph: "☠", enemies: ["southSpider", "southWolf"], scrap: 18, boss: true },
  southSerpentLair: { name: "거대 뱀", glyph: "☠", enemies: ["southSerpent", "southOrc"], scrap: 18, boss: true },
  eastFoxLair: { name: "구미호", glyph: "☠", enemies: ["eastFox", "eastGoblin"], scrap: 18, boss: true },
  eastOniLair: { name: "오니 대장", glyph: "☠", enemies: ["eastOni", "eastOrc"], scrap: 18, boss: true },
  eastCentipedeLair: { name: "초거대 지네", glyph: "☠", enemies: ["eastCentipede", "eastWolf"], scrap: 18, boss: true },
  westDurahanLair: { name: "듀라한", glyph: "☠", enemies: ["westDurahan", "westOrc"], scrap: 18, boss: true },
  westLichLair: { name: "몰락 제국 리치", glyph: "☠", enemies: ["westLich", "westGoblin"], scrap: 18, boss: true },
  westDragonLair: { name: "고룡", glyph: "☠", enemies: ["westDragon", "westOrc"], scrap: 22, boss: true },
  centralSandwormLair: { name: "샌드웜", glyph: "☠", enemies: ["centralSandworm", "centralGoblin"], scrap: 18, boss: true },
  centralManticoreLair: { name: "인공 만티코어", glyph: "☠", enemies: ["centralManticore", "centralWolf"], scrap: 18, boss: true },
  centralGolemLair: { name: "거대 골렘", glyph: "☠", enemies: ["centralGolem", "centralOrc"], scrap: 20, boss: true }
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
  const partyMitigation = party.reduce((total, unitId) => {
    const unit = UNIT_DEFS[unitId];
    // 두 칸 중 어느 칸에 끼웠든 대응 수치는 한 번만 센다 —
    // 같은 특성을 겹쳐 끼워 대응을 두 배로 버는 길을 막는다.
    const hasTechnique = unitTraits(unitProgress[unitId] || {})
      .some((trait) => trait.id === region.hazard.techniqueId);
    return total + (unit.regionId === regionId ? 1 : 0) + (hasTechnique ? 1 : 0);
  }, 0);
  // 지역 진행용 목걸이는 **자기 지역에서만** 대응 수치를 준다.
  // 하나로 모든 지역을 우회하는 범용 해답을 만들지 않는다는 원칙 때문이다
  // (REGION_PROGRESSION_HAZARDS.md §1).
  const wardMitigation = equippedUniqueEffects(commander || {})
    .filter((effect) => effect.type === "regionWard" && effect.regionId === regionId)
    .reduce((total, effect) => total + (effect.mitigation || 0), 0);
  // 지역 대응 소모품. 출정할 때 한 개 소모하고 그 원정 내내 유지된다 —
  // 장신구 칸을 안 먹는 대신 매번 다시 만들어야 한다.
  const tonicMitigation = options.tonicApplied ? (REGION_TONIC_DEFS[regionId]?.mitigation || 0) : 0;
  // 대상단 길잡이의 행로 파악(동료 스킬)도 여기 합류한다 — 네 번째 갈래다.
  const guideMitigation = companionHazardMitigation(party, unitProgress);
  const hazardMitigation = partyMitigation + wardMitigation + tonicMitigation + guideMitigation;
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
      obstacleCount: options.obstacleCount,
      fieldStage: options.fieldStage || 1,
      roster: options.roster
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
    commander: { name: "개척자", mastery: 0, xp: 0, ...commander },
    commanderXp: 0,
    unitProgress: Object.fromEntries(party.map((unitId) =>
      [unitId, { mastery: 0, xp: 0, branchId: null, traitIds: [null, null], ...(unitProgress[unitId] || {}) }])),
    unitXp: Object.fromEntries(party.map((unitId) => [unitId, 0])),
    // 구조한 특수 동료가 남긴 플레이어 패시브를 판정하려면 명부가 필요하다.
    // 편성(party)이 아니라 명부(roster) 전체다 — 데려가지 않아도 효과는 남는다.
    roster: [...(options.roster || [])],
    // 한 지역은 필드 셋을 지나 던전으로 이어진다.
    fieldStage: options.fieldStage || 1,
    hazardMitigation,
    // 지역 핵을 흡수했으면 완전 차단 문턱이 내려간다(면역이 아니라 문턱만).
    hazardAbsorbed: Boolean(options.hazardAbsorbed),
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
    // 원정 전투도 결정적으로 굴린다 — 같은 저장에서 같은 결과가 나와야
    // 재현·디버깅이 되고, 저장을 되돌려 결과를 다시 뽑는 것도 막힌다.
    rollSeed: (run.seed || 1) + (run.battleSeq = (run.battleSeq || 0) + 1) * 7919,
    regionId: run.regionId,
    hazardMitigation: run.hazardMitigation,
    hazardAbsorbed: run.hazardAbsorbed,
    commander: run.commander,
    roster: run.roster,
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
      rollSeed: (run.seed || 1) + (run.battleSeq = (run.battleSeq || 0) + 1) * 7919,
      regionId: run.regionId,
      hazardMitigation: run.hazardMitigation,
    hazardAbsorbed: run.hazardAbsorbed,
      commander: run.commander,
      roster: run.roster,
      forceBoss: Boolean(feature.boss),
      // 아직 못 구한 특수 동료는 그 지역 던전 보스전에 아군으로 끼어든다.
      // 갇혀 있다 튀어나와 같이 싸우는 그림이다 — 던전 클리어가 곧 구조다.
      rescueAllyId: feature.boss ? pendingRescueUnitId(run.regionId, run.roster) : null,
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

// 특성 슬롯은 두 칸이다. 두 특성이 같은 스탯을 건드리면 비율은 더하고,
// 회복 주기처럼 "빠른 쪽이 이기는" 값은 더 좋은 쪽만 취한다.
// 인자로 배열이 아니라 특성 하나만 와도 되게 열어둔 건 예전 호출부 호환 때문이다.
export function mergeTraits(input) {
  const list = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const merged = {
    hpBonus: 0, damageBonus: 0, armorBonus: 0, speedBonus: 0, attackMsBonus: 0,
    partyArmor: 0, commandAura: 0, poisonDamage: 0, heal: 0,
    healMs: Number.POSITIVE_INFINITY
  };
  for (const trait of list) {
    merged.hpBonus += trait.hpBonus || 0;
    merged.damageBonus += trait.damageBonus || 0;
    merged.armorBonus += trait.armorBonus || 0;
    merged.speedBonus += trait.speedBonus || 0;
    merged.attackMsBonus += trait.attackMsBonus || 0;
    merged.partyArmor += trait.partyArmor || 0;
    merged.commandAura += trait.commandAura || 0;
    merged.poisonDamage = Math.max(merged.poisonDamage, trait.poisonDamage || 0);
    merged.heal = Math.max(merged.heal, trait.heal || 0);
    if (trait.healMs) merged.healMs = Math.min(merged.healMs, trait.healMs);
  }
  return merged;
}

// 동료가 실제로 발동시키는 특성들. 열린 슬롯 수를 넘겨 낀 건 무시한다 —
// 숙련도를 되돌리는 상황(마이그레이션, 리셋)에서 조용히 초과 적용되지 않게.
export function unitTraits(progress = {}) {
  const slots = masterySlots(progress.mastery || 0);
  return (progress.traitIds || []).slice(0, slots)
    .map((id) => SECONDARY_DEFS[id])
    .filter(Boolean);
}

function createCombatant(definition, id, team, index, progress = {}, secondary = null) {
  // 레벨 스케일링은 없다. 강함은 기본 스탯 + 장비 + 특성으로만 결정된다.
  // 숙련도(progress.mastery)는 스탯을 주지 않고 특성 슬롯을 열 뿐이다.
  const unitSide = team === "unit";
  const trait = mergeTraits(secondary);
  const maxHp = Math.max(1, Math.round(definition.maxHp * (1 + trait.hpBonus)));
  // 느려진 만큼 한 대를 무겁게 — 교환 횟수는 줄고 무게가 커진다.
  const damage = Math.max(1, Math.round(definition.damage * (1 + trait.damageBonus) * COMBAT_TEMPO.damage));
  const mastery = unitSide ? Math.max(0, progress.mastery || 0) : 0;
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
    mastery,
    hp: maxHp,
    maxHp,
    baseMaxHp: maxHp,
    damage,
    baseDamage: damage,
    range: definition.range,
    speed: definition.speed * (1 + trait.speedBonus) * COMBAT_TEMPO.moveSpeed,
    // 동료는 플레이어와 같은 템포로, 적은 더 크게 벌린다 — 패턴을 읽을 틈.
    attackMs: Math.max(560, (definition.attackMs + trait.attackMsBonus)
      * (unitSide ? COMBAT_TEMPO.playerAttackMs : COMBAT_TEMPO.enemyAttackMs)),
    armor: companionArmor(definition, { armorBonus: trait.armorBonus }),
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
    criticalChance: definition.criticalChance ?? 0,
    criticalDamage: definition.criticalDamage ?? 1.5,
    cooldownMultiplier: definition.cooldownMultiplier || 1,
    maxMana: definition.maxMana || 0,
    mana: definition.maxMana || 0,
    manaRegen: definition.manaRegen || 0,
    hpRegen: definition.hpRegen || 0,
    regenRemainder: 0,
    heal: Math.max(definition.heal || 0, trait.heal),
    healMs: Math.min(definition.healMs || Number.POSITIVE_INFINITY, trait.healMs),
    healCooldown: 900,
    poisonDamage: Math.max(definition.poisonDamage || 0, trait.poisonDamage),
    statusOnHit: definition.statusOnHit ? { ...definition.statusOnHit } : null,
    statusEvery: Math.max(1, Number(definition.statusEvery || 1)),
    // 필드 보스가 죽을 때 확정으로 주는 재료(docs/EQUIPMENT_DESIGN.md §5).
    byproducts: definition.byproducts ? { ...definition.byproducts } : null,
    attackCount: 0,
    lifeSteal: definition.lifeSteal || 0,
    finisher: definition.finisher || 1,
    buffCarry: definition.buffCarry || 0,
    chargeDamage: definition.chargeDamage || 0,
    // 동료 스킬 레벨. 기억 던전에서 오른다(COMPANION_SKILL_DEFS).
    skillLevel: Math.max(1, Number(progress.skillLevel) || 1),
    partyArmor: (definition.partyArmor || 0) + trait.partyArmor,
    commandAura: (definition.commandAura || 0) + trait.commandAura,
    cooldown: index * 140,
    x: unitSide ? 14 : 86,
    y: unitSide ? unitY : enemyY,
    specialPassive: definition.specialPassive ? { ...definition.specialPassive } : null,
    boss: Boolean(definition.boss),
    // 보스 패턴 목록. 있으면 평타 대신 예고 장판을 깐다.
    patterns: [...(definition.patterns || [])],
    // HP 50%에서 열리는 패턴. extend는 추가, replace는 교체(docs/BOSS_DESIGN.md).
    phase2Patterns: [...(definition.phase2Patterns || [])],
    phaseMode: definition.phaseMode || "extend",
    phase2Form: definition.phase2Form || null,
    phase: 1,
    form: null,
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
  // 구조 대상이 있으면 편성에 없어도 아군으로 세운다. 갇혀 있다 튀어나와
  // 같이 싸우는 그림이라, 클리어하면 그대로 명부에 오른다.
  const rescueAllyId = options.rescueAllyId && !selectedParty.includes(options.rescueAllyId)
    && UNIT_DEFS[options.rescueAllyId] ? options.rescueAllyId : null;
  const battleParty = rescueAllyId ? [...selectedParty, rescueAllyId] : selectedParty;

  const companions = battleParty.map((unitId, index) => {
    const definition = UNIT_DEFS[unitId];
    const progress = unitProgress[unitId] || { level: 1, xp: 0 };
    const traits = unitTraits(progress);
    // 동료가 낀 장비의 보너스. 지휘관과 같은 규칙으로 계산해서 얹는다.
    const gear = companionBonuses(options.commander || {}, definition.id);
    const scaledDefinition = {
      ...definition,
      maxHp: Math.max(1, Math.round(definition.maxHp * playerHpGrowth * COMPANION_POWER_MULTIPLIER * (1 + gear.maxHpBonus))),
      // 지휘관과 같은 규칙: 장비는 더하고, 퍼센트는 마지막에 곱한다.
      damage: Math.max(1, Math.round(
        (definition.damage * playerDamageGrowth * COMPANION_POWER_MULTIPLIER + gear.damageFlat) * (1 + gear.damageBonus))),
      armor: companionArmor(definition, gear),
      speed: (definition.speed || 10) * (1 + gear.moveSpeedBonus),
      attackMs: Math.max(280, Math.round((definition.attackMs || 1200) / (1 + gear.attackSpeedBonus))),
      criticalChance: Math.max(0, Math.min(1, 0.03 + gear.criticalChance)),
      criticalDamage: 1.5 + gear.criticalDamage,
      statusResistance: Math.max(0, Math.min(0.75, (definition.statusResistance || 0) + gear.statusResistBonus)),
      preScaled: true
    };
    const companion = createCombatant(scaledDefinition, `unit-${definition.id}`, "unit", index, progress, traits);
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

  // 대전사의 전투갑주: 공속·이속을 올린다. 전투 중 장비가 바뀌지 않으므로
  // 매 tick 다시 계산하지 않고 여기서 한 번만 반영한다.
  const tempo = equippedUniqueEffects(options.commander || {}, playerBaseClass.id)
    .find((effect) => effect.type === "battleTempo");
  if (tempo) {
    player.attackMs = Math.max(200, Math.round(player.attackMs / (1 + tempo.attackSpeed)));
    player.speed = player.speed * (1 + tempo.moveSpeed);
  }
  const units = [player, ...companions];
  const enemyCopies = Math.max(1, Math.min(4, Number(options.enemyCopies || 1)));
  const enemyIds = Array.from({ length: enemyCopies }, () => encounter.enemies).flat();
  const enemies = enemyIds.map((defId, index) => createCombatant({ id: defId, ...ENEMY_COMBATANTS[defId] }, `enemy-${index}-${defId}`, "enemy", index));
  const encounterEndurance = encounter.boss || options.forceBoss ? 2.15 : 2.4;
  for (const enemy of enemies) {
    enemy.maxHp = Math.round(enemy.maxHp * encounterEndurance);
    enemy.hp = enemy.maxHp;
  }
  // 파티 방어 지원은 감소율에 직접 더하지 않고 점수로 모아 곡선을 태운다.
  // 예전처럼 더하면 지원 동료 둘만 데려가도 상한에 닿아버렸다.
  const partyArmorPoints = units.reduce((sum, unit) =>
    sum + unit.partyArmor * 100 + (unit.specialPassive?.effect === "partyArmorPoints" ? unit.specialPassive.armorFlat || 0 : 0), 0);
  if (partyArmorPoints > 0) {
    for (const unit of units) {
      const ratio = Math.max(0, Math.min(0.95, unit.armor || 0));
      unit.armor = armorReduction(ARMOR_SOFTCAP * ratio / (1 - ratio) + partyArmorPoints);
    }
  }
  // 고고학자의 유물 해독도 지휘 보정으로 합류한다. battle.commandAura는 전투 시작 시
  // 한 번 집계되므로, 여기 넣지 않으면 매 틱 값을 고쳐도 아무 데도 닿지 않는다.
  const commandAura = Math.min(0.35, units.reduce((sum, unit) =>
    sum + unit.commandAura + (unit.specialPassive?.effect === "partyCommand" ? unit.specialPassive.commandAura || 0 : 0), 0));
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
    hazardAbsorbed: Boolean(options.hazardAbsorbed),
    nextHazardAt: 5200,
    commandAura,
    defense: Boolean(options.defense),
    playerId: player.id,
    playerBaseClassId: playerBaseClass.id,
    playerBasePassive: { ...playerBaseClass.passive },
    playerKitId: playerKit.id,
    // 장착 중인 전설 장비의 고유효과를 전투 시작 시 한 번 풀어둔다.
    // 매 tick 장비를 다시 훑으면 비싸고, 전투 중에는 장비가 바뀌지 않는다.
    legendary: Object.fromEntries(
      equippedUniqueEffects(options.commander || {}, playerKit.baseClassId).map((effect) => [effect.type, effect])
    ),
    // 반지를 둘 끼면 같은 종류가 둘일 수 있어 목록으로 따로 둔다.
    legendaryOnHit: equippedUniqueEffects(options.commander || {}, playerKit.baseClassId)
      .filter((effect) => effect.type === "onHitStatus"),
    legendaryState: { lastPlayerHitAt: 0, lastCleanseAt: -999999 },
    // 구조한 특수 동료가 플레이어에게 남긴 패시브. 명부(roster)에서 매번 다시
    // 읽는다 — 별도 해금 플래그를 두면 구조 경로가 늘어날 때마다 동기화가 어긋난다.
    grantedPassives: Object.values(SPECIAL_UNIT_DEFS)
      .filter((unit) => unit.grantsPlayerPassive && (options.roster || []).includes(unit.id))
      .map((unit) => ({ ...unit.grantsPlayerPassive })),
    grantedState: {},
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
    // 진법(진법 군관)은 동료가 하나도 안 쓰러졌을 때만 선다. 시작 인원을 기억해 둔다.
    rescueAllyId: options.rescueAllyId || null,
    companionCount: companions.length,
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
    // 광역 필드 전투도 시드로 굴린다 — 시드가 없으면 battleRoll이 Math.random으로
    // 떨어져 같은 저장에서도 결과가 달라진다(재현·디버깅 불가).
    rollSeed: options.rollSeed ?? ((options.seed || 1) + 104729),
    ...options,
    regionId,
    bounds,
    fieldMode: true,
    enemyCopies: groupCount,
    fieldStage: options.fieldStage || 1,
    // 마지막 필드에서만 던전 입구가 열린다. 그 전에는 다음 필드로 넘어가는 출구다.
    triggers: options.triggers || [fieldExitTrigger(options.fieldStage || 1, bounds) || {
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
    // 던전 입구뿐 아니라 동굴 주변도 비워야 한다 — 바위로 막히면 못 들어간다.
    if (battle.triggers.some((entry) => Math.hypot(x - entry.x, y - entry.y) < 30 + radius)) continue;
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
  // 필드 보스는 별도의 잠든 무리로 필드 안쪽에 놓는다(docs/EQUIPMENT_DESIGN.md §9).
  // 던전 입구로 직행하면 안 만나고 지나칠 수 있는 위치에 둔다 — 그래야
  // "필드 어딘가에 보스가 산다"가 되고, 찾아가 싸우는 게 선택이 된다.
  const bossPool = region.fieldBossPool || [];
  if (bossPool.length && options.fieldBoss !== false) {
    const pick = bossPool[Math.floor(rng() * bossPool.length) % bossPool.length];
    const encounter = ENCOUNTER_DEFS[pick];
    if (encounter) {
      const bossGroup = groupCount + 1;
      // 던전 입구로 가는 직선 경로에서 벗어난 가장자리 쪽.
      const side = rng() < 0.5 ? -1 : 1;
      const anchorX = bounds.minX + 120 + rng() * Math.max(20, bounds.maxX - bounds.minX - 200);
      const anchorY = centerY + side * ((bounds.maxY - bounds.minY) * 0.32);
      encounter.enemies.forEach((enemyId, index) => {
        const definition = ENEMY_COMBATANTS[enemyId];
        if (!definition) return;
        const unit = createCombatant(definition, `fieldboss-${index}`, "enemy", index);
        const placed = resolveMove(battle, anchorX + (rng() - 0.5) * 18, anchorY + (rng() - 0.5) * 18);
        unit.x = placed.x;
        unit.y = placed.y;
        unit.groupIndex = bossGroup;
        unit.dormant = true;
        unit.fieldBoss = true;
        // 추격을 멈추고 돌아갈 때 1페이즈 상태로 되돌리기 위해 원본 패턴을 남겨둔다.
        unit.basePatterns = [...(definition.patterns || [])];
        battle.enemies.push(unit);
      });
      battle.fieldBossName = encounter.name;
    }
  }

  battle.log.unshift(`${region.name} 필드에 진입했다. 흩어진 무리를 헤치고 ${region.dungeonName} 입구로.`);
  if (battle.fieldBossName) battle.log.unshift(`어딘가에서 ${battle.fieldBossName}의 기척이 느껴진다.`);
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
  for (const enemy of battle.enemies) {
    if (enemy.dormant && wokenGroups.has(enemy.groupIndex)) enemy.dormant = false;
  }
  leashFieldBoss(battle, player);
}

// 필드 보스에서 벗어날 수 있게 한다.
// 필드 보스는 선택 콘텐츠인데 한 번 깨우면 끝까지 쫓아온다면 "지나칠 수 있다"가
// 성립하지 않는다. 멀리 떨어져 일정 시간이 지나면 제자리로 돌아가 다시 잠든다.
// 체력을 되돌리는 건 치고 빠지기로 야금야금 깎는 걸 막기 위해서다.
const FIELD_BOSS_LEASH_RADIUS = 110;
const FIELD_BOSS_LEASH_MS = 2500;

function leashFieldBoss(battle, player) {
  const bosses = battle.enemies.filter((enemy) => enemy.fieldBoss && enemy.hp > 0 && !enemy.dormant);
  if (!bosses.length) { battle.fieldBossLeashSince = null; return; }

  const near = bosses.some((enemy) => distanceBetween(player, enemy) <= FIELD_BOSS_LEASH_RADIUS);
  if (near) { battle.fieldBossLeashSince = null; return; }

  battle.fieldBossLeashSince ||= battle.elapsed;
  if (battle.elapsed - battle.fieldBossLeashSince < FIELD_BOSS_LEASH_MS) return;

  for (const enemy of bosses) {
    enemy.dormant = true;
    enemy.hp = enemy.maxHp;
    enemy.statuses = {};
    enemy.patternReadyAt = {};
    enemy.castingUntil = 0;
    enemy.phase = 1;
    enemy.patterns = [...(enemy.basePatterns || enemy.patterns)];
    enemy.form = null;
  }
  // 보스가 깔아둔 예고도 같이 걷는다 — 보스가 사라졌는데 장판만 터지면 이상하다.
  battle.zones = (battle.zones || []).filter((zone) => !bosses.some((enemy) => enemy.id === zone.ownerId));
  battle.fieldBossLeashSince = null;
  pushBattleLog(battle, `${bosses[0].name}이 추격을 멈추고 자기 자리로 돌아갔다.`);
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
    // 단 필드 보스는 선택 콘텐츠라 막지 않는다. 깨워놓고 상대하지 않기로 했다면
    // 그냥 두고 던전으로 갈 수 있어야 "지나칠 수 있다"가 성립한다.
    if (trigger.requiresClear
      && battle.enemies.some((enemy) => enemy.hp > 0 && !enemy.dormant && !enemy.fieldBoss)) {
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
  // actor.armor는 이미 감쇠 곡선을 거친 피해 감소율이다(classes.js armorReduction).
  // 여기서 상한을 한 번 더 씌워, 부패의 방어 깎기까지 반영한 뒤에도 1에 닿지 않게 한다.
  return Math.max(0, Math.min(ARMOR_MAX_REDUCTION, (actor.armor || 0) - decayShred));
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
  return Boolean(actor.statuses?.stun
    || (actor.frozenUntil || 0) > battle.elapsed
    // 그로기: 무너진 보스는 아무것도 하지 못한다.
    || (actor.groggyUntil || 0) > battle.elapsed);
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
    for (const target of targets) {
      if (effect.statusId) applyCombatStatus(battle, target, effect.statusId, source, effect.statusOptions || {});
      // 보스가 남기는 장판은 상태이상만이 아니라 지속 피해도 준다.
      if (effect.damageMultiplier && source) damageCombatant(source, target, effect.damageMultiplier);
    }
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
    unit.armor = Math.min(ARMOR_MAX_REDUCTION, unit.rageBaseArmor + missing * (passive.armorPerMissing || 0.15));
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

// 동료 스킬을 매 틱 다시 얹는다.
//
// **기준값에서 매번 새로 계산한다.** 누적해서 더하면 틱마다 불어나고, 동료가
// 쓰러졌을 때 걷어내는 것도 따로 짜야 한다. 기준값을 한 번 떠 두고 매 틱
// 거기서 다시 만들면 둘 다 공짜로 해결된다 — 쓰러지면 그 동료가 빠진 채로
// 다시 계산될 뿐이다.
function refreshCompanionSkills(battle) {
  const units = battle.units || [];
  const enemies = battle.enemies || [];
  const alive = units.filter((unit) => unit.hp > 0);
  const player = units.find((unit) => unit.id === battle.playerId);
  const companions = alive.filter((unit) => unit.id !== battle.playerId);

  const acc = {
    partyArmor: 0, partyHeal: 0, partyStatusResist: 0, partyRegen: 0,
    partyDamageMult: 1, partySpeedMult: 1, partyAttackMult: 1,
    markedCrit: 0, playerArmor: 0, playerManaRegen: 0, playerStatusPower: 1,
    enemySpeedMult: 1, enemyAttackMult: 1, enemyArmorBreak: 0
  };

  for (const companion of companions) {
    // 전투원 id는 "unit-snow_guard" 꼴이라 정의 id(defId)로 찾아야 한다.
    const definition = COMPANION_SKILL_DEFS[companion.defId];
    if (!definition) continue;
    const value = companionSkillValue(definition, companion.skillLevel);
    switch (definition.kind) {
      case "partyArmor": acc.partyArmor += value; break;
      case "partyHeal": acc.partyHeal += value; break;
      case "partyStatusResist": acc.partyStatusResist += value; break;
      case "partyRegen": acc.partyRegen += value; break;
      case "playerManaRegen": acc.playerManaRegen += value; break;
      case "playerStatusPower": acc.playerStatusPower *= (1 + value); break;
      case "enemySlow": acc.enemySpeedMult *= (1 - value); break;
      case "enemyAttackSlow": acc.enemyAttackMult *= (1 + value); break;
      case "enemyArmorBreak": acc.enemyArmorBreak += value; break;
      case "markedCrit": acc.markedCrit += value; break;
      // 진법 — 동료가 하나도 안 쓰러졌을 때만 선다.
      case "formationArmor":
        if (companions.length >= (battle.companionCount || companions.length)) acc.partyArmor += value;
        break;
      // 서약 — 플레이어가 위험할 때만.
      case "oathArmor":
        if (player && player.hp / Math.max(1, player.maxHp) <= (definition.threshold || 0.4)) acc.playerArmor += value;
        break;
      // 기맥 순환 — 자기 체력이 낮을수록 크게.
      case "woundedParty": {
        const missing = 1 - companion.hp / Math.max(1, companion.maxHp);
        acc.partyDamageMult *= (1 + value * missing);
        break;
      }
      // 돌격 대형 — 전투 시작 창 안에서만.
      case "openingSpeed":
        if (battle.elapsed <= (definition.windowMs || 8000)) acc.partySpeedMult *= (1 + value);
        break;
      // 호흡 맞추기 — 플레이어가 회피 중일 때만. 공격 주기를 줄인다.
      case "dodgeTempo":
        if ((battle.playerDodgeUntil || 0) > battle.elapsed) acc.partyAttackMult *= (1 - value);
        break;
      default: break;
    }
  }

  battle.companionSkillState = acc;

  for (const unit of units) applySkillDelta(unit, {
    armor: acc.partyArmor + (unit.id === battle.playerId ? acc.playerArmor : 0),
    statusResistance: acc.partyStatusResist,
    hpRegen: acc.partyRegen,
    heal: unit.heal > 0 || (unit.skillApplied?.heal || 0) > 0 ? acc.partyHeal : 0,
    manaRegen: unit.id === battle.playerId ? acc.playerManaRegen : 0
  }, {
    speed: acc.partySpeedMult,
    attackMs: acc.partyAttackMult,
    damage: acc.partyDamageMult,
    statusPotency: unit.id === battle.playerId ? acc.playerStatusPower : 1
  });

  for (const enemy of enemies) {
    applySkillDelta(enemy, { armor: -acc.enemyArmorBreak }, { speed: acc.enemySpeedMult, attackMs: acc.enemyAttackMult });
    enemy.marked = acc.markedCrit > 0 && enemy.id === battle.focusTargetId;
  }
}

// **지난 틱에 얹은 만큼만 정확히 걷어내고 새로 얹는다.**
//
// 기준값을 떠 두고 매 틱 거기서 다시 만드는 방식을 먼저 썼다가 물렸다 —
// 그러면 같은 필드를 만지는 다른 시스템(보스 페이즈, 상태이상, 명령)의 수정을
// 통째로 덮어쓴다. 실제로 적의 attackMs를 직접 바꾸던 테스트가 깨져서 잡았다.
// 필드를 소유하지 않고 내 몫만 더하고 빼면 누구와도 안 부딪힌다.
function applySkillDelta(actor, additive = {}, multiplicative = {}) {
  const applied = actor.skillApplied || (actor.skillApplied = {});
  for (const [key, next] of Object.entries(additive)) {
    const previous = applied[key] || 0;
    if (previous === next) continue;
    actor[key] = (Number(actor[key]) || 0) - previous + next;
    applied[key] = next;
  }
  for (const [key, next] of Object.entries(multiplicative)) {
    const previous = applied[`${key}Mult`] || 1;
    if (previous === next) continue;
    actor[key] = (Number(actor[key]) || 0) / previous * next;
    applied[`${key}Mult`] = next;
  }
  if (actor.armor !== undefined) actor.armor = Math.max(0, Math.min(ARMOR_MAX_REDUCTION, actor.armor));
}

// 급소 표식: 지금 때리려는 대상이 표식 대상이면 치명타율이 오른다.
// 이게 "플레이어가 고른 표적"에 동료가 반응하는 지점이다.
export function markedCritBonus(battle, target) {
  if (!target?.marked) return 0;
  return battle.companionSkillState?.markedCrit || 0;
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
  // 특수 동료 패시브는 기본 직업 패시브와 별개로 하나 더 굴린다 —
  // 특수 동료도 기본 직업을 갖고 있으므로 둘 다 적용되는 게 맞다.
  for (const companion of battle.units) {
    if (!companion.specialPassive) continue;
    applySpecialPassiveEffect(battle, companion, companion.specialPassive);
  }
  applyGrantedPassives(battle, player);
}

// 구조한 특수 동료가 플레이어에게 남긴 패시브. 편성과 무관하게 작동한다 —
// 서부 성기사를 구조했다면 그를 데려가지 않아도 금지된 지식은 플레이어에게 있다.
function applyGrantedPassives(battle, player) {
  if (!player || !battle.grantedPassives?.length) return;
  for (const passive of battle.grantedPassives) {
    if (passive.effect !== "reviveOnce") continue;
    if (player.hp > 0 || battle.grantedState[passive.id]) continue;
    battle.grantedState[passive.id] = true;
    player.hp = Math.max(1, Math.round(player.maxHp * (passive.healRatio || 0.35)));
    player.statuses = {};
    pushBattleLog(battle, `${passive.name}: 죽음을 한 번 되돌렸다.`);
  }
}

// 특수 동료 패시브. 대부분 파티 전체에 얇게 얹는 형태라 매 틱 다시 계산한다 —
// 쓰러지거나 되살아나면 그 즉시 효과가 붙고 떨어져야 하기 때문이다.
function applySpecialPassiveEffect(battle, unit, passive) {
  const state = ensureBasePassiveState(battle, unit.id);

  // 부활은 쓰러진 뒤에 발동하므로 생존 검사보다 먼저 본다.
  if (passive.effect === "reviveOnce") {
    if (unit.hp > 0 || state.revived) return;
    state.revived = true;
    unit.hp = Math.max(1, Math.round(unit.maxHp * (passive.healRatio || 0.35)));
    unit.statuses = {};
    pushBattleLog(battle, `${passive.name}: ${unit.name}이(가) 다시 일어섰다.`);
    return;
  }

  // partyArmorPoints와 partyCommand는 여기서 다루지 않는다. 엔진이 그 둘을
  // 전투 시작 시 한 번만 집계하기 때문에(createAutoBattle의 partyArmorPoints /
  // commandAura), 매 틱 값을 고쳐도 아무 데도 닿지 않는다. 기존 partyArmor·
  // commandAura와 같은 통로로 흘려보내는 게 맞다.
  //
  // 남는 둘은 매 틱 다시 얹어야 한다. 쿨감은 공격이 나갈 때마다 읽히고,
  // 상태이상 위력은 다른 효과가 덮어쓸 수 있어서다.
  const living = battle.units.filter((entry) => entry.hp > 0);

  // 쓰러지면 얹어둔 것을 걷는다. 안 걷으면 죽은 동료의 버프가 전투 내내 남는다.
  if (unit.hp <= 0) {
    for (const ally of living) {
      if (passive.effect === "partyCooldown") ally.passiveCooldownReduction = 0;
      if (passive.effect === "partyStatusPower" && ally.baseStatusPotency !== undefined) {
        ally.statusPotency = ally.baseStatusPotency;
      }
    }
    return;
  }

  for (const ally of living) {
    if (passive.effect === "partyCooldown") {
      ally.passiveCooldownReduction = Math.max(ally.passiveCooldownReduction || 0, passive.cooldownReduction || 0);
    } else if (passive.effect === "partyStatusPower") {
      ally.baseStatusPotency ??= ally.statusPotency || 1;
      ally.statusPotency = ally.baseStatusPotency + (passive.statusPotency || 0);
    }
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
  refreshCompanionSkills(battle);
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

    // 지역 환경은 피해만이 아니라 **그 지역이 카운터하는 직업을 정확히 때리는**
    // 효과를 함께 건다(몬스터 컨셉.txt 지역별 카운터).
    // 대응 수치(hazardMitigation)가 높으면 아예 걸리지 않는다.
    const counter = battle.hazard.counterEffect;
    const resistThreshold = absorbedResistThreshold(counter?.resistedAt, battle.hazardAbsorbed);
    if (counter && (battle.hazardMitigation || 0) < resistThreshold) {
      if (counter.type === "manaDrain") {
        // 북부 — 아크메이지 카운터. 마나가 많고 회복이 빠른 직업일수록 크게 잃는다.
        for (const unit of living(battle.units)) {
          if (!unit.maxMana) continue;
          unit.mana = Math.max(0, unit.mana - Math.max(1, Math.round(unit.maxMana * counter.ratio)));
        }
        pushBattleLog(battle, `${battle.hazard.name}: 마력 순환이 굳어 마나가 빠져나간다`);
      } else if (counter.type === "curse") {
        accumulateCurse(battle, counter);
      }
    }

    battle.nextHazardAt += 5200;
  }
  wakeNearbyFieldGroups(battle);
  checkFieldTriggers(battle);
  advanceBossZones(battle);
  decayStagger(battle, step);
  tickLegendaryEffects(battle, step);
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

    // 자동 동료도 예고 장판을 피한다. 안 피하면 보스 광역기가 파티 전원에게
    // 무조건 적중해서, 플레이어가 아무리 잘 피해도 동료가 먼저 쓰러진다.
    if (actor.team === "unit" && dodgeDangerZone(battle, actor, step)) {
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
      updateBossPhase(battle, actor);
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
    // 오니 파괴반지: 플레이어가 때릴 때 적 방어력을 깎는다.
    // 고룡 수호반지: 플레이어가 위급할 때 방어력이 올라간다.
    let targetArmor = effectiveArmor(target);
    if (actor.id === battle.playerId && battle.legendary?.armorPierce) {
      targetArmor = Math.max(0, targetArmor - battle.legendary.armorPierce.amount);
    }
    // 오니 파괴반지: 같은 대상을 연속으로 때릴수록 관통이 쌓인다.
    // 대상을 바꾸거나 손을 놓으면 초기화되므로 한 놈을 물고 늘어지는 운용을 보상한다.
    const pierceStack = battle.legendary?.armorPierceStack;
    if (actor.id === battle.playerId && pierceStack) {
      const stackState = battle.legendaryState.pierce;
      const fresh = stackState
        && stackState.targetId === target.id
        && battle.elapsed - stackState.lastAt <= pierceStack.resetMs;
      const stacks = fresh ? Math.min(pierceStack.maxStacks, stackState.stacks) : 0;
      targetArmor = Math.max(0, targetArmor - stacks * pierceStack.perStack);
      battle.legendaryState.pierce = {
        targetId: target.id,
        stacks: fresh ? Math.min(pierceStack.maxStacks, stackState.stacks + 1) : 1,
        lastAt: battle.elapsed
      };
    }
    if (target.id === battle.playerId && battle.legendary?.lastStand
      && target.hp / target.maxHp <= battle.legendary.lastStand.threshold) {
      // 방어 점수를 더한 뒤 다시 감쇠 곡선을 태운다. 감소율에 직접 더하면
      // 이미 방어가 높은 캐릭터에게만 과하게 붙어 상한을 밀어버린다.
      const basePoints = ARMOR_SOFTCAP * targetArmor / Math.max(0.0001, 1 - targetArmor);
      targetArmor = armorReduction(basePoints + battle.legendary.lastStand.armorFlat);
    }
    const damageThrough = 1 - targetArmor;
    const activeBuffs = actor.team === "unit"
      ? [battle.command.chargeUntil, battle.command.guardUntil, battle.command.focusUntil].filter((until) => until > battle.elapsed).length
      : 0;
    const lowHealthBonus = actor.hp / actor.maxHp <= 0.5 ? actor.finisher : 1;
    const carryBonus = 1 + activeBuffs * actor.buffCarry;
    const chargeDamage = chargeBoost ? 1.35 + actor.chargeDamage : 1;
    const rawDamage = actor.damage * (actor.passiveDamageMultiplier || 1) * chargeDamage * lowHealthBonus * carryBonus
      * rollCritical(battle, actor, target);
    // Math.max(1, ...) — 방어가 아무리 높아도 피해 0은 나오지 않는다.
    const fullDamage = Math.max(1, Math.round(rawDamage * guardReduction * damageThrough));
    const isPlayerTarget = target.id === battle.playerId;
    const dodgeChance = (target.team === "unit" && target.basePassive?.effect === "dodgeChance" ? target.basePassive.chance || 0 : 0)
      + (isPlayerTarget ? Math.min(0.3, (actor.maehwaMarks || 0) * 0.05) : 0)
      // 환영 경갑: 피격 자체를 확률로 무효화한다(docs/EQUIPMENT_DESIGN.md §10).
      + (isPlayerTarget ? (battle.legendary?.phantomDodge?.chance || 0) : 0);
    const dodged = dodgeChance > 0 && battleRoll(battle) < dodgeChance;
    // 마탑 설계자의 마력 회로 같은 파티 쿨감이 여기서 실제로 공격 주기를 줄인다.
    actor.cooldown = actor.attackMs * (1 - Math.min(0.35, actor.passiveCooldownReduction || 0));
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

      // ── 전설 고유효과 ── (docs/EQUIPMENT_DESIGN.md §10·§11)
      if (isPlayerTarget) {
        // 고룡의 성벽: 중간급 피해만 바닥값으로 눌러준다. 상한을 넘는 대형 기믹은
        // 그대로 맞으므로 "잡공격은 무시하되 큰 건 피해야 하는" 갑주가 된다.
        const band = battle.legendary?.damageBand;
        if (band) {
          const floor = target.maxHp * band.floorRatio;
          const cap = target.maxHp * band.capRatio;
          if (damage > floor && damage <= cap) damage = floor;
        }
        // 마도사의 장막: 피해 일부를 체력 대신 마나로 치른다. 마나가 마르면 그대로 맞는다.
        const veil = battle.legendary?.manaShieldGear;
        if (veil && target.mana > 0) {
          const payable = Math.min(damage * veil.ratio, target.mana / veil.manaPerDamage);
          if (payable > 0) {
            target.mana = Math.max(0, target.mana - payable * veil.manaPerDamage);
            damage -= payable;
          }
        }
        // 구미호의 외투: 일부를 지금 받지 않고 지속 피해로 미룬다.
        // 총량은 같지만 한 방에 죽는 일이 없어진다.
        const spread = battle.legendary?.damageSpread;
        if (spread && damage > 0) {
          const deferred = damage * spread.ratio;
          damage -= deferred;
          battle.legendaryState.spread ||= [];
          battle.legendaryState.spread.push({
            total: deferred, remaining: deferred, durationMs: spread.durationMs
          });
        }
        damage = Math.max(0, Math.round(damage));
        battle.legendaryState.lastPlayerHitAt = battle.elapsed;
      }
      if (actor.id === battle.playerId) {
        // 거미독 반지: 독에 걸린 적에게만 강해지고, 회복 감소도 함께 건다.
        // 독을 거는 수단과 함께 써야 값을 하는 조건부 반지다.
        const execute = battle.legendary?.statusExecute;
        if (execute && target.statuses?.[execute.statusId]) {
          damage = Math.round(damage * (1 + execute.bonus));
          if (execute.applyDecay) applyCombatStatus(battle, target, "decay", actor);
        }
      }

      // 그로기 중인 보스는 더 아프게 맞고, 맞은 만큼 게이지가 찬다.
      damage = Math.round(damage * groggyDamageMultiplier(battle, target));
      target.hp = Math.max(0, target.hp - damage);
      target.lastStaggerAt = battle.elapsed;
      addStagger(battle, target, damage);

      // 반지의 적중 시 상태이상 부여(먹물·거미독). 반지를 둘 끼면 각각 굴린다.
      if (actor.id === battle.playerId && target.hp > 0) {
        for (const effect of battle.legendaryOnHit || []) {
          if (battleRoll(battle) < effect.chance) applyCombatStatus(battle, target, effect.statusId, actor);
        }
      }

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
  refreshCompanionSkills(battle);
  // 필드 보스는 **선택 콘텐츠**다(docs/EQUIPMENT_DESIGN.md §9 — 지나쳐서 던전으로
  // 직행할 수 있는 위치에 놓는다). 그래서 "필드 정리" 판정에서 제외한다.
  // 포함시키면 보스를 반드시 잡아야 던전에 갈 수 있게 되어 배치 의도와 어긋난다.
  const blockingEnemies = battle.fieldMode
    ? living(battle.enemies).filter((enemy) => !enemy.fieldBoss)
    : living(battle.enemies);
  if (!blockingEnemies.length) {
    // 필드 전투는 적을 다 잡아도 끝나지 않는다 — 정리한 뒤 던전 입구까지
    // 걸어가야 하므로 전투를 계속 active로 두고 "정리됨" 표시만 남긴다.
    if (battle.fieldMode) {
      if (!battle.fieldCleared) {
        battle.fieldCleared = true;
        const bossAlive = living(battle.enemies).some((enemy) => enemy.fieldBoss);
        pushBattleLog(battle, bossAlive
          ? "필드의 무리를 정리했다. 던전으로 갈 수도, 남은 보스를 노릴 수도 있다."
          : "필드의 무리를 모두 정리했다. 던전 입구로 이동할 수 있다.");
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
  summon.armor = Math.min(ARMOR_MAX_REDUCTION, (summon.armor || 0) + (bossSummon ? 0.18 : 0.12));
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
    player.armor = Math.min(ARMOR_MAX_REDUCTION, player.necroBaseArmor + stacks * 0.03);
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

// 주술 공명반지: 스킬을 쓰면 일정 확률로 마나를 채워준다.
// 이 엔진의 플레이어 스킬은 마나를 소모하지 않으므로 "환급"이 아니라 최대 마나
// 기준으로 채운다. 마나는 마도사의 장막이 피해를 대신 치르는 자원이라,
// 스킬을 굴릴수록 버틸 여력이 생기는 구조가 된다.
function refundSkillMana(battle, player) {
  const refund = battle.legendary?.manaRefund;
  if (!refund || !player?.maxMana) return;
  const state = battle.legendaryState;
  if (battle.elapsed - (state.lastRefundAt || -999999) < refund.cooldownMs) return;
  if (battleRoll(battle) >= refund.chance) return;
  const amount = Math.round(player.maxMana * refund.ratio);
  if (amount <= 0) return;
  player.mana = Math.min(player.maxMana, player.mana + amount);
  state.lastRefundAt = battle.elapsed;
  pushBattleLog(battle, `주술 공명: 마나 ${amount} 환급`);
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
    // 플레이어의 기본 공격은 AI 유닛과 다른 경로라, 전설 고유효과도 여기서 따로
    // 적용해야 한다(여기 빠뜨리면 동료 공격에만 붙어 사실상 동작하지 않는다).
    const critical = rollCritical(battle, player, target);
    const damage = Math.max(1, Math.round(
      player.damage * (player.passiveDamageMultiplier || 1) * (stealthy ? 1.8 : 1)
      * critical
      * legendaryOutgoingMultiplier(battle, target)
      * (1 - legendaryPiercedArmor(battle, target))
      * groggyDamageMultiplier(battle, target)
    ));
    target.hp = Math.max(0, target.hp - damage);
    target.lastHit = 260;
    target.lastStaggerAt = battle.elapsed;
    addStagger(battle, target, damage);
    if (stealthy) delete player.positiveEffects.stealth;
    applyLegendaryOnHit(battle, player, target);
    applyChargedBurst(battle, player, target);
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
    refundSkillMana(battle, player);
    refreshBaseClassPassive(battle);
    return true;
  }
  if (action === "ultimate") {
    const ultimate = playerUltimateDefinition(battle.playerKitId);
    if (!ultimate || !resolvePlayerSkill(battle, player, ultimate)) return false;
    battle.playerReadyAt.ultimate = battle.elapsed + ultimate.cooldownMs * (player.cooldownMultiplier || 1);
    refundSkillMana(battle, player);
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

  // 쓰러뜨린 보스를 기억에 남긴다. 영지의 재현 던전은 **직접 잡아본 보스만**
  // 소환할 수 있다 — 기억을 마법으로 재현하는 것이므로 겪지 않은 상대는 그릴 수 없다.
  run.rememberedBosses ||= [];
  for (const enemy of battle.enemies) {
    if (enemy.hp > 0 || !enemy.boss) continue;
    const key = enemy.defId || enemy.name;
    if (!run.rememberedBosses.includes(key)) run.rememberedBosses.push(key);
  }

  // 필드 보스 부산물. 전설 장비 제작의 핵심 재료다(docs/EQUIPMENT_DESIGN.md §5).
  // 완제품을 확률로 떨구는 게 아니라 부산물을 확정 지급하고 고정 조합표로 가공하는
  // 구조라, 여기서는 드랍 굴림을 하지 않는다.
  for (const enemy of battle.enemies) {
    if (enemy.hp > 0 || !enemy.byproducts) continue;
    for (const [materialId, amount] of Object.entries(enemy.byproducts)) {
      run.cargo.materials[materialId] = (run.cargo.materials[materialId] || 0) + amount;
    }
    pushBattleLog(battle, `${enemy.name}에게서 부산물을 회수했다.`);
  }

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
