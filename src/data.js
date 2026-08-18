export const WORLD_SIZE = 31;
export const VIEW_SIZE = 9;
export const MAP_SIZE = WORLD_SIZE;
export const BAG_COLS = 5;
export const BASE_BAG_ROWS = 4;
export const BEACON_GOAL = 3;

export const TAG_LABELS = {
  weapon: "무기",
  defense: "방어",
  gear: "장비",
  tool: "도구",
  alchemy: "연금",
  fire: "화염",
  device: "장치",
  crystal: "결정",
  rune: "룬",
  utility: "탐사",
  active: "사용 가능"
};

export const ITEM_DEFS = {
  blade: {
    id: "blade",
    name: "낡은 장검",
    glyph: "†",
    color: "#a99573",
    mask: [[1], [1]],
    tags: ["weapon"],
    baseText: "공격할 때 피해를 3 추가한다.",
    linkText: "숫돌·독병·불씨와 맞닿으면 해당 효과가 강화된다."
  },
  buckler: {
    id: "buckler",
    name: "철제 버클러",
    glyph: "◇",
    color: "#72858a",
    mask: [[1, 1]],
    tags: ["defense"],
    baseText: "피해를 받을 때 2를 막는다. 재사용 2턴.",
    linkText: "결정과 맞닿으면 막는 양이 1 증가한다."
  },
  boots: {
    id: "boots",
    name: "원정 장화",
    glyph: "⌁",
    color: "#867052",
    mask: [[1], [1]],
    tags: ["gear"],
    baseText: "세 칸 이동할 때마다 회피 1회를 얻는다.",
    linkText: "장치와 맞닿으면 이동 충전도 함께 진행한다."
  },
  whetstone: {
    id: "whetstone",
    name: "거친 숫돌",
    glyph: "▰",
    color: "#777d73",
    mask: [[1]],
    tags: ["tool"],
    baseText: "맞닿은 무기 하나마다 공격 피해가 1 증가한다.",
    linkText: "무기 두 개에 동시에 닿으면 추가로 피해가 1 증가한다."
  },
  venom: {
    id: "venom",
    name: "독성 증류병",
    glyph: "♢",
    color: "#6a9b65",
    mask: [[1]],
    tags: ["alchemy"],
    baseText: "공격할 때 중독을 1 부여한다.",
    linkText: "무기와 맞닿으면 중독을 1 더 부여한다."
  },
  ember: {
    id: "ember",
    name: "꺼지지 않는 불씨",
    glyph: "✦",
    color: "#c46845",
    mask: [[1]],
    tags: ["fire", "crystal"],
    baseText: "두 번째 공격마다 화상 피해를 1 추가한다.",
    linkText: "무기와 맞닿으면 화상 피해가 1 증가한다."
  },
  lantern: {
    id: "lantern",
    name: "광맥 랜턴",
    glyph: "◉",
    color: "#d0aa55",
    mask: [[1], [1]],
    tags: ["utility", "device"],
    baseText: "시야 반경이 1 증가한다.",
    linkText: "결정과 맞닿으면 숨겨진 보급함을 멀리서 감지한다."
  },
  coil: {
    id: "coil",
    name: "전도 코일",
    glyph: "ϟ",
    color: "#5d91ad",
    mask: [[1, 1], [0, 1]],
    tags: ["device"],
    baseText: "세 칸 이동하면 충전된다. 다음 공격에 감전 피해 2.",
    linkText: "장화와 맞닿으면 더 빨리 충전되고, 결정과 맞닿으면 필요 충전량이 줄어든다."
  },
  crystal: {
    id: "crystal",
    name: "공명 결정",
    glyph: "◆",
    color: "#8274b5",
    mask: [[1]],
    tags: ["crystal"],
    baseText: "세 턴마다 받는 피해를 1 막는다.",
    linkText: "맞닿은 방어구와 장치의 효과를 강화한다."
  },
  herbKit: {
    id: "herbKit",
    name: "야전 약초함",
    glyph: "+",
    color: "#6f9a73",
    mask: [[1, 1]],
    tags: ["alchemy", "active"],
    baseText: "직접 사용해 체력을 6 회복한다. 원정당 2회.",
    linkText: "다른 연금 아이템과 맞닿으면 회복량이 2 증가한다."
  },
  armor: {
    id: "armor",
    name: "층철 갑옷",
    glyph: "▣",
    color: "#66767c",
    mask: [[1, 1], [1, 0]],
    tags: ["defense"],
    baseText: "공격받을 때마다 피해를 1 막는다.",
    linkText: "버클러와 맞닿으면 버클러의 재사용 대기가 1턴 줄어든다."
  },
  scavengerCharm: {
    id: "scavengerCharm",
    name: "수집가의 부적",
    glyph: "⌘",
    color: "#b28c53",
    mask: [[1]],
    tags: ["utility"],
    baseText: "적을 처치할 때 고철을 1 추가로 얻는다.",
    linkText: "도구와 맞닿으면 보급함에서도 고철을 1 더 얻는다."
  },
  frontierMantle: {
    id: "frontierMantle",
    name: "개척자의 겹망토",
    glyph: "≋",
    color: "#8f7658",
    mask: [[1, 1]],
    tags: ["gear", "alchemy"],
    environment: { heat: 1, cold: 1 },
    baseText: "고온과 한기 압력을 각각 1 줄인다.",
    linkText: "연금 장비와 맞닿으면 환경 회복약의 효과가 강화된다."
  },
  sporeMask: {
    id: "sporeMask",
    name: "포자 여과면",
    glyph: "◌",
    color: "#66856b",
    mask: [[1]],
    tags: ["tool", "alchemy"],
    environment: { toxin: 2 },
    baseText: "독성 압력을 2 줄인다.",
    linkText: "장치와 맞닿으면 부식성 지형 피해를 1 막는다."
  },
  knightAegis: {
    id: "knightAegis",
    name: "개척 기사 대방패",
    glyph: "▱",
    color: "#71808a",
    mask: [[1, 1], [1, 1]],
    tags: ["defense", "rune"],
    environment: { cold: 1, corruption: 1 },
    classAffinity: "knight",
    baseText: "피해를 받을 때 2를 추가로 막는다.",
    linkText: "방어 장비와 밀집 배치하면 기사 기술의 방어량이 증가한다."
  },
  barbarianAxe: {
    id: "barbarianAxe",
    name: "혈철 파쇄도끼",
    glyph: "⚒",
    color: "#a45f4d",
    mask: [[1, 1], [0, 1]],
    tags: ["weapon"],
    environment: { heat: 1, cold: 1 },
    classAffinity: "barbarian",
    baseText: "공격할 때 피해를 4 추가한다.",
    linkText: "주변에 다른 무기가 없으면 피해가 1 증가한다."
  },
  mechanicRig: {
    id: "mechanicRig",
    name: "황동 환경 제어기",
    glyph: "⚙",
    color: "#b28a53",
    mask: [[1, 1], [1, 0]],
    tags: ["device", "tool"],
    environment: { heat: 2, toxin: 1 },
    classAffinity: "mechanic",
    baseText: "고온 압력을 2, 독성 압력을 1 줄인다.",
    linkText: "장치와 연결할수록 메카닉 기술의 동력 소모가 감소한다."
  },
  martialWraps: {
    id: "martialWraps",
    name: "청류 경맥포",
    glyph: "〽",
    color: "#769a91",
    mask: [[1], [1]],
    tags: ["gear", "rune"],
    environment: { toxin: 1, corruption: 2 },
    classAffinity: "martial",
    baseText: "세 칸 이동할 때마다 내공을 가다듬어 회피 1회를 얻는다.",
    linkText: "양옆이 비어 있으면 무인 기술의 숙련 경험치가 증가한다."
  },
  wardenLens: {
    id: "wardenLens",
    name: "감시자의 룬안",
    glyph: "◈",
    color: "#a47db4",
    mask: [[1]],
    tags: ["crystal", "rune", "utility"],
    environment: { corruption: 3 },
    baseText: "오염 압력을 3 줄이고 시야 안의 정예를 표시한다.",
    linkText: "장치 또는 방어 장비와 맞닿으면 해당 장비의 효과가 강화된다."
  }
};

export const CLASS_DEFS = {
  knight: {
    id: "knight",
    name: "기사",
    glyph: "♜",
    color: "#7d91a1",
    resourceName: "태세",
    resourceMax: 6,
    description: "막기와 반격, 밀집된 방어 장비로 전선을 유지한다.",
    environment: { cold: 1, corruption: 1 },
    skill: { id: "ironStance", name: "철벽 태세", glyph: "▣", cost: 2, cooldown: 3, description: "방어를 얻고 오염 압력을 낮춘다." }
  },
  barbarian: {
    id: "barbarian",
    name: "야만인",
    glyph: "Ƶ",
    color: "#b9654f",
    resourceName: "분노",
    resourceMax: 7,
    description: "피해와 위험을 분노로 바꾸고 거대한 무기로 길을 연다.",
    environment: { heat: 1, cold: 1 },
    skill: { id: "breaker", name: "파쇄 강타", glyph: "⚒", cost: 3, cooldown: 2, description: "인접한 적에게 강한 피해를 준다." }
  },
  mechanic: {
    id: "mechanic",
    name: "메카닉",
    glyph: "⚙",
    color: "#c39a59",
    resourceName: "동력",
    resourceMax: 8,
    description: "장치 회로와 자동 포탑으로 전장과 환경을 제어한다.",
    environment: { heat: 1, toxin: 1 },
    skill: { id: "sentryBurst", name: "자동 포탑", glyph: "⌾", cost: 3, cooldown: 3, description: "시야 안에서 가장 가까운 적을 사격한다." }
  },
  martial: {
    id: "martial",
    name: "무인",
    glyph: "武",
    color: "#78a096",
    resourceName: "내공",
    resourceMax: 6,
    description: "경공과 기혈 순환, 숙련된 초식으로 위험을 흘려낸다.",
    environment: { toxin: 1, corruption: 1 },
    skill: { id: "meridianFlow", name: "기혈 순환", glyph: "◎", cost: 2, cooldown: 3, description: "체력과 환경 압력을 회복하고 회피를 얻는다." }
  }
};

export const TRAIT_DEFS = {
  duneBorn: { id: "duneBorn", name: "사막 태생", description: "고온 압력 -1", environment: { heat: 1 } },
  mineBorn: { id: "mineBorn", name: "광산촌 출신", description: "독성 압력 -1", environment: { toxin: 1 } },
  winterBlood: { id: "winterBlood", name: "북방의 피", description: "한기 압력 -1", environment: { cold: 1 } },
  disciplined: { id: "disciplined", name: "집중 수련", description: "기술 숙련 경험치 +25%", masteryBonus: 0.25 }
};

export const MATERIAL_DEFS = {
  wood: { id: "wood", name: "목재", glyph: "▤", common: true },
  ore: { id: "ore", name: "철광석", glyph: "◆", common: true },
  ingot: { id: "ingot", name: "철괴", glyph: "▰", common: true },
  sunShard: { id: "sunShard", name: "태양 파편", glyph: "✦" },
  sporeGland: { id: "sporeGland", name: "심층 포자샘", glyph: "●" },
  blackSteel: { id: "blackSteel", name: "흑철 파편", glyph: "▣" },
  watcherEye: { id: "watcherEye", name: "감시자의 수정안", glyph: "◈" }
};

export const WORKER_DEFS = {
  steward: { id: "steward", name: "집사장", glyph: "♙", cost: 0, max: 1, description: "영지의 생산 명령을 관리한다." },
  lumberjack: { id: "lumberjack", name: "벌목꾼", glyph: "♣", cost: 3, max: 3, description: "3턴마다 목재를 생산한다." },
  miner: { id: "miner", name: "광부", glyph: "♦", cost: 3, max: 3, description: "4턴마다 철광석을 생산한다." },
  blacksmith: { id: "blacksmith", name: "대장장이", glyph: "⚒", cost: 5, max: 2, description: "광석을 제련하고 설계도로 장비를 제작한다." }
};

export const AFFIX_DEFS = {
  keen: { id: "keen", name: "예리한", description: "공격 피해 +1", attack: 1 },
  bastion: { id: "bastion", name: "견고한", description: "피격 방어 +1", block: 1 },
  adaptable: { id: "adaptable", name: "적응형", description: "모든 환경 대응 +1", environmentAll: 1 },
  practiced: { id: "practiced", name: "숙련자의", description: "기술 숙련 경험치 +20%", masteryBonus: 0.2 }
};

export const CRAFT_RECIPES = [
  { id: "frontierMantle", itemDefId: "frontierMantle", name: "개척자의 겹망토", materials: { wood: 3, ingot: 1 }, source: "starter" },
  { id: "sporeMask", itemDefId: "sporeMask", name: "포자 여과면", materials: { wood: 1, ingot: 1, sporeGland: 1 }, source: "mire" },
  { id: "knightAegis", itemDefId: "knightAegis", name: "개척 기사 대방패", materials: { ingot: 4, blackSteel: 1 }, classId: "knight" },
  { id: "barbarianAxe", itemDefId: "barbarianAxe", name: "혈철 파쇄도끼", materials: { wood: 2, ingot: 3, blackSteel: 1 }, classId: "barbarian" },
  { id: "mechanicRig", itemDefId: "mechanicRig", name: "황동 환경 제어기", materials: { ingot: 3, sunShard: 1 }, classId: "mechanic" },
  { id: "martialWraps", itemDefId: "martialWraps", name: "청류 경맥포", materials: { wood: 2, sporeGland: 1 }, classId: "martial" },
  { id: "wardenLens", itemDefId: "wardenLens", name: "감시자의 룬안", materials: { ingot: 3, watcherEye: 1 }, source: "boss" },
  { id: "venom", itemDefId: "venom", name: "독성 증류병", materials: { wood: 1, sporeGland: 1 }, researchId: "venom" },
  { id: "ember", itemDefId: "ember", name: "꺼지지 않는 불씨", materials: { ingot: 1, sunShard: 1 }, researchId: "ember" },
  { id: "lantern", itemDefId: "lantern", name: "광맥 랜턴", materials: { ingot: 2, sunShard: 1 }, researchId: "lantern" },
  { id: "coil", itemDefId: "coil", name: "전도 코일", materials: { ingot: 3, blackSteel: 1 }, researchId: "coil" },
  { id: "armor", itemDefId: "armor", name: "층철 갑옷", materials: { ingot: 5, blackSteel: 1 }, researchId: "armor" }
];

export const RESEARCH_DEFS = [
  {
    id: "venom",
    name: "독성 증류",
    glyph: "♢",
    cost: 6,
    itemDefId: "venom",
    description: "공격에 중독을 쌓는 연금 아이템을 제작한다."
  },
  {
    id: "ember",
    name: "잔불 보존",
    glyph: "✦",
    cost: 8,
    itemDefId: "ember",
    description: "반복 공격을 화상으로 전환하는 불씨를 제작한다."
  },
  {
    id: "lantern",
    name: "광맥 측량",
    glyph: "◉",
    cost: 8,
    itemDefId: "lantern",
    description: "시야를 넓히고 보급함을 감지하는 랜턴을 제작한다."
  },
  {
    id: "coil",
    name: "전도 장치",
    glyph: "ϟ",
    cost: 10,
    itemDefId: "coil",
    description: "이동을 강한 감전 공격으로 바꾸는 코일을 제작한다."
  },
  {
    id: "armor",
    name: "층철 가공",
    glyph: "▣",
    cost: 12,
    itemDefId: "armor",
    description: "큰 공간을 차지하지만 항상 작동하는 갑옷을 제작한다."
  },
  {
    id: "bag_row",
    name: "가방 밑단 확장",
    glyph: "▦",
    cost: 14,
    type: "bag",
    description: "가방의 세로 공간을 한 줄 영구 확장한다."
  }
];

export const ENEMY_DEFS = {
  sandstalker: {
    id: "sandstalker",
    name: "유리모래 잠복수",
    glyph: "≈",
    hp: 6,
    damage: 2,
    scrap: 1
  },
  frostwolf: {
    id: "frostwolf",
    name: "설원 송곳니",
    glyph: "Λ",
    hp: 6,
    damage: 2,
    scrap: 1
  },
  duneTyrant: {
    id: "duneTyrant",
    name: "사구 폭군",
    glyph: "D",
    hp: 20,
    damage: 4,
    scrap: 7,
    boss: true
  },
  frostColossus: {
    id: "frostColossus",
    name: "빙맥 거상",
    glyph: "F",
    hp: 24,
    damage: 4,
    scrap: 8,
    boss: true
  },
  gnawer: {
    id: "gnawer",
    name: "동굴 포식자",
    glyph: "∧",
    hp: 5,
    damage: 2,
    scrap: 1
  },
  raider: {
    id: "raider",
    name: "폐광 약탈자",
    glyph: "×",
    hp: 7,
    damage: 3,
    scrap: 2
  },
  spore: {
    id: "spore",
    name: "포자 덩어리",
    glyph: "●",
    hp: 4,
    damage: 1,
    scrap: 1,
    poison: 1
  },
  warden: {
    id: "warden",
    name: "심층 감시자",
    glyph: "W",
    hp: 22,
    damage: 4,
    scrap: 8,
    boss: true
  }
};

export const AREA_DEFS = {
  estate: {
    id: "estate",
    name: "내 영지",
    subtitle: "공방과 생산 거점이 자라는 안전한 개척지",
    description: "벌목장과 채석장을 순찰하며 영지 생산 기반을 확인한다.",
    glyph: "⌂",
    accent: "#89a978",
    kind: "estate",
    difficulty: "안전",
    pressure: null,
    enemyPool: [],
    enemyCount: 0,
    bossDefId: null,
    beaconGoal: 0,
    cacheCount: 0,
    hazardCount: 0,
    campCount: 1,
    rareMaterial: "wood",
    blueprintSource: "starter",
    objective: "생산 거점을 순찰하고 필요한 준비를 마쳐라"
  },
  desert: {
    id: "desert",
    name: "유리모래 사막",
    subtitle: "태양에 녹은 모래와 황동 잔해가 끝없이 이어지는 땅",
    description: "작열을 견디며 세 측량탑을 연결하고 사구 폭군을 쓰러뜨린다.",
    glyph: "☀",
    accent: "#c28b4d",
    kind: "adventure",
    difficulty: "위험 1",
    pressure: { id: "heat", name: "작열", glyph: "☀", rate: 2, threshold: 10 },
    enemyPool: ["sandstalker", "sandstalker", "gnawer", "raider"],
    enemyCount: 12,
    bossDefId: "duneTyrant",
    beaconGoal: 3,
    cacheCount: 8,
    hazardCount: 10,
    campCount: 3,
    rareMaterial: "sunShard",
    blueprintSource: "fringe",
    bossMaterial: "sunShard",
    bossBlueprint: "mechanicRig",
    objective: "측량탑을 연결해 사구 폭군의 모래 장막을 해제하라"
  },
  snowfield: {
    id: "snowfield",
    name: "백설령 설산",
    subtitle: "얼어붙은 철로와 고대 광맥이 눈보라 속에 잠든 산맥",
    description: "혹한을 낮추며 봉화를 복구하고 빙맥 거상의 심장에 접근한다.",
    glyph: "❄",
    accent: "#78a9c2",
    kind: "adventure",
    difficulty: "위험 2",
    pressure: { id: "cold", name: "혹한", glyph: "❄", rate: 3, threshold: 10 },
    enemyPool: ["frostwolf", "frostwolf", "raider", "gnawer"],
    enemyCount: 13,
    bossDefId: "frostColossus",
    beaconGoal: 3,
    cacheCount: 8,
    hazardCount: 12,
    campCount: 2,
    rareMaterial: "blackSteel",
    blueprintSource: "rail",
    bossMaterial: "blackSteel",
    bossBlueprint: "knightAegis",
    objective: "세 봉화를 밝혀 빙맥 거상의 결빙 장막을 녹여라"
  }
};

export const REGION_INFO = {
  fringe: {
    id: "fringe",
    name: "황동 황야",
    subtitle: "부서진 운반선과 녹슨 모래의 평원",
    accent: "#b98a52",
    pressure: { id: "heat", name: "작열", glyph: "☀", rate: 2, threshold: 10 },
    center: { x: 4, y: 15 },
    enemyPool: ["gnawer", "gnawer", "raider"],
    enemyCount: 4
  },
  mire: {
    id: "mire",
    name: "포자 저습지",
    subtitle: "폐수 위로 발광 균사가 번지는 늪",
    accent: "#6f9b73",
    pressure: { id: "toxin", name: "포자 독성", glyph: "☣", rate: 2, threshold: 10 },
    center: { x: 15, y: 5 },
    enemyPool: ["spore", "spore", "gnawer"],
    enemyCount: 4
  },
  rail: {
    id: "rail",
    name: "검은 철로",
    subtitle: "거대 수송 궤도가 지평선까지 이어진 곳",
    accent: "#6f8794",
    pressure: { id: "cold", name: "혹한", glyph: "❄", rate: 2, threshold: 10 },
    center: { x: 15, y: 26 },
    enemyPool: ["raider", "raider", "gnawer"],
    enemyCount: 4
  },
  basin: {
    id: "basin",
    name: "감시자의 분지",
    subtitle: "보랏빛 기계맥이 모이는 세계의 심장",
    accent: "#9a78b4",
    pressure: { id: "corruption", name: "기계 오염", glyph: "◈", rate: 3, threshold: 10 },
    center: { x: 27, y: 15 },
    enemyPool: ["raider", "spore"],
    enemyCount: 2
  }
};

export const LOOT_TABLE = [
  "venom",
  "ember",
  "lantern",
  "coil",
  "crystal",
  "herbKit",
  "armor",
  "scavengerCharm"
];
