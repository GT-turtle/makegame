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
      { id: "earthSlam", name: "회전베기", glyph: "☗", cooldownMs: 6800, effect: "earthSlam", description: "자신 주변을 강타해 피해를 입힌다." },
      { id: "recklessCharge", name: "돌진", glyph: "➶", cooldownMs: 5600, effect: "recklessCharge", description: "목표에게 달려들어 피해를 입힌다." },
      { id: "cleave", name: "뚝배기", glyph: "⚔", cooldownMs: 4400, effect: "cleave", description: "단일 적을 강하게 벤다." }
    ],
    ultimate: { id: "berserkerRage", name: "광폭화", glyph: "Ϟ", cooldownMs: 14000, effect: "berserkerRage", description: "일정 시간 격노 효과가 크게 늘고 공격에 흡혈이 붙는다." }
  },
  tracker: {
    id: "tracker",
    name: "추적자",
    glyph: "➹",
    disciplineId: "archery",
    statProfile: {
      base: { strength: 6, agility: 16, intelligence: 6, defense: 5, divineAffinity: 0, natureAffinity: 6, hpRegen: 0.14, maxMana: 30, manaRegen: 0.8 },
      growth: { strength: 0.4, agility: 1.4, intelligence: 0.5, defense: 0.35, natureAffinity: 0.5, hpRegen: 0.01, maxMana: 1.2, manaRegen: 0.03 }
    },
    passive: {
      id: "huntersShadow",
      name: "은신 감각",
      glyph: "➹",
      effect: "stealthWhenIdle",
      idleMs: 3000,
      description: "적과 3초 이상 접촉이 없으면 은신한다. 은신 중 공격은 치명적이다."
    },
    skills: [
      { id: "aimedShot", name: "조준 사격", glyph: "➶", cooldownMs: 3800, effect: "aimedShot", description: "단일 적을 원거리에서 저격한다." },
      { id: "scatterShot", name: "산탄 사격", glyph: "❋", cooldownMs: 6400, effect: "scatterShot", description: "부채꼴 범위의 적에게 원거리 피해를 입힌다." },
      { id: "shadowStrike", name: "그림자 강타", glyph: "☾", cooldownMs: 5200, effect: "shadowStrike", description: "체력이 낮은 적에게 추가 피해를 입힌다." },
      { id: "vanish", name: "은신 잠입", glyph: "✧", cooldownMs: 9000, effect: "vanish", description: "즉시 은신 상태가 되어 다음 공격을 강화한다." }
    ],
    ultimate: { id: "arrowStorm", name: "일제 사격", glyph: "➹", cooldownMs: 13000, effect: "arrowStorm", description: "넓은 범위에 화살을 퍼부어 큰 피해를 입힌다." }
  },
  maehwa: {
    id: "maehwa",
    name: "매화",
    glyph: "❀",
    disciplineId: "sword",
    statProfile: {
      base: { strength: 9, agility: 15, intelligence: 5, defense: 6, divineAffinity: 0, natureAffinity: 3, hpRegen: 0.18, maxMana: 26, manaRegen: 0.6 },
      growth: { strength: 0.7, agility: 1.3, intelligence: 0.4, defense: 0.4, hpRegen: 0.015, maxMana: 1, manaRegen: 0.025 }
    },
    passive: {
      id: "windStep",
      name: "일보 신법",
      glyph: "❀",
      effect: "dodgeChance",
      chance: 0.18,
      description: "일정 확률로 상대의 공격을 완전히 회피한다."
    },
    skills: [
      { id: "swiftStrike", name: "쾌속검", glyph: "⚔", cooldownMs: 5200, effect: "swiftStrike", description: "목표에게 순식간에 접근해 벤다." },
      { id: "whirlwindSlash", name: "선풍참", glyph: "❋", cooldownMs: 6600, effect: "whirlwindSlash", description: "자신 주변을 회전하며 벤다." },
      { id: "phantomCut", name: "환영 베기", glyph: "☾", cooldownMs: 6000, effect: "phantomCut", description: "목표의 이로운 효과를 지우고 크게 벤다." },
      { id: "fleetStep", name: "쾌보", glyph: "➶", cooldownMs: 8000, effect: "fleetStep", description: "짧은 시간 공격 속도를 크게 높인다." }
    ],
    ultimate: { id: "plumBlossomDance", name: "매화검무", glyph: "❀", cooldownMs: 12500, effect: "plumBlossomDance", description: "목표의 방어를 무너뜨리며 그만큼 강하게 벤다." }
  },
  archmage: {
    id: "archmage",
    name: "아크메이지",
    glyph: "✦",
    disciplineId: "magic",
    statProfile: {
      base: { strength: 3, agility: 6, intelligence: 17, defense: 4, divineAffinity: 0, natureAffinity: 4, hpRegen: 0.12, maxMana: 130, manaRegen: 2.0 },
      growth: { strength: 0.2, agility: 0.4, intelligence: 1.5, defense: 0.3, hpRegen: 0.008, maxMana: 6, manaRegen: 0.08 }
    },
    passive: {
      id: "manaCirculation",
      name: "마나 순환",
      glyph: "✦",
      effect: "manaFocus",
      damagePerMana: 0.4,
      description: "보유한 마나가 많을수록 마법 공격력이 오른다."
    },
    skills: [
      { id: "fireBolt", name: "화염 창", glyph: "♨", cooldownMs: 4400, effect: "fireBolt", description: "단일 적에게 화염 피해를 입히고 화상을 남긴다." },
      { id: "frostNova", name: "빙결 폭발", glyph: "❄", cooldownMs: 6800, effect: "frostNova", description: "주변 적에게 냉기 피해를 입히고 빙결시킨다." },
      { id: "manaShield", name: "마나 보호막", glyph: "◈", cooldownMs: 9000, effect: "manaShield", description: "마나를 소모해 피해를 흡수하는 보호막을 두른다." },
      { id: "manaFocusSkill", name: "마나 집중", glyph: "✧", cooldownMs: 7000, effect: "manaFocusSkill", description: "마나를 회복하고 스스로를 조금 치유한다." }
    ],
    ultimate: { id: "lightningCage", name: "번개 감옥", glyph: "ϟ", cooldownMs: 13500, effect: "lightningCage", description: "좁은 범위에 벼락을 내리쳐 큰 피해를 입히고 기절시킨다." }
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
    description: "아직 보조 계통을 배우지 않은 순수 대검 바바리안.",
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
    defaultLoadout: ["fireBolt", "frostNova", "manaShield"],
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
      name: "그림자 검",
      glyph: "➹",
      effect: "stealthWhenIdle",
      idleMs: 2000,
      description: "적과 2초 이상 접촉이 없으면 은신한다. 은신 중 공격은 치명적이다."
    },
    stats: { maxHp: 38, damage: 10, range: 8, speed: 18, attackMs: 580, armor: 0.09, color: "#6a6f8f", glyph: "❀" },
    defaultLoadout: ["swiftStrike", "shadowExecution", "phantomCut"],
    skills: [
      { id: "swiftStrike", name: "쾌속검", glyph: "⚔", cooldownMs: 5200, effect: "swiftStrike", description: "목표에게 순식간에 접근해 벤다." },
      { id: "shadowExecution", name: "그림자 처형", glyph: "☾", cooldownMs: 6600, effect: "shadowExecution", description: "체력이 낮은 적을 즉시 처형하듯 크게 벤다." },
      { id: "phantomCut", name: "환영 베기", glyph: "☾", cooldownMs: 6000, effect: "phantomCut", description: "목표의 이로운 효과를 지우고 크게 벤다." },
      { id: "fleetStep", name: "쾌보", glyph: "➶", cooldownMs: 8000, effect: "fleetStep", description: "짧은 시간 공격 속도를 크게 높인다." }
    ],
    ultimate: { id: "oneShotKill", name: "일격필살", glyph: "❀", cooldownMs: 14000, effect: "oneShotKill", description: "목표에게 필살의 일격을 가한다. 은신 중이라면 위력이 크게 늘어난다." }
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
      name: "원소 검환",
      glyph: "✦",
      description: "베는 공격에 원소의 힘이 실린다."
    },
    stats: { maxHp: 40, damage: 9, range: 9, speed: 16, attackMs: 620, armor: 0.1, color: "#8a6fb0", glyph: "❀" },
    defaultLoadout: ["elementalStrike", "elementalWhirl", "phantomCut"],
    skills: [
      { id: "elementalStrike", name: "화염검 일섬", glyph: "♨", cooldownMs: 5200, effect: "elementalStrike", description: "목표에게 접근해 화염이 실린 일격을 가한다." },
      { id: "elementalWhirl", name: "빙결검 선풍", glyph: "❄", cooldownMs: 6600, effect: "elementalWhirl", description: "자신 주변을 냉기로 휩쓴다." },
      { id: "phantomCut", name: "환영 베기", glyph: "☾", cooldownMs: 6000, effect: "phantomCut", description: "목표의 이로운 효과를 지우고 크게 벤다." },
      { id: "fleetStep", name: "쾌보", glyph: "➶", cooldownMs: 8000, effect: "fleetStep", description: "짧은 시간 공격 속도를 크게 높인다." }
    ],
    ultimate: { id: "elementalBlade", name: "마검 폭풍", glyph: "✦", cooldownMs: 12500, effect: "elementalBlade", description: "목표의 방어를 무너뜨리며 원소 폭발을 일으킨다." }
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
      name: "원소 계약",
      glyph: "♧",
      description: "상태이상의 위력과 지속시간이 늘어난다."
    },
    stats: { maxHp: 32, damage: 9, range: 24, speed: 13, attackMs: 900, armor: 0.05, color: "#6ab08f", glyph: "✦" },
    defaultLoadout: ["fireBolt", "frostNova", "spiritBond"],
    skills: [
      { id: "fireBolt", name: "화염 창", glyph: "♨", cooldownMs: 4400, effect: "fireBolt", description: "단일 적에게 화염 피해를 입히고 화상을 남긴다." },
      { id: "frostNova", name: "빙결 폭발", glyph: "❄", cooldownMs: 6800, effect: "frostNova", description: "주변 적에게 냉기 피해를 입히고 빙결시킨다." },
      { id: "spiritBond", name: "정령 결속", glyph: "♧", cooldownMs: 8600, effect: "spiritBond", description: "마나를 소모해 작은 정령을 소환한다." },
      { id: "manaShield", name: "마나 보호막", glyph: "◈", cooldownMs: 9000, effect: "manaShield", description: "마나를 소모해 피해를 흡수하는 보호막을 두른다." }
    ],
    ultimate: { id: "elementalConvergence", name: "삼원소 심판", glyph: "✦", cooldownMs: 14000, effect: "elementalConvergence", description: "목표 주변에 화염·냉기·부패를 함께 퍼붓는다." }
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
      name: "신성 회로",
      glyph: "✧",
      description: "보유한 마나가 많을수록 회복력이 오른다."
    },
    stats: { maxHp: 34, damage: 8, range: 22, speed: 14, attackMs: 880, armor: 0.06, color: "#c0a866", glyph: "✦" },
    defaultLoadout: ["sacredBolt", "purifyingWave", "healingWord"],
    skills: [
      { id: "sacredBolt", name: "성스러운 화살", glyph: "✧", cooldownMs: 4600, effect: "sacredBolt", description: "단일 적에게 신성 피해를 입히고 스스로를 조금 회복한다." },
      { id: "purifyingWave", name: "정화의 파동", glyph: "☼", cooldownMs: 6800, effect: "purifyingWave", description: "주변 적에게 신성 피해를 입힌다." },
      { id: "healingWord", name: "치유의 주문", glyph: "✚", cooldownMs: 6200, effect: "healingWord", description: "마나를 소모해 가장 다친 아군을 회복한다." },
      { id: "manaShield", name: "마나 보호막", glyph: "◈", cooldownMs: 9000, effect: "manaShield", description: "마나를 소모해 피해를 흡수하는 보호막을 두른다." }
    ],
    ultimate: { id: "heavenlyJudgment", name: "천상의 심판", glyph: "✦", cooldownMs: 14000, effect: "heavenlyJudgment", description: "목표 주변에 신성 파도를 일으키고 아군 전체를 회복시킨다." }
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
      name: "정령의 은신",
      glyph: "➹",
      effect: "stealthWhenIdle",
      idleMs: 3000,
      description: "적과 3초 이상 접촉이 없으면 은신한다. 은신 중 공격은 치명적이다."
    },
    stats: { maxHp: 36, damage: 9, range: 23, speed: 15, attackMs: 800, armor: 0.06, color: "#6aa0a8", glyph: "➹" },
    defaultLoadout: ["elementalArrow", "scatterShot", "shadowStrike"],
    skills: [
      { id: "elementalArrow", name: "정령 화살", glyph: "♧", cooldownMs: 3800, effect: "elementalArrow", description: "단일 적을 저격하고 무작위 상태이상을 부여한다." },
      { id: "scatterShot", name: "산탄 사격", glyph: "❋", cooldownMs: 6400, effect: "scatterShot", description: "부채꼴 범위의 적에게 원거리 피해를 입힌다." },
      { id: "shadowStrike", name: "그림자 강타", glyph: "☾", cooldownMs: 5200, effect: "shadowStrike", description: "체력이 낮은 적에게 추가 피해를 입힌다." },
      { id: "vanish", name: "은신 잠입", glyph: "✧", cooldownMs: 9000, effect: "vanish", description: "즉시 은신 상태가 되어 다음 공격을 강화한다." }
    ],
    ultimate: { id: "elementalVolley", name: "정령 일제 사격", glyph: "➹", cooldownMs: 13000, effect: "elementalVolley", description: "넓은 범위에 정령 화살을 퍼부어 상태이상을 함께 남긴다." }
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
      name: "고정 포대",
      glyph: "▰",
      description: "포격 모드인 동안 기술을 사용할 때마다 방어력이 잠시 더 오른다."
    },
    stats: { maxHp: 48, damage: 10, range: 21, speed: 12, attackMs: 900, armor: 0.19, color: "#a08a5a", glyph: "➹" },
    defaultLoadout: ["aimedShot", "suppressingShot", "siegeStance"],
    skills: [
      { id: "aimedShot", name: "조준 사격", glyph: "➶", cooldownMs: 3800, effect: "aimedShot", description: "단일 적을 원거리에서 저격한다." },
      { id: "suppressingShot", name: "제압 사격", glyph: "☗", cooldownMs: 5800, effect: "suppressingShot", description: "단일 적에게 피해를 입히고 잠시 묶어 둔다." },
      { id: "siegeStance", name: "포격 태세", glyph: "❖", cooldownMs: 9000, effect: "siegeStance", description: "포격 모드로 전환한다. 이동·공격 속도가 느려지지만 방어력이 크게 오르고 산탄 사격·관통 사격의 위력이 강해진다." },
      { id: "scatterShot", name: "산탄 사격", glyph: "❋", cooldownMs: 6400, effect: "scatterShot", description: "부채꼴 범위의 적에게 원거리 피해를 입힌다. 포격 모드에서는 범위와 위력이 늘어난다." }
    ],
    ultimate: { id: "piercingShot", name: "관통 사격", glyph: "➹", cooldownMs: 13500, effect: "piercingShot", description: "강력한 화살로 목표를 꿰뚫어 큰 피해를 입히고 묶어 둔다. 포격 모드에서는 위력이 더 강해진다." }
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
  const itemCooldownReduction = Math.max(0, Math.min(0.35, Number(commander.itemBonuses?.cooldownReduction || 0)));
  const criticalChance = baseClass.statProfile.base.criticalChance == null
    ? null
    : Math.max(0, grownValue(profile, "criticalChance", level) + Number(commander.itemBonuses?.criticalChance || 0));
  const rune = runeDefinition(commander.equippedRuneId);
  const maxHp = Math.round(kit.stats.maxHp + Math.max(0, level - 1) * (2.2 + strength * 0.055)) * (rune?.id === "redRune" ? 1.08 : 1);
  const damage = Math.round(kit.stats.damage + Math.max(0, level - 1) * (0.26 + strength * 0.012 + intelligence * 0.01)) * (rune?.id === "greenRune" ? 1.08 : 1);
  const armor = Math.min(0.58, kit.stats.armor + Math.max(0, level - 1) * 0.0025 + (rune?.id === "yellowRune" ? 0.03 : 0));
  const attackMs = Math.max(280, Math.round(kit.stats.attackMs * (rune?.id === "purpleRune" ? 0.94 : 1)));
  const manaRegen = grownValue(profile, "manaRegen", level) + (rune?.id === "blueRune" ? 0.6 : 0);
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
    damage: Math.round(damage),
    armor,
    attackMs,
    hpRegen: grownValue(profile, "hpRegen", level),
    maxMana: Math.round(grownValue(profile, "maxMana", level)),
    manaRegen,
    statusResistance: Math.max(0, Math.min(0.6, grownValue(profile, "statusResistance", level))),
    statusPotency: 1 + intelligence * 0.02,
    healingPower: 1 + defense * 0.012 + divineAffinity * 0.025,
    summonPower: 1 + intelligence * 0.018 + natureAffinity * 0.025 + (kit.inheritedId === "heavy" ? defense * 0.012 : 0),
    criticalChance,
    cooldownMultiplier: 1 - itemCooldownReduction,
    cooldownReduction: itemCooldownReduction,
    equippedRuneId: rune?.id || null
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
    skillLoadouts: Object.fromEntries(Object.values(PLAYER_KIT_DEFS).map((kit) => [kit.id, [...kit.defaultLoadout]]))
  };
}
