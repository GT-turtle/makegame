export const BASIC_DISCIPLINE_DEFS = {
  holy: { id: "holy", name: "신성", glyph: "✧", description: "보호·회복·심판을 다루는 계통" },
  spirit: { id: "spirit", name: "정령술", glyph: "♧", description: "정령 소환과 계약, 속성 변화를 함께 다루는 계통" },
  heavy: { id: "heavy", name: "중병기", glyph: "▰", description: "중검·중갑·경직과 전선 장악을 다루는 계통" },
  sword: { id: "sword", name: "검술", glyph: "刃", description: "연계·반격·발도 계통" },
  magic: { id: "magic", name: "마법", glyph: "✦", description: "마나와 룬으로 직접 주문을 다루는 계통" },
  archery: { id: "archery", name: "궁술", glyph: "➹", description: "은신과 원거리 사격을 다루는 계통" }
};

export const PLAYER_BASE_CLASS_DEFS = {
  crusader: {
    id: "crusader",
    name: "크루세이더",
    glyph: "♜",
    disciplineId: "holy",
    // 직업별 출신 지역 (직업 컨셉.txt "직업별 출신 지역" — 서사/배경 설정, 게임플레이상 직업·출신 조합은 자유)
    originRegionId: "west",
    statProfile: {
      base: { strength: 10, agility: 5, intelligence: 7, defense: 12, divineAffinity: 14, natureAffinity: 5, hpRegen: 0.28, maxMana: 72, manaRegen: 1.1, statusResistance: 0.3 },
      growth: { strength: 1.2, agility: 0.45, intelligence: 0.65, defense: 1.05, divineAffinity: 1.25, natureAffinity: 0.45, hpRegen: 0.025, maxMana: 3.2, manaRegen: 0.035 }
    },
    passive: {
      id: "guardianCycle",
      name: "신의 사랑을 받는 몸",
      glyph: "✧",
      effect: "hitCycleHeal",
      hitsRequired: 5,
      healRatio: 0.08,
      description: "적의 공격에 5회 피격될 때마다 최대 체력의 8%를 회복한다. 어떤 전승을 익혀도 유지된다."
    },
    skills: [
      { id: "holyBlessing", name: "축복의 손길", glyph: "✚", cooldownMs: 5400, effect: "holyBlessing", description: "가장 다친 아군 하나를 회복한다." },
      { id: "holyWard", name: "수호 결계", glyph: "❖", cooldownMs: 7600, effect: "holyWard", description: "아군 전체의 방어를 잠시 높인다." },
      { id: "holyLance", name: "심판의 창", glyph: "▲", cooldownMs: 4800, effect: "holyLance", description: "단일 적을 꿰뚫고 짧게 기절시킨다." },
      { id: "holyBulwark", name: "수호자의 외침", glyph: "☗", cooldownMs: 8600, effect: "holyBulwark", description: "주변 적의 시선을 자신에게 모으고 스스로의 방어력을 높인다." }
    ],
    ultimate: { id: "holyJudgment", name: "천벌", glyph: "✦", cooldownMs: 12000, effect: "holyJudgment", description: "목표 주변에 강력한 신성 파도를 일으킨다." }
  },
  necromancer: {
    id: "necromancer",
    name: "네크로맨서",
    glyph: "☠",
    disciplineId: "spirit",
    originRegionId: "west",
    statProfile: {
      base: { strength: 6, agility: 6, intelligence: 14, defense: 7, divineAffinity: 0, natureAffinity: 12, hpRegen: 0.16, maxMana: 96, manaRegen: 1.6 },
      growth: { strength: 0.55, agility: 0.6, intelligence: 1.35, defense: 0.7, divineAffinity: 0, natureAffinity: 1.05, hpRegen: 0.015, maxMana: 4.6, manaRegen: 0.055 }
    },
    passive: {
      id: "soulHarvest",
      name: "내 아군이 너보단 잘 싸운다",
      glyph: "◉",
      effect: "soulHarvest",
      maxStacks: 3,
      summonDamagePerStack: 0.08,
      durationMs: 12000,
      description: "적이 쓰러질 때 영혼을 최대 3개 수확한다. 영혼마다 소환수 공격력이 8% 증가하며 마지막 처치 12초 뒤 사라진다."
    },
    skills: [
      { id: "spiritDecay", name: "부패", glyph: "☣", cooldownMs: 6200, effect: "spiritDecay", description: "주변 적 전체에게 부패를 부여해 지속 피해를 입힌다." },
      { id: "spiritBolt", name: "뼈 화살", glyph: "☄", cooldownMs: 4200, effect: "spiritBolt", description: "단일 적에게 뼈 화살을 날린다." },
      { id: "spiritRaise", name: "강령", glyph: "⚰", cooldownMs: 9000, effect: "spiritRaise", description: "이번 전투에서 쓰러진 적 최대 3마리를 자신의 능력치만큼 버프해 아군으로 되살린다. 전투당 1회만 쓸 수 있다." },
      { id: "spiritWard", name: "뼈 갑옷", glyph: "◈", cooldownMs: 7000, effect: "spiritWard", description: "자신의 방어력을 높이고 소량 회복한다." }
    ],
    ultimate: { id: "spiritApex", name: "일어나라", glyph: "☠", cooldownMs: 15000, effect: "storedApex", description: "저장해 둔 우두머리의 사념을 소환한다." }
  },
  barbarian: {
    id: "barbarian",
    name: "바바리안",
    glyph: "Ϟ",
    disciplineId: "heavy",
    originRegionId: "north",
    statProfile: {
      base: { strength: 16, agility: 7, intelligence: 2, defense: 9, divineAffinity: 0, natureAffinity: 0, hpRegen: 0.35, maxMana: 20, manaRegen: 0.3 },
      growth: { strength: 1.5, agility: 0.5, intelligence: 0.2, defense: 0.8, hpRegen: 0.03, maxMana: 1, manaRegen: 0.02 }
    },
    passive: {
      id: "berserkVigor",
      name: "나를 죽이지 못한 고통은 성장하게 한다",
      glyph: "Ϟ",
      effect: "rageScaling",
      damagePerMissing: 0.6,
      armorPerMissing: 0.15,
      hpRegenPerMissing: 1.5,
      description: "체력이 줄어들수록 공격력·방어력·체력 회복 속도가 함께 오른다."
    },
    skills: [
      { id: "battleRoar", name: "광란", glyph: "҂", cooldownMs: 7200, effect: "battleRoar", description: "짧은 시간 공격 속도와 이동 속도를 높인다. 체력이 낮을수록 효과가 커진다." },
      { id: "earthSlam", name: "회전찍기", glyph: "☗", cooldownMs: 6800, effect: "earthSlam", description: "자신 주변을 강타해 피해를 입힌다." },
      { id: "recklessCharge", name: "돌진", glyph: "➶", cooldownMs: 5600, effect: "recklessCharge", description: "목표에게 달려들어 피해를 입힌다." },
      { id: "cleave", name: "뚝배기", glyph: "⚔", cooldownMs: 4400, effect: "cleave", description: "단일 적을 강하게 찍는다." }
    ],
    ultimate: { id: "berserkerRage", name: "광폭화", glyph: "Ϟ", cooldownMs: 14000, effect: "berserkerRage", description: "일정 시간 격노 효과가 크게 늘고 공격에 흡혈이 붙는다." }
  },
  tracker: {
    id: "tracker",
    name: "추적자",
    glyph: "➹",
    disciplineId: "archery",
    originRegionId: "south",
    statProfile: {
      base: { strength: 6, agility: 16, intelligence: 6, defense: 5, divineAffinity: 0, natureAffinity: 6, hpRegen: 0.14, maxMana: 30, manaRegen: 0.8 },
      growth: { strength: 0.4, agility: 1.4, intelligence: 0.5, defense: 0.35, natureAffinity: 0.5, hpRegen: 0.01, maxMana: 1.2, manaRegen: 0.03 }
    },
    passive: {
      id: "huntersShadow",
      name: "찾아봐라",
      glyph: "➹",
      effect: "stealthWhenIdle",
      idleMs: 3000,
      description: "적과 3초 이상 접촉이 없으면 은신한다. 은신 중 공격은 치명적이다."
    },
    skills: [
      { id: "aimedShot", name: "헤드샷", glyph: "➶", cooldownMs: 3800, effect: "aimedShot", description: "단일 적을 원거리에서 저격한다." },
      { id: "scatterShot", name: "폭발화살", glyph: "❋", cooldownMs: 6400, effect: "scatterShot", description: "부채꼴 범위의 적에게 원거리 피해를 입힌다." },
      { id: "shadowStrike", name: "후퇴", glyph: "☾", cooldownMs: 5200, effect: "shadowStrike", description: "근처 적을 공격하고 반대 방향으로 물러난다." },
      { id: "vanish", name: "은신", glyph: "✧", cooldownMs: 9000, effect: "vanish", description: "즉시 은신 상태가 되어 다음 공격을 강화한다." }
    ],
    ultimate: { id: "arrowStorm", name: "화살의 비", glyph: "➹", cooldownMs: 13000, effect: "arrowStorm", description: "넓은 범위에 화살을 퍼부어 큰 피해를 입힌다." }
  },
  maehwa: {
    id: "maehwa",
    name: "매화",
    glyph: "❀",
    disciplineId: "sword",
    originRegionId: "east",
    statProfile: {
      base: { strength: 9, agility: 15, intelligence: 5, defense: 6, divineAffinity: 0, natureAffinity: 3, hpRegen: 0.18, maxMana: 26, manaRegen: 0.6 },
      growth: { strength: 0.7, agility: 1.3, intelligence: 0.4, defense: 0.4, hpRegen: 0.015, maxMana: 1, manaRegen: 0.025 }
    },
    passive: {
      id: "windStep",
      name: "피했쥬",
      glyph: "❀",
      effect: "dodgeChance",
      chance: 0.18,
      description: "일정 확률로 상대의 공격을 완전히 회피한다."
    },
    skills: [
      { id: "swiftStrike", name: "발도", glyph: "⚔", cooldownMs: 5200, effect: "swiftStrike", description: "목표에게 순식간에 접근해 벤다." },
      { id: "whirlwindSlash", name: "선풍참", glyph: "❋", cooldownMs: 6600, effect: "whirlwindSlash", description: "자신 주변을 회전하며 벤다." },
      { id: "phantomCut", name: "일섬", glyph: "☾", cooldownMs: 6000, effect: "phantomCut", description: "목표의 이로운 효과를 지우고 크게 벤다." },
      { id: "fleetStep", name: "개화", glyph: "➶", cooldownMs: 8000, effect: "fleetStep", description: "짧은 시간 공격 속도가 크게 오르고, 공격할 때마다 상대에게 방어력 감소 표식이 쌓인다." }
    ],
    ultimate: { id: "plumBlossomDance", name: "낙화", glyph: "❀", cooldownMs: 12500, effect: "plumBlossomDance", description: "목표에게 쌓인 표식을 모두 터뜨려 순간적으로 크게 벤다." }
  },
  archmage: {
    id: "archmage",
    name: "아크메이지",
    glyph: "✦",
    disciplineId: "magic",
    originRegionId: "north",
    statProfile: {
      base: { strength: 3, agility: 6, intelligence: 17, defense: 4, divineAffinity: 0, natureAffinity: 4, hpRegen: 0.12, maxMana: 130, manaRegen: 2.0 },
      growth: { strength: 0.2, agility: 0.4, intelligence: 1.5, defense: 0.3, hpRegen: 0.008, maxMana: 6, manaRegen: 0.08 }
    },
    passive: {
      id: "manaCirculation",
      name: "마나 친화",
      glyph: "✦",
      effect: "manaFocus",
      damagePerMana: 0.4,
      description: "마나 비율에 비례해 공격력이 오른다 (마나가 가득할수록 강함)."
    },
    skills: [
      { id: "fireBolt", name: "불 화살", glyph: "♨", cooldownMs: 4400, effect: "fireBolt", description: "단일 적에게 화염 피해를 입히고 화상을 남긴다." },
      { id: "frostNova", name: "얼음 비", glyph: "❄", cooldownMs: 6800, effect: "frostNova", description: "주변 적에게 냉기 피해를 입히고 빙결시킨다." },
      { id: "gravityWell", name: "중력장", glyph: "◉", cooldownMs: 7400, effect: "gravityWell", description: "주변 적을 한 점으로 끌어당기며 피해를 입힌다." },
      { id: "lightningRicochet", name: "번개 도탄", glyph: "↯", cooldownMs: 5000, effect: "lightningRicochet", description: "가까운 적들을 번개로 연달아 튕기며 피해를 입히고 감전시킨다." }
    ],
    ultimate: { id: "manaBurst", name: "마력 폭발", glyph: "✦", cooldownMs: 13500, effect: "manaBurst", description: "넓은 범위에 무속성 마력을 터뜨려 순수하게 큰 피해를 입힌다." }
  }
};

export const PLAYER_KIT_DEFS = {
  crusader: {
    id: "crusader",
    name: "크루세이더",
    shortName: "크루세이더",
    glyph: "♜",
    color: "#9fb08a",
    baseClassId: "crusader",
    primaryId: "holy",
    inheritedId: null,
    description: "아직 보조 계통을 배우지 않은 순수 신성 크루세이더.",
    passive: { id: "none", name: "없음", glyph: "—", description: "전승을 익히면 추가 패시브를 얻는다." },
    stats: { maxHp: 52, damage: 7, range: 11, speed: 16, attackMs: 700, armor: 0.18, color: "#9fb08a", glyph: "♜" },
    defaultLoadout: ["holyBlessing", "holyWard", "holyLance"],
    skills: PLAYER_BASE_CLASS_DEFS.crusader.skills,
    ultimate: PLAYER_BASE_CLASS_DEFS.crusader.ultimate
  },
  necromancer: {
    id: "necromancer",
    name: "네크로맨서",
    shortName: "네크로맨서",
    glyph: "☠",
    color: "#8f8ea3",
    baseClassId: "necromancer",
    primaryId: "spirit",
    inheritedId: null,
    description: "아직 보조 계통을 배우지 않은 순수 정령술 네크로맨서.",
    passive: { id: "none", name: "없음", glyph: "—", description: "전승을 익히면 추가 패시브를 얻는다." },
    stats: { maxHp: 42, damage: 8, range: 12, speed: 15, attackMs: 760, armor: 0.11, color: "#8f8ea3", glyph: "☠" },
    defaultLoadout: ["spiritDecay", "spiritRaise", "spiritWard"],
    skills: PLAYER_BASE_CLASS_DEFS.necromancer.skills,
    ultimate: PLAYER_BASE_CLASS_DEFS.necromancer.ultimate
  },
  barbarian: {
    id: "barbarian",
    name: "바바리안",
    shortName: "바바리안",
    glyph: "Ϟ",
    color: "#c07a4f",
    baseClassId: "barbarian",
    primaryId: "heavy",
    inheritedId: null,
    description: "아직 보조 계통을 배우지 않은 순수 도끼 바바리안.",
    passive: { id: "none", name: "없음", glyph: "—", description: "전승을 익히면 추가 패시브를 얻는다." },
    stats: { maxHp: 64, damage: 10, range: 7, speed: 15, attackMs: 780, armor: 0.2, color: "#c07a4f", glyph: "Ϟ" },
    defaultLoadout: ["battleRoar", "earthSlam", "cleave"],
    skills: PLAYER_BASE_CLASS_DEFS.barbarian.skills,
    ultimate: PLAYER_BASE_CLASS_DEFS.barbarian.ultimate
  },
  tracker: {
    id: "tracker",
    name: "추적자",
    shortName: "추적자",
    glyph: "➹",
    color: "#7fae72",
    baseClassId: "tracker",
    primaryId: "archery",
    inheritedId: null,
    description: "아직 보조 계통을 배우지 않은 순수 추적자.",
    passive: { id: "none", name: "없음", glyph: "—", description: "전승을 익히면 추가 패시브를 얻는다." },
    stats: { maxHp: 34, damage: 9, range: 22, speed: 14, attackMs: 820, armor: 0.05, color: "#7fae72", glyph: "➹" },
    defaultLoadout: ["aimedShot", "scatterShot", "shadowStrike"],
    skills: PLAYER_BASE_CLASS_DEFS.tracker.skills,
    ultimate: PLAYER_BASE_CLASS_DEFS.tracker.ultimate
  },
  maehwa: {
    id: "maehwa",
    name: "매화",
    shortName: "매화",
    glyph: "❀",
    color: "#c56a92",
    baseClassId: "maehwa",
    primaryId: "sword",
    inheritedId: null,
    description: "아직 보조 계통을 배우지 않은 순수 매화 검사.",
    passive: { id: "none", name: "없음", glyph: "—", description: "전승을 익히면 추가 패시브를 얻는다." },
    stats: { maxHp: 40, damage: 9, range: 8, speed: 17, attackMs: 600, armor: 0.1, color: "#c56a92", glyph: "❀" },
    defaultLoadout: ["swiftStrike", "whirlwindSlash", "phantomCut"],
    skills: PLAYER_BASE_CLASS_DEFS.maehwa.skills,
    ultimate: PLAYER_BASE_CLASS_DEFS.maehwa.ultimate
  },
  spiritBarbarian: {
    id: "spiritBarbarian",
    name: "정령을 익힌 바바리안",
    shortName: "정령바바",
    glyph: "Ж",
    color: "#8a9f5a",
    baseClassId: "barbarian",
    primaryId: "heavy",
    inheritedId: "spirit",
    description: "야만적 힘에 정령의 야성을 더해 늑대인간으로 변신하는 전사.",
    passive: {
      id: "feralSpirit",
      name: "나를 죽이지 못한 고통은 분노하게 한다",
      glyph: "Ж",
      description: "공격할 때마다 상대에게 출혈을 남긴다."
    },
    stats: { maxHp: 70, damage: 11, range: 7, speed: 16, attackMs: 750, armor: 0.22, color: "#8a9f5a", glyph: "Ж" },
    defaultLoadout: ["battleRoar", "earthSlam", "recklessCharge"],
    skills: [
      { id: "battleRoar", name: "피가 필요해", glyph: "҂", cooldownMs: 7200, effect: "battleRoar", description: "짧은 시간 공격 속도와 이동 속도를 높인다. 체력이 낮을수록, 그리고 다른 전승보다 더 크게 오른다." },
      { id: "earthSlam", name: "할퀴기", glyph: "☗", cooldownMs: 6800, effect: "earthSlam", description: "자신 주변을 강타해 피해를 입히고 출혈을 남긴다." },
      { id: "recklessCharge", name: "달리기", glyph: "➶", cooldownMs: 5600, effect: "recklessCharge", description: "목표에게 더 멀리, 더 빠르게 달려들어 피해를 입힌다." },
      { id: "cleave", name: "물어뜯기", glyph: "⚔", cooldownMs: 4400, effect: "cleave", description: "단일 적을 크게 웃도는 위력으로 문다." }
    ],
    ultimate: { id: "berserkerRage", name: "변신", glyph: "Ж", cooldownMs: 14000, effect: "berserkerRage", description: "일정 시간 격노 효과가 크게 늘고 공격에 흡혈이 붙으며, 늑대인간으로 변신한다. 적을 죽일수록 변신이 길어진다." }
  },
  archmage: {
    id: "archmage",
    name: "아크메이지",
    shortName: "아크메이지",
    glyph: "✦",
    color: "#6a7fc5",
    baseClassId: "archmage",
    primaryId: "magic",
    inheritedId: null,
    description: "아직 보조 계통을 배우지 않은 순수 아크메이지.",
    passive: { id: "none", name: "없음", glyph: "—", description: "전승을 익히면 추가 패시브를 얻는다." },
    stats: { maxHp: 30, damage: 10, range: 24, speed: 13, attackMs: 900, armor: 0.03, color: "#6a7fc5", glyph: "✦" },
    defaultLoadout: ["fireBolt", "frostNova", "gravityWell"],
    skills: PLAYER_BASE_CLASS_DEFS.archmage.skills,
    ultimate: PLAYER_BASE_CLASS_DEFS.archmage.ultimate
  },
  spiritCrusader: {
    id: "spiritCrusader",
    name: "정령을 익힌 크루세이더",
    shortName: "정령 크루세이더",
    glyph: "♜",
    color: "#83b89a",
    baseClassId: "crusader",
    primaryId: "holy",
    inheritedId: "spirit",
    description: "성스러운 방벽에 정령을 깃들여 방어와 공격을 동시에 변화시킨다.",
    passive: {
      id: "spiritBastion",
      name: "정령의 사랑을 받는 몸",
      glyph: "♧",
      description: "피격당할 때 확률적으로 상대에게 화상 또는 빙결을 되돌린다."
    },
    stats: { maxHp: 58, damage: 8, range: 12, speed: 17, attackMs: 650, armor: 0.22, color: "#83b89a", glyph: "♜" },
    defaultLoadout: ["spiritMending", "winterAegis", "thunderLance"],
    skills: [
      { id: "spiritMending", name: "정령의 가호", glyph: "✚", cooldownMs: 6200, effect: "spiritMending", description: "가장 다친 아군을 크게 회복하고 지속 회복을 부여하며 해로운 효과 하나를 해제한다." },
      { id: "winterAegis", name: "정령의 축복", glyph: "❄", cooldownMs: 8200, effect: "winterAegis", description: "아군 전체의 방어를 높이고 공격한 적에게 빙결 중첩을 되돌린다." },
      { id: "thunderLance", name: "뇌정의 창", glyph: "ϟ", cooldownMs: 5400, effect: "thunderLance", description: "단일 적을 꿰뚫고 짧게 기절시킨다." },
      { id: "spiritBulwark", name: "정령의 외침", glyph: "☗", cooldownMs: 8600, effect: "spiritBulwark", description: "주변 적의 시선을 자신에게 모으고 스스로의 방어력을 높인다." }
    ],
    ultimate: { id: "spiritConflagration", name: "정령의 겁화", glyph: "♨", cooldownMs: 14000, effect: "spiritConflagration", description: "주변을 크게 폭발시킨 뒤 화상을 계속 갱신하는 불 장판을 남긴다." }
  },
  heavyNecromancer: {
    id: "heavyNecromancer",
    name: "중병기를 익힌 네크로맨서",
    shortName: "중병기 네크로맨서",
    glyph: "☠",
    color: "#9d89b5",
    baseClassId: "necromancer",
    primaryId: "spirit",
    inheritedId: "heavy",
    description: "전장의 시체와 봉인 우두머리를 종별 중병기로 무장시켜 전선을 다시 구성한다.",
    passive: {
      id: "armoredDead",
      name: "내 아군이 너보단 단단하다",
      glyph: "▰",
      description: "수확한 영혼 하나당 자신의 방어력이 오른다."
    },
    stats: { maxHp: 46, damage: 9, range: 13, speed: 16, attackMs: 720, armor: 0.15, color: "#9d89b5", glyph: "☠" },
    defaultLoadout: ["spiritDecay", "spiritRaise", "spiritWard"],
    skills: [
      { id: "spiritDecay", name: "부패", glyph: "☣", cooldownMs: 6200, effect: "spiritDecay", description: "주변 적 전체에게 부패를 부여해 지속 피해를 입힌다. 소환수의 공격력만큼 피해가 늘어난다." },
      { id: "spiritBolt", name: "뼈 화살", glyph: "☄", cooldownMs: 4200, effect: "spiritBolt", description: "단일 적에게 뼈 화살을 날린다. 가장 강한 소환수의 방어력 일부를 잠시 빌려온다." },
      { id: "spiritRaise", name: "강령", glyph: "⚰", cooldownMs: 9000, effect: "spiritRaise", description: "이번 전투에서 쓰러진 적 최대 3마리를 무장시켜 아군으로 되살린다. 공격력·방어력 모두 크게 버프된다. 전투당 1회만 쓸 수 있다." },
      { id: "spiritWard", name: "뼈 갑옷", glyph: "◈", cooldownMs: 7000, effect: "spiritWard", description: "자신의 방어력을 높이고 소량 회복하며, 생존한 소환수 전원의 공격력·방어력도 함께 올린다." }
    ],
    ultimate: { id: "storedApex", name: "봉인 우두머리", glyph: "☠", cooldownMs: 15000, effect: "storedApex", description: "저장해 둔 우두머리의 사념을 소환하고, 공방을 더 강화하며 특수 패턴을 해금한다." }
  },
  heavyCrusader: {
    id: "heavyCrusader",
    name: "중갑을 두른 크루세이더",
    shortName: "중갑크루",
    glyph: "♜",
    color: "#b08a6a",
    baseClassId: "crusader",
    primaryId: "holy",
    inheritedId: "heavy",
    description: "피격을 복수의 힘으로 바꾸어 상대를 출혈시키는 중갑 돌격형.",
    passive: {
      id: "vengefulPlate",
      name: "신은 극복할 수 있는 시련만 준다",
      glyph: "▰",
      description: "피격당한 피해의 절반을 복수치로 쌓는다. 스킬을 쓰면 복수치를 소모해 추가 효과를 낸다."
    },
    stats: { maxHp: 64, damage: 8, range: 11, speed: 15, attackMs: 700, armor: 0.28, color: "#b08a6a", glyph: "♜" },
    defaultLoadout: ["heavyBlessing", "heavyWard", "heavyLance"],
    skills: [
      { id: "heavyBlessing", name: "속죄", glyph: "✚", cooldownMs: 5400, effect: "heavyBlessing", description: "가장 다친 아군을 회복한다. 복수치가 있으면 회복량이 늘어난다." },
      { id: "heavyWard", name: "인내", glyph: "❖", cooldownMs: 7600, effect: "heavyWard", description: "아군 전체의 방어를 높이고, 공격한 적에게 출혈을 되돌린다." },
      { id: "heavyLance", name: "고통의 성창", glyph: "▲", cooldownMs: 4800, effect: "heavyLance", description: "단일 적을 꿰뚫어 기절시키고 출혈을 남긴다. 복수치를 소모해 피해가 늘어난다." },
      { id: "heavyBulwark", name: "도발의 함성", glyph: "☗", cooldownMs: 8600, effect: "heavyBulwark", description: "주변 적의 시선을 자신에게 모으고, 잠시 복수치 축적 속도가 크게 늘어난다." }
    ],
    ultimate: { id: "heavyJudgment", name: "너흰 아직 준비가 안됬다", glyph: "✦", cooldownMs: 13000, effect: "heavyJudgment", description: "쌓아 둔 복수치를 모두 터뜨려 목표 주변에 강한 피해와 긴 출혈을 남긴다." }
  },
  archeryNecromancer: {
    id: "archeryNecromancer",
    name: "궁술을 익힌 네크로맨서",
    shortName: "궁사네크",
    glyph: "☠",
    color: "#8aa06a",
    baseClassId: "necromancer",
    primaryId: "spirit",
    inheritedId: "archery",
    description: "소환보다 자신을 강화해 영혼의 조준으로 직접 싸우는 형태.",
    passive: {
      id: "spiritedAim",
      name: "내 아군보다 내가 더 잘 싸운다",
      glyph: "➹",
      description: "수확한 영혼 하나당 자신의 공격력이 오르고, 영혼이 있는 동안 은신 상태를 유지한다."
    },
    stats: { maxHp: 40, damage: 10, range: 20, speed: 15, attackMs: 700, armor: 0.09, color: "#8aa06a", glyph: "☠" },
    defaultLoadout: ["spiritDecay", "spiritBolt", "spiritRaise"],
    skills: [
      { id: "spiritDecay", name: "부패", glyph: "☣", cooldownMs: 6200, effect: "spiritDecay", description: "주변 적 전체에게 부패를 부여해 지속 피해를 입히고 방어력을 깎는다." },
      { id: "spiritBolt", name: "뼈 화살", glyph: "☄", cooldownMs: 4200, effect: "spiritBolt", description: "단일 적에게 뼈 화살을 날린다. 일정 확률로 치명타가 터진다." },
      { id: "spiritRaise", name: "강령", glyph: "⚰", cooldownMs: 9000, effect: "spiritRaise", description: "이번 전투에서 쓰러진 적 최대 3마리를 아군으로 되살린다. 공격력이 폭발적으로 늘어난다. 전투당 1회만 쓸 수 있다." },
      { id: "spiritWard", name: "뼈 갑옷", glyph: "◈", cooldownMs: 7000, effect: "spiritWard", description: "자신의 방어력을 높이고 소량 회복하며, 잠시 자신의 공격력도 함께 오른다." }
    ],
    ultimate: { id: "spiritApex", name: "일어나라", glyph: "☠", cooldownMs: 15000, effect: "storedApex", description: "저장해 둔 우두머리의 사념을 소환하고, 스스로 광폭화 상태에 빠져 흡혈하며 싸운다." }
  },
  archeryMaehwa: {
    id: "archeryMaehwa",
    name: "궁술을 익힌 매화",
    shortName: "암살자",
    glyph: "❀",
    color: "#6a6f8f",
    baseClassId: "maehwa",
    primaryId: "sword",
    inheritedId: "archery",
    description: "은신과 일격필살에 특화된 근접 암살형.",
    passive: {
      id: "shadowBlade",
      name: "은신",
      glyph: "➹",
      description: "적과 2초 이상 접촉이 없으면 은신한다. 은신 중 공격은 치명적이다."
    },
    stats: { maxHp: 38, damage: 10, range: 8, speed: 18, attackMs: 580, armor: 0.09, color: "#6a6f8f", glyph: "❀" },
    defaultLoadout: ["swiftStrike", "whirlwindSlash", "phantomCut"],
    skills: [
      { id: "swiftStrike", name: "암살", glyph: "⚔", cooldownMs: 5200, effect: "swiftStrike", description: "목표에게 순식간에 접근해 벤다. 은신 중이라면 치명타가 터진다." },
      { id: "whirlwindSlash", name: "연막탄", glyph: "☾", cooldownMs: 6600, effect: "whirlwindSlash", description: "자신 주변을 벤 뒤 뒤로 물러나며 은신한다." },
      { id: "phantomCut", name: "일섬", glyph: "☾", cooldownMs: 6000, effect: "phantomCut", description: "목표의 이로운 효과를 지우고 크게 벤다. 일정 확률로 치명타가 터진다." },
      { id: "fleetStep", name: "은신 개화", glyph: "➶", cooldownMs: 8000, effect: "fleetStep", description: "짧은 시간 공격 속도가 크게 오르고 즉시 은신하며, 공격할 때마다 상대에게 방어력 감소 표식이 쌓인다." }
    ],
    ultimate: { id: "plumBlossomDance", name: "일격필살", glyph: "❀", cooldownMs: 14000, effect: "plumBlossomDance", description: "목표에게 쌓인 표식을 모두 터뜨려 크게 벤다. 은신 중이라면 위력이 크게 늘어난다." }
  },
  magicMaehwa: {
    id: "magicMaehwa",
    name: "마법을 익힌 매화",
    shortName: "마검사",
    glyph: "❀",
    color: "#8a6fb0",
    baseClassId: "maehwa",
    primaryId: "sword",
    inheritedId: "magic",
    description: "검에 원소 마법을 실어 베는 검사형 마법 전투.",
    passive: {
      id: "elementalEdge",
      name: "마검술",
      glyph: "✦",
      description: "베는 공격에 마법 데미지가 추가로 실린다."
    },
    stats: { maxHp: 40, damage: 9, range: 9, speed: 16, attackMs: 620, armor: 0.1, color: "#8a6fb0", glyph: "❀" },
    defaultLoadout: ["swiftStrike", "whirlwindSlash", "phantomCut"],
    skills: [
      { id: "swiftStrike", name: "화염검 일섬", glyph: "♨", cooldownMs: 5200, effect: "swiftStrike", description: "목표에게 접근해 화염이 실린 일격을 가한다." },
      { id: "whirlwindSlash", name: "빙결검 선풍", glyph: "❄", cooldownMs: 6600, effect: "whirlwindSlash", description: "자신 주변을 냉기로 휩쓴다." },
      { id: "phantomCut", name: "검기", glyph: "☾", cooldownMs: 6000, effect: "phantomCut", description: "목표의 이로운 효과를 지우고 원거리에서 검기를 발사한다." },
      { id: "fleetStep", name: "마력 개화", glyph: "➶", cooldownMs: 8000, effect: "fleetStep", description: "짧은 시간 공격 속도가 크게 오르고, 공격할 때마다 상대에게 방어력 감소 표식과 냉기 둔화가 쌓인다." }
    ],
    ultimate: { id: "plumBlossomDance", name: "마력 낙화", glyph: "✦", cooldownMs: 12500, effect: "plumBlossomDance", description: "목표에게 쌓인 표식을 모두 터뜨려 크게 베고, 화염과 냉기가 함께 폭발한다." }
  },
  spiritArchmage: {
    id: "spiritArchmage",
    name: "정령술을 더한 아크메이지",
    shortName: "정령아크",
    glyph: "✦",
    color: "#6ab08f",
    baseClassId: "archmage",
    primaryId: "magic",
    inheritedId: "spirit",
    description: "원소 마법에 정령 계약을 더해 상태이상을 극대화한다.",
    passive: {
      id: "elementalContract",
      name: "자연 친화",
      glyph: "♧",
      description: "정령을 소환해 전투 내내 함께하며(정령은 피격 불가), 마나가 낮을수록 마나 회복 속도가 오르고, 자신이 거는 상태이상의 중첩 상한이 2배로 늘어난다."
    },
    stats: { maxHp: 32, damage: 9, range: 24, speed: 13, attackMs: 900, armor: 0.05, color: "#6ab08f", glyph: "✦" },
    defaultLoadout: ["fireBolt", "frostNova", "gravityWell"],
    skills: [
      { id: "fireBolt", name: "폭염창", glyph: "♨", cooldownMs: 4400, effect: "fireBolt", description: "단일 적에게 화염 피해를 입히고 화상을 남기며, 주변까지 폭발이 번진다." },
      { id: "frostNova", name: "빙결 폭발", glyph: "❄", cooldownMs: 6800, effect: "frostNova", description: "주변 적에게 냉기 피해를 입히고 빙결시킨다. 이미 얼어붙은 적에게는 추가 피해가 들어간다." },
      { id: "gravityWell", name: "원소 소용돌이", glyph: "◉", cooldownMs: 7400, effect: "gravityWell", description: "주변 적을 한 점으로 끌어당기며 피해를 입히고, 잠시 자신의 상태이상 위력이 폭증한다." },
      { id: "lightningRicochet", name: "과부화", glyph: "↯", cooldownMs: 5000, effect: "lightningRicochet", description: "가까운 적들을 번개로 연달아 튕기며 피해를 입히고 감전시킨다. 상대에게 걸린 상태이상 중첩 수만큼 피해가 늘어난다." }
    ],
    ultimate: { id: "triElementJudgment", name: "삼원소 심판", glyph: "✦", cooldownMs: 14000, effect: "triElementJudgment", description: "좁은 범위에 빙결·감전·화상을 차례로 내리쳐 세 속성 피해를 연속으로 입힌다." }
  },
  holyArchmage: {
    id: "holyArchmage",
    name: "신성을 더한 아크메이지",
    shortName: "신성아크",
    glyph: "✦",
    color: "#c0a866",
    baseClassId: "archmage",
    primaryId: "magic",
    inheritedId: "holy",
    description: "공격 마법을 신성 속성으로 바꾸어 아군을 함께 치유한다.",
    passive: {
      id: "sacredCircuit",
      name: "마나 친화",
      glyph: "✧",
      description: "마나 비율에 비례해 아군 전체의 공격력이 오르고, 보유한 마나가 많을수록 자신의 회복력도 오른다."
    },
    stats: { maxHp: 34, damage: 8, range: 22, speed: 14, attackMs: 880, armor: 0.06, color: "#c0a866", glyph: "✦" },
    defaultLoadout: ["fireBolt", "frostNova", "gravityWell"],
    skills: [
      { id: "fireBolt", name: "성스러운 화살", glyph: "✧", cooldownMs: 4400, effect: "fireBolt", description: "목표 주변에 신성 피해를 입히고 스스로를 조금 회복한다." },
      { id: "frostNova", name: "정화의 파동", glyph: "☼", cooldownMs: 6800, effect: "frostNova", description: "주변 적에게 신성 피해를 입히고 지속 피해를 남긴다." },
      { id: "gravityWell", name: "성역", glyph: "◉", cooldownMs: 7400, effect: "gravityWell", description: "주변 적을 한 점으로 끌어모아 속박하고 지속 피해를 남긴다." },
      { id: "lightningRicochet", name: "성광 연쇄", glyph: "↯", cooldownMs: 5000, effect: "lightningRicochet", description: "가까운 아군에게 신성한 빛이 연달아 튕기며 체력을 회복시키고 보호막을 두른다." }
    ],
    ultimate: { id: "heavenlyJudgment", name: "천벌", glyph: "✦", cooldownMs: 14000, effect: "heavenlyJudgment", description: "목표 주변에 신성 파도를 일으켜 연속으로 피해를 입히고 아군 전체를 회복·축복한다." }
  },
  spiritTracker: {
    id: "spiritTracker",
    name: "정령술을 더한 추적자",
    shortName: "정령추적",
    glyph: "➹",
    color: "#6aa0a8",
    baseClassId: "tracker",
    primaryId: "archery",
    inheritedId: "spirit",
    description: "화살에 정령의 힘을 담아 다양한 상태이상을 퍼뜨린다.",
    passive: {
      id: "spiritedShadow",
      name: "찾기 힘들껄",
      glyph: "➹",
      effect: "stealthWhenIdle",
      idleMs: 1800,
      description: "적과 1.8초 이상 접촉이 없으면 은신한다. 은신 중 공격은 치명적이다."
    },
    stats: { maxHp: 36, damage: 9, range: 23, speed: 15, attackMs: 800, armor: 0.06, color: "#6aa0a8", glyph: "➹" },
    defaultLoadout: ["aimedShot", "scatterShot", "shadowStrike"],
    skills: [
      { id: "aimedShot", name: "짜릿한 헤드샷", glyph: "♧", cooldownMs: 3800, effect: "aimedShot", description: "단일 적을 원거리에서 저격하고 번개로 기절시킨다." },
      { id: "scatterShot", name: "화끈한 폭발화살", glyph: "❋", cooldownMs: 6400, effect: "scatterShot", description: "부채꼴 범위의 적에게 원거리 피해를 입히고 화상을 남긴다." },
      { id: "shadowStrike", name: "차가운 후퇴", glyph: "☾", cooldownMs: 5200, effect: "shadowStrike", description: "근처 적을 공격하고 물러나며 주변 적을 빙결시킨다." },
      { id: "vanish", name: "빠른 은신", glyph: "✧", cooldownMs: 9000, effect: "vanish", description: "즉시 은신 상태가 되어 다음 공격을 강화하고 이동 속도가 오른다." }
    ],
    ultimate: { id: "arrowStorm", name: "정령 일제 사격", glyph: "➹", cooldownMs: 13000, effect: "arrowStorm", description: "넓은 범위에 정령 화살을 퍼부어 큰 피해를 입히고 상태이상을 함께 남긴다." }
  },
  heavyTracker: {
    id: "heavyTracker",
    name: "중갑을 두른 추적자",
    shortName: "대궁병",
    glyph: "➹",
    color: "#a08a5a",
    baseClassId: "tracker",
    primaryId: "archery",
    inheritedId: "heavy",
    description: "은신 대신 포격 모드로 자리를 지키며 압도적인 화력을 내는 시즈탱크형.",
    passive: {
      id: "fixedBattery",
      name: "찾을 필요 없어",
      glyph: "▰",
      description: "저격 태세인 동안 기술을 사용할 때마다 방어력이 잠시 더 오르고, 기본 공격이 상대를 밀쳐낸다."
    },
    stats: { maxHp: 48, damage: 10, range: 21, speed: 12, attackMs: 900, armor: 0.19, color: "#a08a5a", glyph: "➹" },
    defaultLoadout: ["aimedShot", "scatterShot", "shadowStrike"],
    skills: [
      { id: "aimedShot", name: "관통샷", glyph: "➶", cooldownMs: 3800, effect: "aimedShot", description: "단일 적을 원거리에서 저격하고 뒤에 있는 적까지 꿰뚫는다." },
      { id: "scatterShot", name: "충격화살", glyph: "❋", cooldownMs: 6400, effect: "scatterShot", description: "부채꼴 범위의 적에게 원거리 피해를 입히고 기절시킨다. 저격 태세에서는 범위와 위력이 늘어난다." },
      { id: "shadowStrike", name: "방어사격", glyph: "☗", cooldownMs: 5200, effect: "shadowStrike", description: "근처 적을 공격한다. 물러나지 않는 대신 주변 적을 모두 밀쳐낸다." },
      { id: "vanish", name: "저격", glyph: "❖", cooldownMs: 9000, effect: "vanish", description: "즉시 저격 태세로 전환한다. 이동·공격 속도가 느려지지만 방어력이 크게 오르고 관통샷·충격화살의 위력이 강해진다." }
    ],
    ultimate: { id: "piercingShot", name: "관통 사격", glyph: "➹", cooldownMs: 13500, effect: "piercingShot", description: "강력한 화살로 목표를 꿰뚫어 큰 피해를 입히고 묶어 둔다. 저격 태세에서는 위력이 더 강해진다." }
  }
};

export const DEFAULT_PLAYER_KIT_ID = "spiritCrusader";
export const DEFAULT_PLAYER_BASE_CLASS_ID = "crusader";

const LEGACY_SKILL_IDS = {
  spiritShieldBash: "spiritMending",
  rootboundCharge: "winterAegis",
  elementalAegis: "sacredWildfire",
  sanctuaryBloom: "thunderLance",
  spiritJudgment: "tempestJudgment",
  raiseIronDead: "armedResurrection",
  boneGreatsword: "bloodRend",
  graveBulwark: "boneArmor",
  corpseForge: "armoredDecay",
  deathColossus: "storedApex"
};

export function playerBaseClassDefinition(baseClassId) {
  return PLAYER_BASE_CLASS_DEFS[baseClassId] || PLAYER_BASE_CLASS_DEFS[DEFAULT_PLAYER_BASE_CLASS_ID];
}

export function playerKitDefinition(kitId) {
  return PLAYER_KIT_DEFS[kitId] || PLAYER_KIT_DEFS[DEFAULT_PLAYER_KIT_ID];
}

export function playerSkillDefinition(kitId, skillId) {
  return playerKitDefinition(kitId).skills.find((skill) => skill.id === skillId) || null;
}

export function playerUltimateDefinition(kitId) {
  return playerKitDefinition(kitId).ultimate;
}

export function normalizedPlayerLoadout(commander = {}, kitId = commander.combatKitId, fillDefaults = true) {
  const kit = playerKitDefinition(kitId);
  const allowed = new Set(kit.skills.map((skill) => skill.id));
  const stored = commander.skillLoadouts?.[kit.id] || commander.equippedSkillIds || [];
  const migrated = stored.map((skillId) => LEGACY_SKILL_IDS[skillId] || skillId);
  const selected = [...new Set(migrated)].filter((skillId) => allowed.has(skillId)).slice(0, 3);
  if (fillDefaults) {
    for (const skillId of kit.defaultLoadout) {
      if (selected.length >= 3) break;
      if (!selected.includes(skillId)) selected.push(skillId);
    }
  }
  return selected;
}

export const RUNE_DEFS = {
  blueRune: { id: "blueRune", name: "청색 룬", regionId: "north", glyph: "◆", cost: 10, description: "마나 회복 속도가 증가한다." },
  greenRune: { id: "greenRune", name: "녹색 룬", regionId: "south", glyph: "◆", cost: 10, description: "공격력이 증가한다." },
  purpleRune: { id: "purpleRune", name: "자색 룬", regionId: "east", glyph: "◆", cost: 10, description: "공격 속도가 증가한다." },
  yellowRune: { id: "yellowRune", name: "황색 룬", regionId: "west", glyph: "◆", cost: 10, description: "방어력이 증가한다." },
  redRune: { id: "redRune", name: "적색 룬", regionId: "central", glyph: "◆", cost: 10, description: "체력이 증가한다." }
};

export function runeDefinition(runeId) {
  return RUNE_DEFS[runeId] || null;
}

// 직업별 대표 무기 아이템. 지역 부락 친목도 60 달성 시 설계도 습득(출신 지역
// 기준, grantVillageMilestoneReward 참고) → craftWeapon으로 재료 소모 제작 →
// equipWeapon으로 장착(룬과 동일한 습득/장착 2단계 패턴). 자기 직업과 무기의
// baseClassId가 일치해야 장착 가능.
//
// 보너스는 damageBonus/cooldownReduction만 사용한다 — criticalChance는 넣지
// 않았다: 현재 어떤 기본 직업도 statProfile.base.criticalChance를 정의하지
// 않아서 playerCombatStats()가 criticalChance를 항상 null로 반환하고,
// commander.itemBonuses.criticalChance 보너스 자체가 이미 죽은 경로였다(무기
// 시스템 이전부터). 치명타는 지금은 매화 등 일부 스킬 이펙트에서 개별
// Math.random() 굴림으로만 처리된다 — 직업 공통 치명타 스탯 도입은 이번 범위
// 밖이라 별도 논의 필요.
// 장비 슬롯. 한 슬롯에 하나씩만 장착된다.
//
// 슬롯은 세 계열로 나뉜다:
// - weapon    : 직업 전용(classLocked). 직업 정체성을 표현한다.
// - armor     : 부위별 5칸. 직업 제한 없음.
// - accessory : 반지 2 + 목걸이 1. 직업 제한 없음(docs/EQUIPMENT_DESIGN.md §11).
//
// **id와 itemSlot을 구분한다.** 반지처럼 같은 종류를 두 칸 끼는 부위가 있어서다.
// 아이템은 `slot: "ring"`(= itemSlot)이라고만 선언하고, 그게 ring1에 들어갈지
// ring2에 들어갈지는 장착할 때 정한다.
//
// 슬롯을 늘리거나 줄이려면 이 표만 고치면 된다 — 보너스 합산(equippedBonuses),
// 세트 판정, 저장 마이그레이션, UI가 전부 이 표를 순회하므로 다른 곳은 손댈 게 없다.
export const EQUIPMENT_SLOT_DEFS = {
  weapon: { id: "weapon", itemSlot: "weapon", category: "weapon", name: "무기", classLocked: true },

  helmet: { id: "helmet", itemSlot: "helmet", category: "armor", name: "투구" },
  chest: { id: "chest", itemSlot: "chest", category: "armor", name: "갑옷" },
  gloves: { id: "gloves", itemSlot: "gloves", category: "armor", name: "장갑" },
  boots: { id: "boots", itemSlot: "boots", category: "armor", name: "신발" },
  cloak: { id: "cloak", itemSlot: "cloak", category: "armor", name: "망토" },

  ring1: { id: "ring1", itemSlot: "ring", category: "accessory", name: "반지 1" },
  ring2: { id: "ring2", itemSlot: "ring", category: "accessory", name: "반지 2" },
  necklace: { id: "necklace", itemSlot: "necklace", category: "accessory", name: "목걸이" }
};

// 아이템의 slot 값(itemSlot)이 들어갈 수 있는 장착 칸들.
export function slotsAcceptingItem(itemSlot) {
  return Object.values(EQUIPMENT_SLOT_DEFS).filter((slot) => slot.itemSlot === itemSlot);
}

export const EQUIPMENT_SLOT_CATEGORY_LABELS = {
  weapon: "무기",
  armor: "방어구",
  accessory: "장신구"
};

// 방어구 계열. 전설 방어구는 부위(투구·갑옷…)보다 이 계열 단위로 설계된다
// (docs/EQUIPMENT_DESIGN.md §10 — "세부 부위화는 추후 구현 단계에서 결정").
export const ARMOR_CLASS_DEFS = {
  heavy: { id: "heavy", name: "중갑" },
  light: { id: "light", name: "경갑" },
  cloth: { id: "cloth", name: "천" }
};

// 선언 순서가 곧 화면 표시 순서다.
export const EQUIPMENT_SLOTS = Object.keys(EQUIPMENT_SLOT_DEFS);

export const EQUIPMENT_SLOT_LABELS = Object.fromEntries(
  Object.values(EQUIPMENT_SLOT_DEFS).map((slot) => [slot.id, slot.name])
);

export function equipmentSlotsByCategory(category) {
  return Object.values(EQUIPMENT_SLOT_DEFS).filter((slot) => slot.category === category);
}

export function equipmentSlotDefinition(slotId) {
  return EQUIPMENT_SLOT_DEFS[slotId] || null;
}

// 빈 장착표. 새 지휘관 생성과 저장 마이그레이션이 같은 모양을 쓰도록 한 곳에 둔다.
export function createEmptyEquipped() {
  return Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
}

// 장비 등급 5단계(docs/EQUIPMENT_DESIGN.md §1).
//
// 등급이 올리는 건 두 가지다: 기본 수치 배율(baseScale)과 **랜덤 옵션 칸 수**.
// 랜덤 옵션은 모든 장비에 붙으므로 일반도 한 칸은 갖는다.
//
// 제작으로 도달할 수 있는 건 희귀까지다. 전설·신화는 보스 부산물이 있어야 하는데
// 그 설계가 아직 회의 중이라(docs/EQUIPMENT_DESIGN.md §1) 등급 정의만 넣어두고
// 획득 경로는 비워뒀다.
export const EQUIPMENT_GRADE_DEFS = {
  common: { id: "common", name: "일반", optionCount: 1, baseScale: 1, craftable: true, color: "#9a9384" },
  fine: { id: "fine", name: "고급", optionCount: 2, baseScale: 1.08, craftable: true, color: "#6fa8dc" },
  rare: { id: "rare", name: "희귀", optionCount: 3, baseScale: 1.16, craftable: true, color: "#b07fd8" },
  legendary: { id: "legendary", name: "전설", optionCount: 4, baseScale: 1.26, craftable: false, color: "#e0a648" },
  mythic: { id: "mythic", name: "신화", optionCount: 5, baseScale: 1.38, craftable: false, color: "#e06a5a" }
};

export const EQUIPMENT_GRADES = Object.keys(EQUIPMENT_GRADE_DEFS);

export function equipmentGradeDefinition(gradeId) {
  return EQUIPMENT_GRADE_DEFS[gradeId] || EQUIPMENT_GRADE_DEFS.common;
}

// 랜덤 옵션 풀. 장비 부위 계열별로 후보를 제한한다(docs/EQUIPMENT_DESIGN.md §2 —
// "옵션 풀이 지나치게 넓어져 잡옵 파밍이 과해지지 않도록").
//
// 지금은 playerCombatStats가 실제로 소비하는 5개 스탯만 쓴다. 설계 문서가 언급한
// 치명타·공격속도·이동속도·상태저항·경직저항은 **전투 엔진에 아직 스탯 자체가 없어서**
// 넣지 않았다. 그 스탯들이 생기면 여기 풀에 추가하면 된다.
export const EQUIPMENT_OPTION_POOLS = {
  weapon: [
    { key: "damageBonus", min: 0.02, max: 0.06 },
    { key: "cooldownReduction", min: 0.01, max: 0.04 },
    { key: "criticalChance", min: 0.01, max: 0.05 },
    { key: "criticalDamage", min: 0.05, max: 0.25 },
    { key: "attackSpeedBonus", min: 0.02, max: 0.08 },
    { key: "statusPowerBonus", min: 0.03, max: 0.12 }
  ],
  armor: [
    { key: "maxHpBonus", min: 0.02, max: 0.07 },
    { key: "armorBonus", min: 0.01, max: 0.03 },
    { key: "statusResistBonus", min: 0.02, max: 0.08 },
    { key: "moveSpeedBonus", min: 0.02, max: 0.06 },
    { key: "cooldownReduction", min: 0.01, max: 0.03 }
  ],
  accessory: [
    { key: "manaRegenBonus", min: 0.1, max: 0.5 },
    { key: "cooldownReduction", min: 0.01, max: 0.04 },
    { key: "damageBonus", min: 0.01, max: 0.04 },
    { key: "criticalChance", min: 0.01, max: 0.04 },
    { key: "moveSpeedBonus", min: 0.02, max: 0.07 },
    { key: "statusResistBonus", min: 0.02, max: 0.06 }
  ]
};

export function equipmentOptionPool(slotId) {
  const slot = EQUIPMENT_SLOT_DEFS[slotId];
  return slot ? EQUIPMENT_OPTION_POOLS[slot.category] || [] : [];
}

// 제작 시 등급 확률. 대장장이 숙련도(0 초심자 ~ 3 장인)가 높을수록 좋은 등급이
// 나온다 — 숙련도가 장비 품질에 영향을 준다는 설계 요구를 여기서 구현한다.
const CRAFT_GRADE_CHANCES = [
  { common: 0.7, fine: 0.25, rare: 0.05 },  // 초심자
  { common: 0.55, fine: 0.33, rare: 0.12 }, // 숙련자
  { common: 0.4, fine: 0.4, rare: 0.2 },    // 전문가
  { common: 0.25, fine: 0.45, rare: 0.3 }   // 장인
];

export function rollCraftGrade(proficiencyLevel = 0, roll = Math.random()) {
  const level = Math.max(0, Math.min(CRAFT_GRADE_CHANCES.length - 1, Math.floor(proficiencyLevel)));
  let remaining = roll;
  for (const [gradeId, chance] of Object.entries(CRAFT_GRADE_CHANCES[level])) {
    remaining -= chance;
    if (remaining < 0) return gradeId;
  }
  return "common";
}

// 옵션 수치를 굴린다. 숙련도가 높을수록 **최저값이 올라간다** — 같은 등급이라도
// 장인이 만든 게 바닥값이 덜 나온다는 뜻이다(최대값은 그대로라 상한은 공평하다).
function rollOptionValue(option, proficiencyLevel, roll) {
  const floor = 0.2 * Math.max(0, Math.min(3, proficiencyLevel)) / 3;
  const t = floor + roll * (1 - floor);
  const value = option.min + (option.max - option.min) * t;
  // 소수점이 길게 남으면 UI에서 지저분하고 저장도 커진다.
  return Math.round(value * 1000) / 1000;
}

// 장비 한 점의 랜덤 옵션을 굴린다. 같은 스탯이 중복으로 붙지 않도록 후보에서 제거하며
// 뽑고, 풀이 모자라면 붙일 수 있는 만큼만 붙인다.
export function rollEquipmentOptions(slotId, gradeId, proficiencyLevel = 0, nextRoll = Math.random) {
  const pool = [...equipmentOptionPool(slotId)];
  const count = Math.min(equipmentGradeDefinition(gradeId).optionCount, pool.length);
  const options = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.min(pool.length - 1, Math.floor(nextRoll() * pool.length));
    const [option] = pool.splice(index, 1);
    options.push({ key: option.key, value: rollOptionValue(option, proficiencyLevel, nextRoll()) });
  }
  return options;
}

// 보유 장비 한 점(인스턴스). 같은 설계도로 여러 번 만들면 각각 다른 옵션을 갖기
// 때문에, 보유 목록은 id 배열이 아니라 인스턴스 배열이어야 한다.
export function createEquipmentInstance(uid, defId, gradeId, options = []) {
  return { uid, defId, grade: gradeId, options: options.map((entry) => ({ ...entry })) };
}

// 인스턴스가 실제로 주는 보너스 = 정의 기본값 × 등급 배율 + 굴린 옵션.
export function instanceBonuses(instance) {
  const definition = EQUIPMENT_DEFS[instance?.defId];
  if (!definition) return {};
  const scale = equipmentGradeDefinition(instance.grade).baseScale;
  const totals = {};
  for (const [key, value] of Object.entries(definition.bonus || {})) {
    totals[key] = Math.round(value * scale * 1000) / 1000;
  }
  for (const option of instance.options || []) {
    totals[option.key] = Math.round(((totals[option.key] || 0) + option.value) * 1000) / 1000;
  }
  return totals;
}

// 장착 중인 전설 장비의 고유효과를 모은다. 전투 엔진이 이 목록을 보고 분기한다.
// 같은 종류가 둘이면(반지 두 칸) 둘 다 들어간다 - 합산 여부는 사용하는 쪽이 정한다.
// 동료 장비. 쓰던 장비를 물려주는 용도라 **보관함(equipmentOwned)은 지휘관과 공유**하고
// 장착표만 동료별로 따로 둔다.
//
// 무기는 줄 수 없다 — 무기만 직업 전용이고(EQUIPMENT_SLOT_DEFS.classLocked) 동료는
// 플레이어 직업이 아니다. 방어구 5칸과 장신구 3칸은 원래 직업 제한이 없어서 그대로 쓴다.
export function companionEquippedMap(commander, unitId) {
  return commander?.companionEquipped?.[unitId] || {};
}

export function companionEquippableSlots() {
  return Object.values(EQUIPMENT_SLOT_DEFS).filter((slot) => !slot.classLocked);
}

// 같은 장비를 지휘관과 동료가 동시에 낄 수 없다. 어디에 끼워져 있든 찾아서 뗀다.
export function releaseEquipmentEverywhere(commander, uid) {
  if (!commander || !uid) return;
  for (const slot of EQUIPMENT_SLOTS) {
    if (commander.equipped?.[slot] === uid) commander.equipped[slot] = null;
  }
  for (const map of Object.values(commander.companionEquipped || {})) {
    for (const slot of Object.keys(map)) {
      if (map[slot] === uid) map[slot] = null;
    }
  }
}

// 동료가 낀 장비의 보너스 합계. 지휘관 계산과 같은 규칙을 쓰되 장착표만 바꿔 넣는다.
export function companionBonuses(commander, unitId) {
  const equipped = companionEquippedMap(commander, unitId);
  return equippedBonuses({ ...commander, equipped }, null);
}

export function equippedUniqueEffects(commander = {}, baseClassId = null) {
  const effects = [];
  const equipped = commander.equipped || {};
  const seen = new Set();
  for (const slotId of EQUIPMENT_SLOTS) {
    const instance = findEquipmentInstance(commander, equipped[slotId]);
    const definition = EQUIPMENT_DEFS[instance?.defId];
    if (!definition?.uniqueEffect || seen.has(instance.uid)) continue;
    const slotDef = EQUIPMENT_SLOT_DEFS[slotId];
    if (definition.slot !== slotDef.itemSlot) continue;
    if (slotDef.classLocked && baseClassId && definition.baseClassId !== baseClassId) continue;
    seen.add(instance.uid);
    effects.push({ ...definition.uniqueEffect, sourceId: definition.id, sourceName: definition.name });
  }
  return effects;
}

// 특정 종류의 고유효과 하나를 찾는다(같은 종류가 둘이면 첫 번째).
export function findUniqueEffect(commander, type, baseClassId = null) {
  return equippedUniqueEffects(commander, baseClassId).find((effect) => effect.type === type) || null;
}

export function findEquipmentInstance(commander, uid) {
  return (commander?.equipmentOwned || []).find((entry) => entry?.uid === uid) || null;
}

// 장비 정의. 습득 흐름은 룬과 같은 2단계(설계도 습득 → 제작 → 장착)다.
//
// 슬롯별 성격:
// - weapon: 직업 전용(baseClassId 일치해야 장착). 직업 정체성을 표현한다.
// - armor / accessory: 직업 제한 없음. 어떤 직업이든 원하는 방향으로 고를 수 있게
//   해서 "직업에 따라 선택이 강제되지" 않도록 한다(docs/CHOICE_DESIGN.md 원칙).
//
// 보너스는 playerCombatStats가 실제로 소비하는 값만 쓴다:
// damageBonus / cooldownReduction / maxHpBonus / armorBonus / manaRegenBonus.
// criticalChance는 넣지 않았다 — 현재 어떤 기본 직업도 statProfile.base.criticalChance를
// 정의하지 않아 playerCombatStats가 항상 null을 반환하는 죽은 경로다(무기 시스템
// 이전부터 그랬다). 직업 공통 치명타 스탯 도입은 별도 논의 필요.
//
// 수치는 의도적으로 작게 잡았다 — 선택이 "얼마나 강해지냐"가 아니라 "어떤 방향으로
// 굴리냐"를 바꾸는 쪽이어야 한다(docs/CHOICE_DESIGN.md).
export const EQUIPMENT_DEFS = {
  // --- 무기: 직업 전용 ---
  crusaderBastardSword: { id: "crusaderBastardSword", slot: "weapon", name: "성광의 바스타드 소드", baseClassId: "crusader", weaponType: "bastardSword", materials: { ingot: 4, blackSteel: 1 }, bonus: { damageBonus: 0.08 }, description: "한손·양손을 모두 쓰는 바스타드 소드. 공격력이 증가한다." },
  barbarianGreataxe: { id: "barbarianGreataxe", slot: "weapon", name: "심연의 대부", baseClassId: "barbarian", weaponType: "greataxe", materials: { ingot: 5, blackSteel: 1 }, bonus: { damageBonus: 0.12 }, description: "무게 자체가 무기인 특대 도끼. 공격력이 크게 증가한다." },
  necromancerArmorSword: { id: "necromancerArmorSword", slot: "weapon", name: "귀곡의 아머 소드", baseClassId: "necromancer", weaponType: "armorSword", materials: { ingot: 3, herb: 2 }, bonus: { cooldownReduction: 0.06 }, description: "갑주째 베어내는 아머 소드. 스킬 재사용 대기시간이 감소한다." },
  trackerShortBow: { id: "trackerShortBow", slot: "weapon", name: "초원의 단궁", baseClassId: "tracker", weaponType: "shortBow", materials: { wood: 4, ingot: 2 }, bonus: { damageBonus: 0.08 }, description: "달리면서도 쏘기 좋은 몽고풍 단궁. 공격력이 증가한다." },
  maehwaSabre: { id: "maehwaSabre", slot: "weapon", name: "일섬의 매화도", baseClassId: "maehwa", weaponType: "sabre", materials: { ingot: 3, wood: 1 }, bonus: { cooldownReduction: 0.06 }, description: "정교하게 벼려낸 매화도. 스킬 재사용 대기시간이 감소한다." },
  archmageStaff: { id: "archmageStaff", slot: "weapon", name: "현자의 지팡이", baseClassId: "archmage", weaponType: "staff", materials: { wood: 3, ingot: 2 }, bonus: { cooldownReduction: 0.1 }, description: "마력 순환을 돕는 대형 지팡이. 스킬 재사용 대기시간이 크게 감소한다." },

  // --- 방어구: 직업 제한 없음. 셋 다 "버티기 / 굴리기 / 마력" 방향이 갈린다 ---
  // 지금은 셋 다 몸통(chest)이다. 투구·장갑·신발·망토 슬롯은 구조만 열어두고
  // 채울 아이템은 아직 설계 중이다.
  heavyPlate: { id: "heavyPlate", slot: "chest", armorClass: "heavy", setId: "ironbound", name: "층철 판금갑", materials: { ingot: 5, blackSteel: 1 }, bonus: { maxHpBonus: 0.12, armorBonus: 0.04 }, description: "무겁게 겹쳐 두른 판금. 체력과 방어력이 함께 오른다." },
  scoutLeather: { id: "scoutLeather", slot: "chest", armorClass: "light", setId: "ranger", name: "순찰자 경갑", materials: { wood: 2, ingot: 2, herb: 1 }, bonus: { armorBonus: 0.02, cooldownReduction: 0.05 }, description: "가벼운 가죽 경갑. 방어력이 조금 오르고 기술 회전이 빨라진다." },
  wardenRobe: { id: "wardenRobe", slot: "chest", armorClass: "cloth", setId: "warden", name: "감시자의 예복", materials: { wood: 3, herb: 3 }, bonus: { armorBonus: 0.02, manaRegenBonus: 0.8 }, description: "마력을 머금은 예복. 방어력이 조금 오르고 마나 회복이 빨라진다." },

  // --- 장신구: 직업 제한 없음. 각각 방어구 하나와 세트를 이룬다 ---
  guardianCharm: { id: "guardianCharm", slot: "necklace", setId: "ironbound", name: "수호의 부적", materials: { herb: 3, ingot: 1 }, bonus: { maxHpBonus: 0.09 }, description: "낡은 수호 부적. 최대 체력이 오른다." },
  sagesBand: { id: "sagesBand", slot: "ring", setId: "ranger", name: "현자의 고리", materials: { ore: 2, herb: 2 }, bonus: { cooldownReduction: 0.05 }, description: "사색을 돕는 고리. 스킬 재사용 대기시간이 감소한다." },
  runeSigil: { id: "runeSigil", slot: "necklace", setId: "warden", name: "룬 각인 인장", materials: { ore: 3, ingot: 1 }, bonus: { damageBonus: 0.05 }, description: "각인된 인장. 공격력이 오른다." }
};

// 방어구 세트. 설계도는 낱개가 아니라 "세트 단위"로 습득한다 — 하나를 얻으면
// 방어구와 짝 장신구를 둘 다 만들 수 있다(제작은 여전히 각각 재료를 쓴다).
// 둘 다 장착하면 작은 세트 보너스가 붙어, 세트를 맞출지 다른 세트끼리 섞을지가
// 하나의 선택이 된다. 보너스를 작게 둔 건 "선택이 강함이 아니라 방향을 바꾼다"는
// 원칙(docs/CHOICE_DESIGN.md) 때문이다.
export const ARMOR_SET_DEFS = {
  ironbound: { id: "ironbound", name: "층철 세트", pieces: ["heavyPlate", "guardianCharm"], setBonus: { armorBonus: 0.02 }, description: "버티는 방향. 세트 완성 시 방어력이 조금 더 오른다." },
  ranger: { id: "ranger", name: "순찰자 세트", pieces: ["scoutLeather", "sagesBand"], setBonus: { cooldownReduction: 0.03 }, description: "굴리는 방향. 세트 완성 시 기술 회전이 조금 더 빨라진다." },
  warden: { id: "warden", name: "감시자 세트", pieces: ["wardenRobe", "runeSigil"], setBonus: { manaRegenBonus: 0.4 }, description: "마력 방향. 세트 완성 시 마나 회복이 조금 더 빨라진다." }
};

export function armorSetDefinition(setId) {
  return ARMOR_SET_DEFS[setId] || null;
}

// 전설 장비. 지역 문화권의 신화·전승에서 이름을 따왔다(북부=북유럽, 동부=동양 무예,
// 서부=기사 서사시, 남부=인도·동남아, 중부=중동 교역로).
//
// 설계 원칙: 전설이라고 수치를 크게 올리지 않는다. 대신 **일반 장비가 절대 함께
// 주지 않는 조합**을 준다(예: 공격력과 방어력을 동시에, 체력과 쿨다운을 동시에).
// 그래서 "더 세다"가 아니라 "다르게 굴린다"가 되고, docs/CHOICE_DESIGN.md의
// "선택은 강함이 아니라 방향을 바꾼다" 원칙과 어긋나지 않는다.
//
// 획득: 그 지역 던전을 LEGENDARY_CLEAR_REQUIREMENT회 이상 클리어하면 설계도가 나온다.
// 설계도 3단계(무기→방어구 세트→두 번째 무기)를 모두 받은 뒤의 장기 목표이자
// 컬렉션 요소다.
// ── 지역 진행용 반지 (docs/EQUIPMENT_DESIGN.md §11 · REGION_PROGRESSION_HAZARDS.md) ──
//
// `1필드 보스 핵심 소재 + 그 지역 광석/금속 + 그 지역 약재`로 만든다.
// 상위 필드로 올라가기 전에 그 지역의 압박에 대응하는 세팅을 갖추게 하는 장치다.
//
// **반지로 만든 이유**: 반지가 두 칸이라 "한 칸은 지역 대응 / 한 칸은 전투용"으로
// 나눠 낄 수 있다. 지역을 넘나들 때 목걸이까지 통째로 갈아끼우게 하면 전설 목걸이가
// 사실상 사장되므로, 지역 대응은 여유가 있는 반지 쪽이 맞다.
//
// **자기 지역에서만 통한다**(regionWard.regionId). 하나로 모든 지역을 우회하는
// 범용 해답을 만들지 않는다는 원칙 때문이다.
//
// 대응 수치는 파티 구성에서 최대 4가 나오고, 4에 닿으면 지역 효과가 완전히 막힌다.
// 목걸이는 3을 주므로 **목걸이만으로는 부족하고** 그 지역 출신 동료나 기술이
// 하나는 더 필요하다 — 장비와 편성 두 축을 다 만지게 하려는 배분이다.
const REGION_WARD_DEFS = {
  frostwardCharm: {
    id: "frostwardCharm", slot: "ring", name: "설한 방호 반지",
    materials: { frostCore: 1, manganese: 2, rhodiola: 2 },
    bonus: { manaRegenBonus: 0.5 },
    uniqueEffect: { type: "regionWard", regionId: "north", mitigation: 3 },
    description: "빙결 마도핵을 망간에 물리고 로디올라를 덧댔다. 북부의 마력 유실을 늦춘다."
  },
  antivenomCharm: {
    id: "antivenomCharm", slot: "ring", name: "해독 반지",
    materials: { venomSac: 1, aluminum: 2, cinchonaBark: 2 },
    bonus: { maxHpBonus: 0.05 },
    uniqueEffect: { type: "regionWard", regionId: "south", mitigation: 3 },
    description: "맹독낭을 기나나무 껍질로 중화했다. 남부의 독기와 오염을 버틴다."
  },
  spiritAnchorCharm: {
    id: "spiritAnchorCharm", slot: "ring", name: "영기 고정 반지",
    materials: { spiritCore: 1, titanium: 2, cordyceps: 2 },
    bonus: { cooldownReduction: 0.04 },
    uniqueEffect: { type: "regionWard", regionId: "east", mitigation: 3 },
    description: "영핵을 티타늄에 봉했다. 동부 영물이 몸에 걸린 것을 씻어내지 못하게 붙든다."
  },
  wardingSoulCharm: {
    id: "wardingSoulCharm", slot: "ring", name: "정화 서약 반지",
    materials: { durahanSoul: 1, zinc: 2, chamomile: 2 },
    bonus: { armorBonus: 0.02, maxHpBonus: 0.04 },
    uniqueEffect: { type: "regionWard", regionId: "west", mitigation: 3 },
    description: "듀라한의 영혼을 아연에 가두고 카모마일로 달랬다. 동료에게 스미는 저주를 늦춘다."
  },
  emberwardCharm: {
    id: "emberwardCharm", slot: "ring", name: "내열 반지",
    materials: { wormCore: 1, copper: 2, aloeVera: 2 },
    bonus: { maxHpBonus: 0.05 },
    uniqueEffect: { type: "regionWard", regionId: "central", mitigation: 3 },
    description: "샌드웜 열핵을 구리에 감고 알로에를 발랐다. 중부의 폭염을 흘려보낸다."
  }
};

// ── 전설 방어구·장신구 (docs/EQUIPMENT_DESIGN.md §10·§11) ──
//
// 무기와 달리 이쪽은 **보스 부산물로만** 만든다(§5). 재료 조합은 문서의 고정
// 조합표를 그대로 옮긴 것이며, 여러 보스의 부산물을 섞는 레시피가 많아
// "어느 보스를 돌 것인가"가 파밍 동선의 선택이 된다.
//
// 전설의 정체성은 수치가 아니라 uniqueEffect다 — 전투 방식 자체를 바꾼다.
const LEGENDARY_GEAR_DEFS = {
  // --- 중갑 2종 ---
  dragonRampart: {
    id: "dragonRampart", slot: "chest", armorClass: "heavy", legendary: true,
    name: "고룡의 성벽",
    materials: { dragonScale: 2, chitinPlate: 2, cursedPlate: 2 },
    bonus: { maxHpBonus: 0.1, armorBonus: 0.03 },
    // 중간급 피해만 강제로 깎는다. 보스 대형 기믹(40% 초과)은 그대로 맞으므로
    // "잡공격은 무시하되 큰 건 피해야 하는" 중갑이 된다.
    uniqueEffect: { type: "damageBand", floorRatio: 0.05, capRatio: 0.4 },
    lore: "폐허를 차지한 용의 비늘을 겹쳐 두른 성벽 같은 갑주."
  },
  warchiefPlate: {
    id: "warchiefPlate", slot: "chest", armorClass: "heavy", legendary: true,
    name: "대전사의 전투갑주",
    materials: { chitinPlate: 2, warchiefAxe: 1, shamanStone: 2 },
    bonus: { maxHpBonus: 0.08, damageBonus: 0.04 },
    // 중갑의 둔중함을 깨는 공격형 중갑.
    uniqueEffect: { type: "battleTempo", attackSpeed: 0.1, moveSpeed: 0.12 },
    lore: "오크 대전사의 도끼를 녹여 덧댄 갑주. 무겁지만 몸이 앞선다."
  },

  // --- 경갑 2종 ---
  foxMantle: {
    id: "foxMantle", slot: "chest", armorClass: "light", legendary: true,
    name: "구미호의 외투",
    materials: { foxTail: 1, spiritCore: 2, spiderSilk: 2 },
    bonus: { maxHpBonus: 0.06, cooldownReduction: 0.04 },
    // 폭딜을 즉시 받지 않고 지속 피해로 흘린다. 총량은 같지만 한 방에 죽지 않는다.
    uniqueEffect: { type: "damageSpread", ratio: 0.4, durationMs: 3000 },
    lore: "아홉 꼬리의 털을 짜 만든 외투. 큰 상처를 시간에 흩뜨린다."
  },
  phantomLeather: {
    id: "phantomLeather", slot: "chest", armorClass: "light", legendary: true,
    name: "환영 경갑",
    materials: { spiritCore: 2, serpentHide: 2, bearSinew: 1 },
    bonus: { armorBonus: 0.02, cooldownReduction: 0.06 },
    uniqueEffect: { type: "phantomDodge", chance: 0.15 },
    lore: "입은 자의 윤곽이 흐려진다. 노려도 빗나가는 일이 생긴다."
  },

  // --- 천 2종 ---
  arcaneVeil: {
    id: "arcaneVeil", slot: "chest", armorClass: "cloth", legendary: true,
    name: "마도사의 장막",
    materials: { taintedTome: 1, shamanStone: 2, frostCore: 2 },
    bonus: { manaRegenBonus: 0.6, cooldownReduction: 0.04 },
    // 마나를 생존 자원으로 바꾼다. 마나가 마르면 그냥 천옷이 된다.
    uniqueEffect: { type: "manaShieldGear", ratio: 0.35, manaPerDamage: 1.4 },
    lore: "마력으로 짠 장막. 상처를 마나로 대신 치른다."
  },
  soulVeil: {
    id: "soulVeil", slot: "chest", armorClass: "cloth", legendary: true,
    name: "영혼의 장막",
    materials: { soulStone: 2, fallenRelic: 1, spiderSilk: 2 },
    bonus: { maxHpBonus: 0.05, manaRegenBonus: 0.4 },
    // 안 맞고 버틴 시간을 한 방 방어로 바꾼다. 치고 빠지는 운용과 맞물린다.
    uniqueEffect: { type: "recoveryShield", quietMs: 5000, maxRatio: 0.6 },
    lore: "영혼석을 엮어 짠 장막. 숨을 고르면 한 번을 막아준다."
  },

  // --- 반지 6종 ---
  frostWardRing: {
    id: "frostWardRing", slot: "ring", legendary: true,
    name: "동토 수호반지",
    materials: { frostCore: 2, bearSinew: 1 },
    bonus: { maxHpBonus: 0.04, armorBonus: 0.02 },
    // 북부 환경 대응용이 아니라 "냉기 적·빙결 상태이상"에 대한 전투 장신구다.
    // 환경 패널티를 장비 하나로 우회하지 않는다는 원칙과 구분된다.
    uniqueEffect: { type: "statusWard", statusId: "frost", reduceMs: 1400, resist: 0.4 },
    lore: "냉기 핵을 얼음결정에 물린 반지. 얼어붙지 않는다."
  },
  resonanceRing: {
    id: "resonanceRing", slot: "ring", legendary: true,
    name: "주술 공명반지",
    materials: { shamanStone: 2, spiritCore: 1 },
    bonus: { manaRegenBonus: 0.3, cooldownReduction: 0.03 },
    // 문서는 "소모한 마나 일부 환급"이지만 이 엔진의 플레이어 스킬은 마나를 쓰지
    // 않는다(쿨다운만 있다). 대신 마나는 마도사의 장막이 피해를 대신 치르는
    // **생존 자원**이라, 스킬을 쓸 때 최대 마나의 일부를 채워주는 쪽으로 옮겼다.
    // 결과적으로 "스킬을 굴릴수록 버틸 여력이 생긴다"가 되어 의도는 살아 있다.
    uniqueEffect: { type: "manaRefund", chance: 0.35, ratio: 0.08, cooldownMs: 4000 },
    lore: "주술사의 마력석을 물린 반지. 흘러나간 마력이 되돌아온다."
  },
  abyssInkRing: {
    id: "abyssInkRing", slot: "ring", legendary: true,
    name: "심연 먹물반지",
    materials: { inkSac: 1, soulStone: 2 },
    bonus: { damageBonus: 0.03 },
    uniqueEffect: { type: "onHitStatus", statusId: "decay", chance: 0.25 },
    lore: "먹물낭을 봉인한 반지. 닿은 자리가 썩어 들어간다."
  },
  venomFangRing: {
    id: "venomFangRing", slot: "ring", legendary: true,
    name: "거미독 반지",
    materials: { spiderFang: 2, venomSac: 1 },
    bonus: { damageBonus: 0.03 },
    // 독에 걸린 적에게만 강해진다 — 독을 거는 수단과 함께 써야 값을 한다.
    uniqueEffect: { type: "statusExecute", statusId: "poison", bonus: 0.3, applyDecay: true },
    lore: "독니를 물린 반지. 독이 도는 상처를 더 깊게 헤집는다."
  },
  oniBreakerRing: {
    id: "oniBreakerRing", slot: "ring", legendary: true,
    name: "오니 파괴반지",
    materials: { oniHorn: 2, greatMandible: 1 },
    bonus: { damageBonus: 0.05 },
    // 같은 대상을 계속 때릴수록 관통이 쌓인다. 대상을 바꾸거나 손을 놓으면 초기화된다 —
    // 한 놈을 물고 늘어지는 운용을 보상한다.
    uniqueEffect: { type: "armorPierceStack", perStack: 0.03, maxStacks: 5, resetMs: 3000 },
    lore: "오니의 뿔을 깎아 박은 반지. 두드릴수록 갑주가 벌어진다."
  },
  dragonWardRing: {
    id: "dragonWardRing", slot: "ring", legendary: true,
    name: "고룡 수호반지",
    materials: { dragonBone: 1, dragonScale: 2 },
    bonus: { maxHpBonus: 0.09 },
    // 체력이 낮을수록 단단해진다 — 두 반지 탱킹 빌드의 한 축.
    uniqueEffect: { type: "lastStand", threshold: 0.4, armorBonus: 0.12 },
    lore: "용의 뼈를 깎은 반지. 궁지에 몰릴수록 단단해진다."
  },

  // --- 목걸이 2종 (3종째는 문서상 미정) ---
  foxCoreAmulet: {
    id: "foxCoreAmulet", slot: "necklace", legendary: true,
    name: "구미호 영핵 목걸이",
    materials: { spiritCore: 2, foxTail: 1, shamanStone: 1 },
    bonus: { maxHpBonus: 0.04, cooldownReduction: 0.03 },
    uniqueEffect: { type: "statusShrug", reduceMs: 1200 },
    lore: "영핵을 매단 목걸이. 몸에 붙은 것이 오래 머물지 못한다."
  },
  titanOathAmulet: {
    id: "titanOathAmulet", slot: "necklace", legendary: true,
    name: "거신의 맹세",
    materials: { golemCore: 1, ancientAlloy: 2, oniHorn: 1 },
    bonus: { damageBonus: 0.04, maxHpBonus: 0.04 },
    // 일정 횟수를 때릴 때마다 대상 주변이 터진다. 단일 대상을 치는 행위가
    // 주기적으로 광역이 되므로, "언제 터질지 세면서 몰아넣는" 운용이 생긴다.
    // 반지가 전부 자기 강화라면 목걸이는 전장의 모양을 바꾸는 쪽이다.
    uniqueEffect: { type: "chargedBurst", everyHits: 5, radius: 22, damageMultiplier: 1.6 },
    lore: "고대 병기의 동력핵을 심장 자리에 매단 목걸이. 벼른 힘이 다섯 번째에 터진다."
  },
  fallenRelicAmulet: {
    id: "fallenRelicAmulet", slot: "necklace", legendary: true,
    name: "몰락한 성유물 목걸이",
    materials: { fallenRelic: 1, soulStone: 2, taintedTome: 1 },
    bonus: { maxHpBonus: 0.05, manaRegenBonus: 0.3 },
    // 위급할 때 한 번 스스로를 정화한다. 내부 재사용 대기시간이 있다.
    uniqueEffect: { type: "desperateCleanse", threshold: 0.35, cooldownMs: 20000 },
    lore: "제국의 성유물. 무너지기 직전에 한 번 몸을 씻어준다."
  }
};

export const LEGENDARY_DEFS = {
  ...LEGENDARY_GEAR_DEFS,
  durandal: {
    id: "durandal", slot: "weapon", legendary: true, regionId: "west",
    name: "뒤랑달", baseClassId: "crusader", weaponType: "bastardSword",
    materials: { ingot: 8, blackSteel: 3, ore: 4 },
    bonus: { damageBonus: 0.07, armorBonus: 0.03 },
    lore: "부러지지 않는 성기사의 검. 롤랑의 전설에서 이름을 따왔다."
  },
  tyrfing: {
    id: "tyrfing", slot: "weapon", legendary: true, regionId: "west",
    name: "티르빙", baseClassId: "necromancer", weaponType: "armorSword",
    materials: { ingot: 6, blackSteel: 3, herb: 5 },
    bonus: { cooldownReduction: 0.05, damageBonus: 0.05 },
    lore: "뽑으면 반드시 피를 봐야 하는 저주받은 검. 북구 전승의 티르빙."
  },
  jotunbane: {
    id: "jotunbane", slot: "weapon", legendary: true, regionId: "north",
    name: "요툰베인", baseClassId: "barbarian", weaponType: "greataxe",
    materials: { ingot: 8, frostIron: 4, blackSteel: 2 },
    bonus: { damageBonus: 0.1, maxHpBonus: 0.06 },
    lore: "거인을 베어 넘긴 설산의 도끼. 북구의 거인 살해 전승에서."
  },
  caduceus: {
    id: "caduceus", slot: "weapon", legendary: true, regionId: "north",
    name: "카두케우스", baseClassId: "archmage", weaponType: "staff",
    materials: { wood: 6, frostIron: 3, herb: 4 },
    bonus: { cooldownReduction: 0.09, manaRegenBonus: 0.6 },
    lore: "두 마리 뱀이 감긴 전령의 지팡이. 마탑이 보관하던 유물."
  },
  moya: {
    id: "moya", slot: "weapon", legendary: true, regionId: "east",
    name: "막야", baseClassId: "maehwa", weaponType: "sabre",
    materials: { ingot: 5, mountainIron: 4, wood: 3 },
    bonus: { cooldownReduction: 0.06, damageBonus: 0.06 },
    lore: "장인 부부가 몸을 던져 벼려낸 자웅 한 쌍 중 하나. 동방 간장·막야 설화."
  },
  gandiva: {
    id: "gandiva", slot: "weapon", legendary: true, regionId: "south",
    name: "간디바", baseClassId: "tracker", weaponType: "shortBow",
    materials: { wood: 8, ingot: 4, herb: 5 },
    bonus: { damageBonus: 0.09, cooldownReduction: 0.04 },
    lore: "천 년을 시위가 늘어지지 않는 활. 남방 서사시의 대궁."
  },
  solomonSeal: {
    id: "solomonSeal", slot: "ring", legendary: true, regionId: "central",
    name: "솔로몬의 인장", baseClassId: null,
    materials: { glassSand: 5, ore: 4, herb: 4 },
    bonus: { maxHpBonus: 0.06, damageBonus: 0.04, manaRegenBonus: 0.3 },
    lore: "정령을 부리고 봉인했다는 반지. 사막 대상단이 전하는 이야기."
  }
};

// 전설 설계도가 열리는 클리어 횟수. 설계도 3단계(1~3회차)를 다 받은 뒤라
// 자연스럽게 장기 목표가 된다.
export const LEGENDARY_CLEAR_REQUIREMENT = 5;

export function legendaryDefinition(id) {
  return LEGENDARY_DEFS[id] || null;
}

export function legendariesForRegion(regionId) {
  return Object.values(LEGENDARY_DEFS).filter((entry) => entry.regionId === regionId);
}

// 컬렉션 진행도. 제작해서 실제로 보유한 전설 장비 기준으로 센다
// (설계도만 받은 건 아직 "모은 것"이 아니다).
export function legendaryCollection(commander = {}) {
  const owned = new Set((commander.equipmentOwned || []).map((entry) => entry?.defId));
  const all = Object.values(LEGENDARY_DEFS);
  const collected = all.filter((entry) => owned.has(entry.id));
  return {
    collected: collected.map((entry) => entry.id),
    collectedCount: collected.length,
    total: all.length,
    complete: collected.length === all.length
  };
}

// 전설 장비를 일반 장비 목록에 합쳐둔다. 제작·장착·보너스 합산이 전부
// EQUIPMENT_DEFS를 보고 돌아가므로, 이렇게 등록해두면 전설이라고 해서 별도
// 경로를 탈 필요가 없다(직업 제한·슬롯 규칙도 그대로 적용된다).
Object.assign(EQUIPMENT_DEFS, LEGENDARY_DEFS);

// 지역 진행용 목걸이도 같은 목록에 합친다 — 제작·장착이 일반 장비와 같은 경로를 탄다.
Object.assign(EQUIPMENT_DEFS, REGION_WARD_DEFS);

// 강함의 척도. 이 게임에는 레벨이 없으므로 "스탯 총량"이 성장의 눈금이 된다.
// 단위가 제각각이라(체력 60, 방어력 0.18, 치명타 0.055) 그대로 더할 수 없어
// 각 스탯을 같은 저울로 환산한 뒤 합친다. 가중치는 "전투에서 체감되는 크기"
// 기준이며, 절대값보다 **장비를 바꿨을 때 늘고 주는지**를 보기 위한 지표다.
const POWER_WEIGHTS = {
  maxHp: 1,
  damage: 12,
  armor: 220,            // 0.01 오르면 2.2
  criticalChance: 160,   // 1% 오르면 1.6
  criticalDamage: 40,    // 0.1배 오르면 4
  cooldownReduction: 200,
  speed: 3,
  statusResistance: 120,
  statusPotency: 30,
  manaRegen: 8,
  hpRegen: 20
};

export function combatPowerScore(stats = {}) {
  let total = 0;
  for (const [key, weight] of Object.entries(POWER_WEIGHTS)) {
    total += (Number(stats[key]) || 0) * weight;
  }
  // 공격 주기는 짧을수록 강하다. 기준 700ms 대비 얼마나 빠른지로 환산한다.
  const attackMs = Number(stats.attackMs) || 700;
  total += (700 / attackMs - 1) * 120;
  return Math.round(total);
}

// 스탯별 기여도. UI에서 "무엇이 내 전투력을 올리고 있는지" 보여줄 때 쓴다.
export function combatPowerBreakdown(stats = {}) {
  const rows = Object.entries(POWER_WEIGHTS)
    .map(([key, weight]) => ({ key, value: Number(stats[key]) || 0, score: Math.round((Number(stats[key]) || 0) * weight) }))
    .filter((row) => row.score !== 0);
  const attackMs = Number(stats.attackMs) || 700;
  const hasteScore = Math.round((700 / attackMs - 1) * 120);
  if (hasteScore !== 0) rows.push({ key: "attackMs", value: attackMs, score: hasteScore });
  return rows.sort((a, b) => b.score - a.score);
}

export function equipmentDefinition(equipmentId) {
  return EQUIPMENT_DEFS[equipmentId] || null;
}

// 장착 칸 id를 받아 거기 들어갈 수 있는 장비를 돌려준다(반지 1/2는 같은 목록).
export function equipmentForSlot(slotId) {
  const itemSlot = EQUIPMENT_SLOT_DEFS[slotId]?.itemSlot || slotId;
  return Object.values(EQUIPMENT_DEFS).filter((entry) => entry.slot === itemSlot);
}

// 장착 중인 장비의 보너스를 합산한다. 무기는 직업이 일치할 때만 계산에 들어간다
// (킷을 바꾼 뒤 장착 해제를 안 한 저장 상태가 있을 수 있어 여기서도 방어적으로 확인).
export function equippedBonuses(commander = {}, baseClassId = null) {
  // 장비가 줄 수 있는 스탯. 여기 없는 키는 장비에 적어도 조용히 무시된다.
  const totals = {
    // 기존 5종
    damageBonus: 0, cooldownReduction: 0, maxHpBonus: 0, armorBonus: 0, manaRegenBonus: 0,
    // 확장 6종 — 랜덤 옵션 풀을 넓히려면 소비처가 먼저 있어야 한다.
    criticalChance: 0,     // 치명타 확률
    criticalDamage: 0,     // 치명타 피해 배율 가산
    attackSpeedBonus: 0,   // 공격 주기 단축
    moveSpeedBonus: 0,     // 이동 속도
    statusResistBonus: 0,  // 내가 받는 상태이상 저항
    statusPowerBonus: 0    // 내가 거는 상태이상 위력
  };
  const equipped = commander.equipped || {};
  // 장착표는 인스턴스 uid를 담는다(같은 설계도로 만든 장비도 옵션이 제각각이라
  // 정의 id만으로는 어느 물건인지 특정할 수 없다).
  const equippedInstance = (slot) => findEquipmentInstance(commander, equipped[slot]);

  // 같은 물건이 두 칸에 동시에 잡히면 보너스가 두 번 더해진다(반지 1/2처럼 같은
  // 종류가 두 칸인 부위에서 생길 수 있다). uid 기준으로 한 번만 센다.
  const counted = new Set();

  for (const slotId of EQUIPMENT_SLOTS) {
    const slotDef = EQUIPMENT_SLOT_DEFS[slotId];
    const instance = equippedInstance(slotId);
    const definition = EQUIPMENT_DEFS[instance?.defId];
    if (!definition || definition.slot !== slotDef.itemSlot) continue;
    if (counted.has(instance.uid)) continue;
    if (slotDef.classLocked && baseClassId && definition.baseClassId !== baseClassId) continue;
    counted.add(instance.uid);
    for (const [key, value] of Object.entries(instanceBonuses(instance))) {
      if (totals[key] === undefined) continue;
      totals[key] += Number(value) || 0;
    }
  }

  // 세트 보너스: 한 세트의 조각을 전부 장착했을 때만 붙는다.
  const equippedDefIds = new Set(EQUIPMENT_SLOTS
    .map((slotId) => equippedInstance(slotId)?.defId)
    .filter(Boolean));
  for (const set of Object.values(ARMOR_SET_DEFS)) {
    const complete = set.pieces.every((pieceId) => equippedDefIds.has(pieceId));
    if (!complete) continue;
    for (const [key, value] of Object.entries(set.setBonus || {})) {
      if (totals[key] === undefined) continue;
      totals[key] += Number(value) || 0;
    }
  }
  return totals;
}

function grownValue(profile, key, level) {
  const base = Number(profile.base?.[key] || 0);
  const growth = Number(profile.growth?.[key] || 0);
  return base + growth * Math.max(0, level - 1);
}

export function playerCombatStats(commander = {}, kitId = commander.combatKitId) {
  const kit = playerKitDefinition(kitId);
  const baseClass = playerBaseClassDefinition(kit.baseClassId);
  const profile = baseClass.statProfile;
  const level = Math.max(1, Number(commander.level || 1));
  const strength = grownValue(profile, "strength", level);
  const agility = grownValue(profile, "agility", level);
  const intelligence = grownValue(profile, "intelligence", level);
  const defense = grownValue(profile, "defense", level);
  const divineAffinity = grownValue(profile, "divineAffinity", level);
  const natureAffinity = grownValue(profile, "natureAffinity", level);
  // 장착 중인 무기·방어구·장신구 보너스를 합산한다. 무기는 자기 직업과 일치할 때만
  // 계산에 들어간다(킷을 바꾼 뒤 장착 해제를 안 한 저장 상태 대비).
  const gear = equippedBonuses(commander, kit.baseClassId);
  const itemCooldownReduction = Math.max(0, Math.min(0.35,
    Number(commander.itemBonuses?.cooldownReduction || 0) + gear.cooldownReduction));
  // 치명타는 민첩에서 파생시킨다. 예전에는 statProfile.base.criticalChance를 읽었는데
  // 어떤 직업도 그 값을 정의하지 않아 항상 null이 나오는 죽은 경로였다.
  // 민첩 기반으로 두면 추적자·매화가 자연히 높고, 모든 직업이 값을 갖는다.
  // 상한 1.0 — 치명타 100%를 목표로 삼는 빌드가 가능해야 한다.
  const criticalChance = Math.max(0, Math.min(1,
    0.03 + agility * 0.005 + gear.criticalChance
    + Number(commander.itemBonuses?.criticalChance || 0)));
  // 치명타 피해 배율. 기본 1.5배에서 장비로 더 올린다.
  const criticalDamage = 1.5 + gear.criticalDamage;
  const rune = runeDefinition(commander.equippedRuneId);
  const maxHp = Math.round(kit.stats.maxHp + Math.max(0, level - 1) * (2.2 + strength * 0.055))
    * (rune?.id === "redRune" ? 1.08 : 1) * (1 + gear.maxHpBonus);
  const damage = Math.round(kit.stats.damage + Math.max(0, level - 1) * (0.26 + strength * 0.012 + intelligence * 0.01))
    * (rune?.id === "greenRune" ? 1.08 : 1) * (1 + gear.damageBonus);
  const armor = Math.min(0.58, kit.stats.armor + Math.max(0, level - 1) * 0.0025
    + (rune?.id === "yellowRune" ? 0.03 : 0) + gear.armorBonus);
  // 공격 주기는 짧을수록 빠르다. 장비 공격속도는 주기를 나눈다(합산이 아니라 배율).
  const attackMs = Math.max(280, Math.round(
    kit.stats.attackMs * (rune?.id === "purpleRune" ? 0.94 : 1) / (1 + gear.attackSpeedBonus)));
  // 이동 속도. 장판을 걸어서 피하는 게 기본 대응이라 전투 난이도에 직결된다.
  const speed = kit.stats.speed * (1 + gear.moveSpeedBonus);
  const manaRegen = grownValue(profile, "manaRegen", level) + (rune?.id === "blueRune" ? 0.6 : 0) + gear.manaRegenBonus;
  return {
    ...kit.stats,
    level,
    strength,
    agility,
    intelligence,
    defense,
    divineAffinity,
    natureAffinity,
    maxHp: Math.round(maxHp),
    // 정수로 반올림하지 않는다. 기본 공격력이 7 수준이라 반올림하면 +5% 같은
    // 보너스가 통째로 사라진다(심연의 대부 +12%가 7 -> 7이 되던 버그).
    // 실제 피해를 낼 때 Math.round를 한 번만 하도록 정밀도를 여기서 유지한다.
    damage: Math.round(damage * 100) / 100,
    armor,
    attackMs,
    hpRegen: grownValue(profile, "hpRegen", level),
    maxMana: Math.round(grownValue(profile, "maxMana", level)),
    manaRegen,
    statusResistance: Math.max(0, Math.min(0.75,
      grownValue(profile, "statusResistance", level) + gear.statusResistBonus)),
    statusPotency: 1 + intelligence * 0.02 + gear.statusPowerBonus,
    healingPower: 1 + defense * 0.012 + divineAffinity * 0.025,
    summonPower: 1 + intelligence * 0.018 + natureAffinity * 0.025 + (kit.inheritedId === "heavy" ? defense * 0.012 : 0),
    speed,
    criticalChance,
    criticalDamage,
    cooldownMultiplier: 1 - itemCooldownReduction,
    cooldownReduction: itemCooldownReduction,
    equippedRuneId: rune?.id || null,
    // 실제로 보너스가 적용된 무기만 돌려준다(직업 불일치 무기는 null).
    equippedWeaponId: (() => {
      const instance = findEquipmentInstance(commander, commander.equipped?.weapon);
      const weapon = equipmentDefinition(instance?.defId);
      return weapon && weapon.baseClassId === kit.baseClassId ? weapon.id : null;
    })(),
    equipped: { ...(commander.equipped || {}) }
  };
}

export function createDefaultCommander() {
  return {
    name: "개척자",
    level: 1,
    xp: 0,
    combatKitId: DEFAULT_PLAYER_KIT_ID,
    storedBoss: null,
    itemBonuses: {},
    runesOwned: [],
    equippedRuneId: null,
    // 설계도 → 제작 → 장착 3단계. 슬롯당 하나만 장착된다.
    unlockedBlueprints: [],
    equipmentOwned: [],
    equipped: createEmptyEquipped(),
    // 동료별 장착표. 보관함은 지휘관과 공유한다(쓰던 장비를 물려주는 구조).
    companionEquipped: {},
    skillLoadouts: Object.fromEntries(Object.values(PLAYER_KIT_DEFS).map((kit) => [kit.id, [...kit.defaultLoadout]]))
  };
}
