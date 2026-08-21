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
      name: "수호의 순환",
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
      name: "영혼 수확",
      glyph: "◉",
      effect: "soulHarvest",
      maxStacks: 3,
      summonDamagePerStack: 0.08,
      durationMs: 12000,
      description: "적이 쓰러질 때 영혼을 최대 3개 수확한다. 영혼마다 소환수 공격력이 8% 증가하며 마지막 처치 12초 뒤 사라진다."
    },
    skills: [
      { id: "spiritDecay", name: "쇠약의 저주", glyph: "☣", cooldownMs: 6200, effect: "spiritDecay", description: "주변 적 전체에게 부패를 부여해 지속 피해를 입힌다." },
      { id: "spiritBolt", name: "영혼의 화살", glyph: "☄", cooldownMs: 4200, effect: "spiritBolt", description: "단일 적에게 영혼의 화살을 날린다." },
      { id: "spiritRaise", name: "망자 부활", glyph: "⚰", cooldownMs: 9000, effect: "spiritRaise", description: "이번 전투에서 쓰러진 적 최대 3마리를 자신의 능력치만큼 버프해 아군으로 되살린다. 전투당 1회만 쓸 수 있다." },
      { id: "spiritWard", name: "영혼 보호막", glyph: "◈", cooldownMs: 7000, effect: "spiritWard", description: "자신의 방어력을 높이고 소량 회복한다." }
    ],
    ultimate: { id: "spiritApex", name: "사령 강령", glyph: "☠", cooldownMs: 15000, effect: "storedApex", description: "저장해 둔 우두머리의 사념을 소환한다." }
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
      name: "격노",
      glyph: "Ϟ",
      effect: "rageScaling",
      damagePerMissing: 0.6,
      armorPerMissing: 0.15,
      hpRegenPerMissing: 1.5,
      description: "체력이 줄어들수록 공격력·방어력·체력 회복 속도가 함께 오른다."
    },
    skills: [
      { id: "battleRoar", name: "결의의 포효", glyph: "҂", cooldownMs: 7200, effect: "battleRoar", description: "짧은 시간 공격 속도와 이동 속도를 높인다. 체력이 낮을수록 효과가 커진다." },
      { id: "earthSlam", name: "대지 강타", glyph: "☗", cooldownMs: 6800, effect: "earthSlam", description: "자신 주변을 강타해 피해를 입힌다." },
      { id: "recklessCharge", name: "돌진", glyph: "➶", cooldownMs: 5600, effect: "recklessCharge", description: "목표에게 달려들어 피해를 입힌다." },
      { id: "cleave", name: "가로베기", glyph: "⚔", cooldownMs: 4400, effect: "cleave", description: "단일 적을 강하게 벤다." }
    ],
    ultimate: { id: "berserkerRage", name: "광전사의 격노", glyph: "Ϟ", cooldownMs: 14000, effect: "berserkerRage", description: "일정 시간 격노 효과가 크게 늘고 공격에 흡혈이 붙는다." }
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
    shortName: "정령 전사",
    glyph: "Ж",
    color: "#8a9f5a",
    baseClassId: "barbarian",
    primaryId: "heavy",
    inheritedId: "spirit",
    description: "야만적 힘에 정령의 야성을 더해 늑대인간으로 변신하는 전사.",
    passive: {
      id: "feralSpirit",
      name: "야성 정령",
      glyph: "Ж",
      description: "늑대인간으로 변신한 동안 받는 피해가 줄고 회복이 늘어난다."
    },
    stats: { maxHp: 70, damage: 11, range: 7, speed: 16, attackMs: 750, armor: 0.22, color: "#8a9f5a", glyph: "Ж" },
    defaultLoadout: ["rendingClaw", "sweepingClaw", "wildRecovery"],
    skills: [
      { id: "rendingClaw", name: "베기", glyph: "Ψ", cooldownMs: 4600, effect: "rendingClaw", description: "단일 적을 공격한다. 늑대형일 때는 먼저 달려든다." },
      { id: "sweepingClaw", name: "휩쓸기", glyph: "❋", cooldownMs: 6600, effect: "sweepingClaw", description: "자신 주변을 공격한다. 늑대형일 때 위력이 커진다." },
      { id: "wildRecovery", name: "야생의 회복", glyph: "✚", cooldownMs: 8200, effect: "wildRecovery", description: "스스로를 회복하고 짧은 지속 회복을 얻는다." },
      { id: "menacingRoar", name: "위협의 포효", glyph: "҂", cooldownMs: 7400, effect: "menacingRoar", description: "주변 적을 위협해 잠시 묶어 둔다." }
    ],
    ultimate: { id: "werewolfForm", name: "늑대인간 변신", glyph: "Ж", cooldownMs: 16000, effect: "werewolfForm", description: "늑대인간으로 변신해 공격력·방어력·속도가 오르고 공격에 출혈이 붙는다." }
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
      name: "정령 성벽",
      glyph: "♧",
      description: "기술을 사용할 때마다 잠시 받는 피해가 감소한다. 방어 기술은 동료에게도 적용된다."
    },
    stats: { maxHp: 58, damage: 8, range: 12, speed: 17, attackMs: 650, armor: 0.22, color: "#83b89a", glyph: "♜" },
    defaultLoadout: ["spiritMending", "winterAegis", "sacredWildfire"],
    skills: [
      { id: "spiritMending", name: "정령의 치유", glyph: "✚", cooldownMs: 6200, effect: "spiritMending", description: "가장 다친 아군을 크게 회복하고 지속 회복을 부여하며 해로운 효과 하나를 해제한다." },
      { id: "winterAegis", name: "서리 수호진", glyph: "❄", cooldownMs: 8200, effect: "winterAegis", description: "아군 전체의 방어를 높이고 공격한 적에게 빙결 중첩을 되돌린다." },
      { id: "sacredWildfire", name: "성화 폭발", glyph: "♨", cooldownMs: 7600, effect: "sacredWildfire", description: "주변을 폭발시킨 뒤 짧고 강한 화상을 갱신하는 불 장판을 남긴다." },
      { id: "thunderLance", name: "뇌정의 창", glyph: "ϟ", cooldownMs: 5400, effect: "thunderLance", description: "단일 적을 꿰뚫고 짧게 기절시킨다." }
    ],
    ultimate: { id: "tempestJudgment", name: "폭풍의 심판", glyph: "✦", cooldownMs: 13800, effect: "tempestJudgment", description: "바람으로 적을 모은 뒤 넓은 약공격과 중심의 강공격을 함께 가한다." }
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
      name: "철갑 사령",
      glyph: "▰",
      description: "부활·봉인 소환수는 종별 중병기와 추가 방어를 얻고, 기술을 사용할 때마다 조금 회복한다."
    },
    stats: { maxHp: 46, damage: 9, range: 13, speed: 16, attackMs: 720, armor: 0.15, color: "#9d89b5", glyph: "☠" },
    defaultLoadout: ["armoredDecay", "armedResurrection", "boneArmor"],
    skills: [
      { id: "armoredDecay", name: "갑주 부패", glyph: "☣", cooldownMs: 5200, effect: "armoredDecay", description: "단일 적에게 부패를 부여하고 방어력을 함께 깎는다." },
      { id: "armedResurrection", name: "무장 부활", glyph: "⚔", cooldownMs: 6800, effect: "armedResurrection", description: "이번 전투에서 쓰러진 일반 적을 무장 망자로 되살린다. 최대 3기." },
      { id: "boneArmor", name: "뼈 갑옷", glyph: "▣", cooldownMs: 7600, effect: "boneArmor", description: "생존한 아군 전원에게 회전하는 뼈 방패와 방어력 증가를 부여한다." },
      { id: "bloodRend", name: "혈맥 절단", glyph: "⌁", cooldownMs: 4600, effect: "bloodRend", description: "단일 적을 공격하고 긴 출혈을 중첩시킨다." }
    ],
    ultimate: { id: "storedApex", name: "봉인 우두머리", glyph: "☠", cooldownMs: 15000, effect: "storedApex", description: "마지막으로 저장한 우두머리 한 마리를 중갑·중병기로 강화해 소환한다." }
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
  return {
    ...kit.stats,
    level,
    strength,
    agility,
    intelligence,
    defense,
    divineAffinity,
    natureAffinity,
    maxHp: Math.round(kit.stats.maxHp + Math.max(0, level - 1) * (2.2 + strength * 0.055)),
    damage: Math.round(kit.stats.damage + Math.max(0, level - 1) * (0.26 + strength * 0.012 + intelligence * 0.01)),
    armor: Math.min(0.58, kit.stats.armor + Math.max(0, level - 1) * 0.0025),
    hpRegen: grownValue(profile, "hpRegen", level),
    maxMana: Math.round(grownValue(profile, "maxMana", level)),
    manaRegen: grownValue(profile, "manaRegen", level),
    statusResistance: Math.max(0, Math.min(0.6, grownValue(profile, "statusResistance", level))),
    statusPotency: 1 + intelligence * 0.02,
    healingPower: 1 + defense * 0.012 + divineAffinity * 0.025,
    summonPower: 1 + intelligence * 0.018 + natureAffinity * 0.025 + (kit.inheritedId === "heavy" ? defense * 0.012 : 0),
    criticalChance,
    cooldownMultiplier: 1 - itemCooldownReduction,
    cooldownReduction: itemCooldownReduction
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
    skillLoadouts: Object.fromEntries(Object.values(PLAYER_KIT_DEFS).map((kit) => [kit.id, [...kit.defaultLoadout]]))
  };
}
