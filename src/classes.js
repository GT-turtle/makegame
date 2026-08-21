export const BASIC_DISCIPLINE_DEFS = {
  holy: { id: "holy", name: "신성", glyph: "✧", description: "보호·회복·심판을 다루는 계통" },
  spirit: { id: "spirit", name: "정령술", glyph: "♧", description: "정령 소환과 계약, 속성 변화를 함께 다루는 계통" },
  heavy: { id: "heavy", name: "중병기", glyph: "▰", description: "중검·중갑·경직과 전선 장악을 다루는 계통" },
  sword: { id: "sword", name: "검술", glyph: "刃", description: "연계·반격·발도 계통" },
  magic: { id: "magic", name: "마법", glyph: "✦", description: "마나와 룬으로 직접 주문을 다루는 계통" }
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
    }
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
    }
  }
};

export const PLAYER_KIT_DEFS = {
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
      { id: "thunderLance", name: "뇌정의 창", glyph: "ϟ", cooldownMs: 5400, effect: "thunderLance", description: "단일 적을 꿰뚫고 짧게 기절시킨다." },
      { id: "tempestJudgment", name: "폭풍의 심판", glyph: "✦", cooldownMs: 13800, effect: "tempestJudgment", description: "바람으로 적을 모은 뒤 넓은 약공격과 중심의 강공격을 함께 가한다." }
    ]
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
      { id: "bloodRend", name: "혈맥 절단", glyph: "⌁", cooldownMs: 4600, effect: "bloodRend", description: "단일 적을 공격하고 긴 출혈을 중첩시킨다." },
      { id: "storedApex", name: "봉인 우두머리", glyph: "☠", cooldownMs: 15000, effect: "storedApex", description: "마지막으로 저장한 우두머리 한 마리를 중갑·중병기로 강화해 소환한다." }
    ]
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
