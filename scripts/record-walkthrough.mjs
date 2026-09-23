import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const media = join(root, "media");
const videoPath = join(media, "tasklatch-walkthrough.mp4");
const captionsPath = join(media, "tasklatch-walkthrough.en.vtt");
const fps = 8;
const duration = 60;
const cues = [
  [0, 6, "A contract can be signed while the task queue is empty."],
  [6, 13, "TaskLatch separates selection, contract, assignment and payment."],
  [13, 21, "A fee to unlock work? Pause and verify."],
  [21, 31, "The checklist flags a warning; it never declares a company safe or fake."],
  [31, 42, "The sample was onboarded. No assignment had been recorded."],
  [42, 51, "Add a task reference and the status changes. Payment still is not assumed."],
  [51, 60, "Personal open-source demo. Synthetic records. Everything stays in this browser."],
];
const edgeCandidates = process.platform === "win32"
  ? [process.env.EDGE_BIN, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]
  : [process.env.EDGE_BIN, "chromium", "chromium-browser", "google-chrome"];
const edge = edgeCandidates.find((path) => path && (existsSync(path) || process.platform !== "win32"));
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
if (!edge) throw new Error("Microsoft Edge was not found; set EDGE_BIN to an installed Edge executable.");
if (typeof WebSocket !== "function") throw new Error("This recording script needs Node.js with built-in WebSocket support.");

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const vttTime = (seconds) => {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const remainder = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${hours}:${minutes}:${remainder}`;
};
const srtText = (value) => value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
const vtt = `WEBVTT\n\n${cues.map(([start, end, text], index) => `${index + 1}\n${vttTime(start)} --> ${vttTime(end)}\n${text}`).join("\n\n")}\n`;

async function freePort() {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
  const value = server.address().port;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return value;
}

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(url); if (response.ok) return response; } catch { /* service is starting */ }
    await wait(120);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  await mkdir(media, { recursive: true });
  const temp = await mkdtemp(join(tmpdir(), "tasklatch-record-"));
  const frames = join(temp, "frames");
  const profile = join(temp, "edge-profile");
  await mkdir(frames, { recursive: true });
  const captionFiles = [];
  for (let i = 0; i < cues.length; i++) {
    const path = join(temp, `caption-${String(i).padStart(2, "0")}.txt`);
    await writeFile(path, cues[i][2], "utf8");
    captionFiles.push(path);
  }
  const appPort = await freePort();
  const base = `http://127.0.0.1:${appPort}/`;
  const server = spawn(process.execPath, [join(root, "scripts", "serve.mjs")], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort) }, stdio: "ignore", windowsHide: true,
  });
  const browserPort = await freePort();
  const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-sync", "--metrics-recording-only", "--remote-allow-origins=*", `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  let socket;
  let sequence = 0;
  let frameIndex = 0;
  const pending = new Map();
  try {
    await waitFor(base);
    await waitFor(`http://127.0.0.1:${browserPort}/json/version`);
    const targetResponse = await fetch(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(base)}`, { method: "PUT" });
    if (!targetResponse.ok) throw new Error("Could not open an isolated walkthrough tab.");
    const target = await targetResponse.json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    socket.addEventListener("message", (event) => {
      const packet = JSON.parse(event.data);
      if (!packet.id) return;
      const waiter = pending.get(packet.id);
      if (!waiter) return;
      pending.delete(packet.id);
      packet.error ? waiter.reject(new Error(packet.error.message)) : waiter.resolve(packet.result);
    });
    const send = (method, params = {}) => new Promise((resolveCommand, reject) => {
      const id = ++sequence; pending.set(id, { resolve: resolveCommand, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(`Walkthrough interaction failed: ${result.exceptionDetails.text}`);
      return result.result.value;
    };
    const click = async (selector) => {
      const didClick = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)return false;el.click();return true})()`);
      if (!didClick) throw new Error(`Could not click ${selector}`);
      await wait(350);
    };
    const select = async (selector, value) => {
      const selected = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
      if (!selected) throw new Error(`Could not select ${selector}`);
      await wait(350);
    };
    const fill = async (selector, value) => {
      const filled = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
      if (!filled) throw new Error(`Could not fill ${selector}`);
    };
    const assertIncludes = async (expression, expected, label) => {
      const actual = String(await evaluate(expression));
      if (!actual.includes(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)} in ${JSON.stringify(actual.slice(0, 800))}`);
    };
    await send("Page.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false, screenWidth: 1920, screenHeight: 1080 });
    await send("Page.navigate", { url: base });
    for (let i = 0; i < 100; i++) {
      const title = await evaluate("document.title").catch(() => "");
      if (String(title).includes("TaskLatch")) break;
      await wait(100);
    }
    await assertIncludes("document.title", "TaskLatch", "App loaded");
    await assertIncludes("document.querySelector('#content').innerText", "Selected is not the same as paid work", "Initial demo state");
    await evaluate("document.querySelectorAll('img, picture, svg').length === 0 || (()=>{throw new Error('Unexpected image element')})()");

    const capture = async (seconds) => {
      for (let i = 0; i < seconds * fps; i++) {
        const start = Date.now();
        const image = await send("Page.captureScreenshot", { format: "jpeg", quality: 82, fromSurface: true });
        await writeFile(join(frames, `${String(frameIndex++).padStart(6, "0")}.jpg`), Buffer.from(image.data, "base64"));
        const remaining = Math.max(0, 1000 / fps - (Date.now() - start));
        if (remaining) await wait(remaining);
      }
    };
    await capture(6);

    await click('[data-view="offer-check"]');
    await select("#check-opp", "op-quicktask");
    await assertIncludes("document.querySelector('#content').innerText", "Pause and verify before sending money", "Payment request flagged");
    await capture(8);

    await click('[data-view="work-trail"]');
    await select("#trail-opp", "op-northstar");
    await assertIncludes("document.querySelector('#content').innerText", "no task assignment recorded yet", "Onboarding is not a task");
    await capture(8);

    await select("#stage-select", "assigned");
    await fill("#event-reference", "SIM-TASK-204");
    await fill("#event-note", "Synthetic assignment added in the demo.");
    await evaluate("document.querySelector('#stage-form').requestSubmit()");
    await wait(350);
    await assertIncludes("document.querySelector('#content').innerText", "A task is recorded; payment is not recorded yet", "Assignment does not imply payment");
    await assertIncludes("document.querySelector('#content').innerText", "Task assigned", "Assigned milestone added");
    await capture(11);

    await click('[data-view="export"]');
    await assertIncludes("document.querySelector('#content').innerText", "Redacted export preview", "Redacted backup view");
    await capture(9);
    await click('[data-view="overview"]');
    await capture(18);
    if (frameIndex !== fps * duration) throw new Error(`Expected ${fps * duration} frames; captured ${frameIndex}.`);

    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    const width = Number(await evaluate("document.documentElement.scrollWidth"));
    if (width > 390) throw new Error(`Mobile layout overflows horizontally (${width}px at a 390px viewport).`);
    await send("Emulation.clearDeviceMetricsOverride");

    await writeFile(captionsPath, vtt, "utf8");
    const fontPath = process.env.VIDEO_FONT || (process.platform === "win32" ? "C:\\Windows\\Fonts\\arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
    const filters = cues.map(([start, end], index) => `drawtext=fontfile='${srtText(fontPath)}':textfile='${srtText(captionFiles[index])}':fontcolor=white:fontsize=26:box=1:boxcolor=0x132b39@0.96:boxborderw=17:x=(w-text_w)/2:y=h-text_h-34:enable='between(t,${start},${end})'`);
    const ffmpegArgs = ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(fps), "-i", join(frames, "%06d.jpg"), "-vf", `scale=1920:1080:flags=lanczos,${filters.join(",")},fps=24,format=yuv420p`, "-c:v", "libx264", "-crf", "25", "-preset", "medium", "-movflags", "+faststart", "-an", videoPath];
    const encoder = spawn(ffmpeg, ffmpegArgs, { stdio: "inherit", windowsHide: true });
    const exitCode = await new Promise((resolveExit, reject) => { encoder.once("error", reject); encoder.once("exit", resolveExit); });
    if (exitCode !== 0) throw new Error(`Video encoding failed with exit code ${exitCode}.`);
    process.stdout.write(`Captured ${frameIndex} real app frames; the offer, risk, milestone, export and mobile checks passed.\nSaved ${videoPath}\nSaved ${captionsPath}\n`);
  } finally {
    try { socket?.close(); } catch { /* clean up the isolated browser */ }
    try { browser.kill(); } catch { /* clean up the isolated browser */ }
    try { server.kill(); } catch { /* clean up the local demo server */ }
    await wait(300);
    await rm(temp, { recursive: true, force: true });
  }
}

await main();
