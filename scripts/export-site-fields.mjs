// 하위 필드 세 구간과 지물 좌표를 유니티로 넘긴다.
//
// 왜 좌표를 그대로 넘기는가: 지도 그림에서 채석장을 본 자리와 3D에서 실제로 서
// 있는 자리가 어긋나면 같은 장소로 안 읽힌다. JS 전투장과 유니티 필드가 같은
// 원본(그림 안 위치 %)에서 각자 자기 좌표로 옮기게 해서 둘이 저절로 맞물리게 한다.
//
// 실행: node scripts/export-site-fields.mjs
// 결과: unity-export/site-fields.json → PackforgeArena/Assets/Resources/WorldFields/

import { writeFileSync, mkdirSync } from "node:fs";
import { SITE_FIELD_DEFS, FIELD_BOUNDS, FIELD_STAGE_COUNT } from "../src/adventure.js";

const payload = {
  // 유니티 쪽에서 "이 값으로 만든 데이터가 맞나"를 확인할 수 있게 같이 넘긴다.
  stageCount: FIELD_STAGE_COUNT,
  // JS 전투장 크기. 유니티는 안 쓰지만, 두 쪽 좌표를 손으로 대조할 때 필요하다.
  arenaBounds: { ...FIELD_BOUNDS },
  fields: SITE_FIELD_DEFS.map((field) => ({
    stage: field.stage,
    id: field.id,
    name: field.name,
    description: field.description,
    // 지도 그림에서 이 구간이 차지하는 띠(%).
    mapY1: field.mapArea.y1,
    mapY2: field.mapArea.y2,
    landmarks: field.landmarks.map((landmark) => ({
      id: landmark.id,
      name: landmark.name,
      kind: landmark.kind,
      // 그림 안 위치(%). 유니티는 이걸 필드 bounds에 맞춰 월드 좌표로 편다.
      mapX: landmark.x,
      mapY: landmark.y,
      // 전투장에서 몸으로 막히는 충돌 반경(전투장 단위).
      radius: landmark.radius,
      // 그림에서 그 지물이 실제로 차지하는 반경(가로 폭의 %). 3D 모델 크기는
      // 이걸 쓴다 — radius로 크기를 잡으면 야영지가 1m짜리 조약돌이 된다.
      footprint: landmark.footprint,
      // 지나다닐 수 있는가. 길·야영지·약초밭·유적 문은 통과한다.
      solid: ["mine", "cave", "quarry", "rock"].includes(landmark.kind)
    }))
  }))
};

mkdirSync(new URL("../unity-export", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../unity-export/site-fields.json", import.meta.url),
  JSON.stringify(payload, null, 2),
  "utf8"
);

const total = payload.fields.reduce((sum, field) => sum + field.landmarks.length, 0);
console.log(`wrote unity-export/site-fields.json (${payload.fields.length}구간 / 지물 ${total}개)`);
