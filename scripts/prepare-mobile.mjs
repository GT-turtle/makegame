import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptsDir, "..");
const webDir = path.join(projectDir, "www");

await mkdir(webDir, { recursive: true });

for (const file of ["index.html", "styles.css", "icon.svg", "manifest.webmanifest", "sw.js"]) {
  await cp(path.join(projectDir, file), path.join(webDir, file), { force: true });
}

await cp(path.join(projectDir, "src"), path.join(webDir, "src"), {
  recursive: true,
  force: true
});

console.log("Android web assets prepared in www/.");
