export const ESTATE_GATE_DEFS = {
  north: { id: "north", name: "북문", glyph: "▲", mapX: 50, mapY: 12, description: "산길과 채석장으로 이어지는 가장 높은 성문" },
  east: { id: "east", name: "동문", glyph: "▶", mapX: 84, mapY: 50, description: "공방과 교역로를 향하는 넓은 성문" },
  south: { id: "south", name: "남문", glyph: "▼", mapX: 50, mapY: 86, description: "농지와 수로가 가까워 주민 피해에 민감한 성문" },
  west: { id: "west", name: "서문", glyph: "◀", mapX: 16, mapY: 50, description: "숲과 벌목장으로 이어지는 좁고 긴 성문" }
};

export const GATE_GARRISON_LIMIT = 10;
export const MOBILE_PARTY_LIMIT = 2;
export const REMNANT_TEAM_LIMIT = 5;

export function createDefenseDeployments() {
  return {
    gates: Object.fromEntries(Object.keys(ESTATE_GATE_DEFS).map((gateId) => [gateId, []])),
    remnants: []
  };
}

export function createDefenseCampaign(pending, fortification, deployments) {
  const maxDurability = 100 + fortification * 20;
  return {
    phase: "gates",
    activeGateId: null,
    breachedGateId: null,
    elapsed: 0,
    backgroundClock: 0,
    switches: 0,
    gates: Object.fromEntries(Object.keys(ESTATE_GATE_DEFS).map((gateId) => [gateId, {
      id: gateId,
      status: "underAttack",
      durability: maxDurability,
      maxDurability,
      garrisonIds: [...(deployments.gates[gateId] || [])],
      battle: null,
      damageTaken: 0,
      waveCleared: false
    }])),
    remnants: {
      assignedIds: [...(deployments.remnants || [])],
      strength: 10,
      status: "waiting",
      result: null
    },
    pendingTitle: pending.title,
    finalResult: null,
    eventLog: ["적의 주력이 네 성문으로 갈라졌다. 개척자 기동대가 먼저 지원할 문을 선택해야 한다."]
  };
}

export function unitDefensePower(unitId, unitProgress, unitDefs) {
  const unit = unitDefs[unitId];
  if (!unit) return 0;
  const level = unitProgress[unitId]?.level || 1;
  const rolePower = (unit.scores || []).reduce((sum, score) => sum + score, 0) / 3;
  return 2 + level + rolePower + (unit.armor || 0) * 8;
}

export function groupDefensePower(unitIds, unitProgress, unitDefs) {
  return unitIds.reduce((sum, unitId) => sum + unitDefensePower(unitId, unitProgress, unitDefs), 0);
}

export function gateDurabilityGrade(gate) {
  const ratio = gate.maxDurability ? gate.durability / gate.maxDurability : 0;
  if (gate.status === "held") return "방어 완료";
  if (gate.status === "breached" || ratio <= 0) return "돌파";
  if (ratio <= 0.3) return "붕괴 직전";
  if (ratio <= 0.65) return "손상";
  return "건재";
}
