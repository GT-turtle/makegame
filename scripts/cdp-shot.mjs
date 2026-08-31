// 의존성 없는 최소 CDP 드라이버.
// Chrome을 --remote-debugging-port로 띄워두고 이 스크립트로 페이지를 열어
// JS를 실행하거나 스크린샷을 찍는다. Node 24의 내장 WebSocket만 쓴다.
//
// 사용:
//   node scripts/cdp-shot.mjs <port> <url> <out.png> [evalJs]
// evalJs가 있으면 페이지 로드 후 그 코드를 실행하고, 잠시 기다린 뒤 캡처한다.

const [, , portArg, url, outPath, evalJs] = process.argv;
const port = Number(portArg);
if (!port || !url || !outPath) {
  console.error("usage: node scripts/cdp-shot.mjs <port> <url> <out.png> [evalJs]");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pickTarget() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((entry) => entry.type === "page");
  if (!page) throw new Error("열린 페이지 타겟이 없다");
  return page.webSocketDebuggerUrl;
}

const socketUrl = await pickTarget();
const socket = new WebSocket(socketUrl);
let nextId = 0;
const pending = new Map();

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

await send("Page.enable");
await send("Runtime.enable");
// --window-size가 headless 스크린샷 뷰포트에 반영되지 않아서(세로로 나옴)
// 뷰포트를 명시적으로 덮어쓴다. 이 게임의 전투 화면은 가로 방향을 요구한다.
const viewWidth = Number(process.env.CDP_WIDTH || 932);
const viewHeight = Number(process.env.CDP_HEIGHT || 430);
await send("Emulation.setDeviceMetricsOverride", {
  width: viewWidth,
  height: viewHeight,
  deviceScaleFactor: 2,
  mobile: true,
  screenOrientation: { angle: 90, type: "landscapePrimary" }
});
await send("Page.navigate", { url });
await sleep(2500);

if (evalJs) {
  const result = await send("Runtime.evaluate", { expression: evalJs, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    console.error("EVAL ERROR:", JSON.stringify(result.exceptionDetails.exception?.description || result.exceptionDetails));
  } else {
    console.log("EVAL:", JSON.stringify(result.result?.value ?? null));
  }
  await sleep(1200);
}

const shot = await send("Page.captureScreenshot", { format: "png" });
const { writeFileSync } = await import("node:fs");
writeFileSync(outPath, Buffer.from(shot.data, "base64"));
console.log("WROTE", outPath);
socket.close();
process.exit(0);
