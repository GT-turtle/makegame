import { writeFileSync } from "node:fs";
import {
  BASIC_DISCIPLINE_DEFS,
  PLAYER_BASE_CLASS_DEFS,
  PLAYER_KIT_DEFS,
  RUNE_DEFS,
  DEFAULT_PLAYER_KIT_ID,
  DEFAULT_PLAYER_BASE_CLASS_ID
} from "../src/classes.js";

const payload = {
  disciplines: Object.values(BASIC_DISCIPLINE_DEFS),
  baseClasses: Object.values(PLAYER_BASE_CLASS_DEFS),
  kits: Object.values(PLAYER_KIT_DEFS),
  runes: Object.values(RUNE_DEFS),
  defaultKitId: DEFAULT_PLAYER_KIT_ID,
  defaultBaseClassId: DEFAULT_PLAYER_BASE_CLASS_ID
};

writeFileSync(new URL("../unity-export/class-data.json", import.meta.url), JSON.stringify(payload, null, 2), "utf8");
console.log("wrote unity-export/class-data.json");
