import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const media = join(root, "media");
const videoPath = join(media, "tasklatch-quick-demo.mp4");
const captionsPath = join(media, "tasklatch-quick-demo.en.vtt");
const coverPath = join(media, "tasklatch-quick-demo-cover.png");
const fps = 10;
const duration = 20;
const cues = [
  [0, 5, "Onboarded does not mean a task is assigned."],
  [5, 9, "TaskLatch keeps each work milestone separate."],
  [9, 15, "Add a task reference. Now the assignment is recorded."],
  [15, 20, "Payment stays unrecorded until it arrives. Personal demo. Synthetic data."],
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
  return hours + ":" + minutes + ":" + remainder;
};
const escapeFilter = (value) => value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
const vtt = "WEBVTT\n\n" + cues.map(([start, end, text], index) =>
  (index + 1) + "\n" + vttTime(start) + " --> " + vttTime(end) + "\n" + text
).join("\n\n") + "\n";

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
  throw new Error("Timed out waiting for " + url);
}

async function stopChild(child, includeExitedWindowsLauncher = false) {
  if (!child) return;
  if (process.platform === "win32" && child.pid && (includeExitedWindowsLauncher || (child.exitCode === null && child.signalCode === null))) {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 5000);
      killer.once("exit", () => { clearTimeout(timer); resolveExit(); });
      killer.once("error", () => { clearTimeout(timer); resolveExit(); });
    });
    return;
  }
  await new Promise((resolveExit) => {
    const timer = setTimeout(resolveExit, 3000);
    child.once("exit", () => { clearTimeout(timer); resolveExit(); });
    try { child.kill(); } catch { clearTimeout(timer); resolveExit(); }
  });
}

async function stopIsolatedBrowser(profile, child) {
  if (process.platform !== "win32") return stopChild(child);
  const quotedProfile = "'" + profile.replaceAll("'", "''") + "'";
  const command = "$profile=" + quotedProfile + "; $processes=@(Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) }); $ids=@($processes | ForEach-Object { $_.ProcessId }); $roots=@($processes | Where-Object { $ids -notcontains $_.ParentProcessId }); foreach($root in $roots){ & taskkill.exe /PID $root.ProcessId /T /F | Out-Null }; exit 0";
  const killer = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { stdio: "ignore", windowsHide: true });
  await new Promise((resolveExit) => {
    const timer = setTimeout(() => { try { killer.kill(); } catch {} resolveExit(); }, 10000);
    killer.once("exit", () => { clearTimeout(timer); resolveExit(); });
    killer.once("error", () => { clearTimeout(timer); resolveExit(); });
  });
  await stopChild(child);
}

async function removeTempWithRetry(path) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await rm(path, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 }); return; }
    catch (error) {
      if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code) || attempt === 9) throw error;
      await wait(350);
    }
  }
}

async function main() {
  await mkdir(media, { recursive: true });
  const temp = await mkdtemp(join(tmpdir(), "tasklatch-quick-record-"));
  const frames = join(temp, "frames");
  const profile = join(temp, "edge-profile");
  await mkdir(frames, { recursive: true });
  const captionFiles = [];
  for (let i = 0; i < cues.length; i++) {
    const path = join(temp, "caption-" + String(i).padStart(2, "0") + ".txt");
    await writeFile(path, cues[i][2], "utf8");
    captionFiles.push(path);
  }
  const appPort = await freePort();
  const base = "http://127.0.0.1:" + appPort + "/";
  const server = spawn(process.execPath, [join(root, "scripts", "serve.mjs")], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort) }, stdio: "ignore", windowsHide: true,
  });
  const browserPort = await freePort();
  const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-sync", "--disable-crash-reporter", "--disable-breakpad", "--metrics-recording-only", "--remote-allow-origins=*", "--remote-debugging-port=" + browserPort, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore", windowsHide: true });
  let socket;
  let sequence = 0;
  let frameIndex = 0;
  const pending = new Map();
  try {
    await waitFor(base);
    await waitFor("http://127.0.0.1:" + browserPort + "/json/version");
    const targetResponse = await fetch("http://127.0.0.1:" + browserPort + "/json/new?" + encodeURIComponent(base + "quick-demo.html"), { method: "PUT" });
    if (!targetResponse.ok) throw new Error("Could not open an isolated quick-demo tab.");
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
      if (result.exceptionDetails) throw new Error("Quick-demo interaction failed: " + result.exceptionDetails.text);
      return result.result.value;
    };
    const assertIncludes = async (expression, expected, label) => {
      const actual = String(await evaluate(expression));
      if (!actual.includes(expected)) throw new Error(label + ": expected " + JSON.stringify(expected) + " in " + JSON.stringify(actual.slice(0, 500)));
    };
    const capture = async (seconds) => {
      for (let i = 0; i < seconds * fps; i++) {
        const start = Date.now();
        const image = await send("Page.captureScreenshot", { format: "jpeg", quality: 84, fromSurface: true });
        await writeFile(join(frames, String(frameIndex++).padStart(6, "0") + ".jpg"), Buffer.from(image.data, "base64"));
        const remaining = Math.max(0, 1000 / fps - (Date.now() - start));
        if (remaining) await wait(remaining);
      }
    };

    await send("Page.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false, screenWidth: 1920, screenHeight: 1080 });
    await send("Page.navigate", { url: base + "quick-demo.html" });
    for (let i = 0; i < 100; i++) {
      const title = String(await evaluate("document.title").catch(() => ""));
      if (title.includes("TaskLatch")) break;
      await wait(100);
    }
    await assertIncludes("document.title", "TaskLatch", "Quick demo page");
    await assertIncludes("document.querySelector('#status-heading').textContent", "Onboarded", "Starting status");
    await assertIncludes("document.querySelector('#status-description').textContent", "No task assignment", "No-task state");
    await assertIncludes("document.querySelector('#milestone-count').textContent", "4 of 6", "Initial milestone count");
    if (!await evaluate("document.querySelector('#assignment-note').hidden")) throw new Error("The assignment reference must be hidden before a task is recorded.");
    const initialImages = Number(await evaluate("document.querySelectorAll('img,picture,svg').length"));
    if (initialImages !== 0) throw new Error("The quick demo unexpectedly uses an image or SVG.");

    const cover = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(coverPath, Buffer.from(cover.data, "base64"));
    await capture(5);
    const clicked = await evaluate("(()=>{const button=document.querySelector('#record-sample');if(!button||button.disabled)return false;button.click();return true})()");
    if (!clicked) throw new Error("The sample assignment button could not be clicked.");
    await wait(300);
    await assertIncludes("document.querySelector('#status-heading').textContent", "Task assigned", "Assigned status");
    await assertIncludes("document.querySelector('#payment-label').textContent", "Not recorded", "Payment remains separate");
    await assertIncludes("document.querySelector('#milestone-count').textContent", "5 of 6", "Assigned milestone count");
    await assertIncludes("document.querySelector('#assignment-note').innerText", "DEMO-TASK-17", "Synthetic task reference");
    await capture(12);
    await capture(3);
    if (frameIndex !== fps * duration) throw new Error("Expected " + (fps * duration) + " frames; captured " + frameIndex + ".");

    await evaluate("document.querySelector('#reset-sample').click()");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    const width = Number(await evaluate("document.documentElement.scrollWidth"));
    if (width > 390) throw new Error("Mobile layout overflows horizontally (" + width + "px at a 390px viewport).");
    await send("Emulation.clearDeviceMetricsOverride");

    await writeFile(captionsPath, vtt, "utf8");
    const fontPath = process.env.VIDEO_FONT || (process.platform === "win32" ? "C:\\Windows\\Fonts\\arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
    const filters = cues.map(([start, end], index) =>
      "drawtext=fontfile='" + escapeFilter(fontPath) + "':textfile='" + escapeFilter(captionFiles[index]) + "':fontcolor=white:fontsize=28:box=1:boxcolor=0x132b39@0.96:boxborderw=18:x=(w-text_w)/2:y=h-text_h-34:enable='between(t," + start + "," + end + ")'"
    );
    const ffmpegArgs = ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(fps), "-i", join(frames, "%06d.jpg"), "-vf", "scale=1920:1080:flags=lanczos," + filters.join(",") + ",fps=24,format=yuv420p", "-c:v", "libx264", "-crf", "24", "-preset", "medium", "-movflags", "+faststart", "-an", videoPath];
    const encoder = spawn(ffmpeg, ffmpegArgs, { stdio: "inherit", windowsHide: true });
    const exitCode = await new Promise((resolveExit, reject) => { encoder.once("error", reject); encoder.once("exit", resolveExit); });
    if (exitCode !== 0) throw new Error("Video encoding failed with exit code " + exitCode + ".");
    process.stdout.write("Captured " + frameIndex + " real app frames; the assignment, payment-separation, cover, and mobile checks passed.\nSaved " + videoPath + "\nSaved " + captionsPath + "\nSaved " + coverPath + "\n");
  } finally {
    try { socket?.close(); } catch { /* close the isolated browser */ }
    await stopIsolatedBrowser(profile, browser);
    await stopChild(server);
    await removeTempWithRetry(temp);
  }
}

await main();
