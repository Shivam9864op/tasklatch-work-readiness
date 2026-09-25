import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const media = join(root, "media");
const videoPath = join(media, "tasklatch-motion-promo.mp4");
const captionsPath = join(media, "tasklatch-motion-promo.en.vtt");
const coverPath = join(media, "tasklatch-motion-promo-cover.png");
const captureFps = 60;
const outputFps = 60;
const duration = 20;
const cues = [
  [0, 3.2, "Onboarded does not mean your first task has arrived."],
  [3.2, 6, "Track each step with its own evidence."],
  [6, 9.8, "Keep the whole work trail in one private workspace."],
  [9.8, 13.2, "A task changes status only after its reference is recorded."],
  [13.2, 16.6, "Assigned is not paid. Payment stays unrecorded."],
  [16.6, 20, "TaskLatch. Personal project. Synthetic sample data."],
];
const edgeCandidates = process.platform === "win32"
  ? [process.env.EDGE_BIN, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]
  : [process.env.EDGE_BIN, "chromium", "chromium-browser", "google-chrome"];
const edge = edgeCandidates.find((path) => path && (existsSync(path) || process.platform !== "win32"));
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
if (!edge) throw new Error("Microsoft Edge was not found; set EDGE_BIN to an installed Edge executable.");
if (typeof WebSocket !== "function") throw new Error("This recorder needs Node.js with built-in WebSocket support.");

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const vttTime = (seconds) => {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const remainder = (seconds % 60).toFixed(3).padStart(6, "0");
  return hours + ":" + minutes + ":" + remainder;
};

async function freePort() {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The local server or isolated browser is still starting.
    }
    await wait(120);
  }
  throw new Error("Timed out waiting for " + url);
}

async function stopChild(child) {
  if (!child) return;
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 5000);
      killer.once("exit", () => { clearTimeout(timer); resolveExit(); });
      killer.once("error", () => { clearTimeout(timer); resolveExit(); });
    });
    return;
  }
  try { child.kill(); } catch { /* The child may already have exited. */ }
  await new Promise((resolveExit) => {
    const timer = setTimeout(resolveExit, 3000);
    child.once("exit", () => { clearTimeout(timer); resolveExit(); });
  });
}

async function stopIsolatedBrowser(profile, child) {
  if (process.platform !== "win32") return stopChild(child);
  const quotedProfile = "'" + profile.replaceAll("'", "''") + "'";
  const command = "$profile=" + quotedProfile + "; $owned=@(Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) }); $ids=@($owned | ForEach-Object { $_.ProcessId }); $roots=@($owned | Where-Object { $ids -notcontains $_.ParentProcessId }); foreach($root in $roots){ & taskkill.exe /PID $root.ProcessId /T /F | Out-Null }; exit 0";
  const killer = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise((resolveExit) => {
    const timer = setTimeout(() => { try { killer.kill(); } catch { /* Continue cleanup after timeout. */ } resolveExit(); }, 10000);
    killer.once("exit", () => { clearTimeout(timer); resolveExit(); });
    killer.once("error", () => { clearTimeout(timer); resolveExit(); });
  });
  await stopChild(child);
}

async function removeTempWithRetry(path) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 });
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code) || attempt === 9) throw error;
      await wait(350);
    }
  }
}

async function main() {
  await mkdir(media, { recursive: true });
  const temp = await mkdtemp(join(tmpdir(), "tasklatch-motion-"));
  const frames = join(temp, "frames");
  const profile = join(temp, "edge-profile");
  await mkdir(frames, { recursive: true });
  const appPort = await freePort();
  const base = "http://127.0.0.1:" + appPort + "/";
  const server = spawn(process.execPath, [join(root, "scripts", "serve.mjs")], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort) },
    stdio: "ignore",
    windowsHide: true,
  });
  const browserPort = await freePort();
  const browser = spawn(edge, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-crash-reporter",
    "--disable-breakpad",
    "--metrics-recording-only",
    "--remote-allow-origins=*",
    "--remote-debugging-port=" + browserPort,
    "--user-data-dir=" + profile,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let socket;
  let sequence = 0;
  let frameIndex = 0;
  const pending = new Map();
  try {
    await waitFor(base);
    await waitFor("http://127.0.0.1:" + browserPort + "/json/version");
    const targetResponse = await fetch("http://127.0.0.1:" + browserPort + "/json/new?" + encodeURIComponent(base + "motion-promo.html"), { method: "PUT" });
    if (!targetResponse.ok) throw new Error("Could not open the isolated motion-promo page.");
    const target = await targetResponse.json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", (event) => {
      const packet = JSON.parse(event.data);
      if (!packet.id) return;
      const waiter = pending.get(packet.id);
      if (!waiter) return;
      pending.delete(packet.id);
      packet.error ? waiter.reject(new Error(packet.error.message)) : waiter.resolve(packet.result);
    });
    const send = (method, params = {}) => new Promise((resolveCommand, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve: resolveCommand, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error("Motion-promo check failed: " + result.exceptionDetails.text);
      return result.result.value;
    };
    const capture = async (seconds) => {
      const count = Math.round(seconds * captureFps);
      for (let index = 0; index < count; index++) {
        const timelineTime = frameIndex / captureFps;
        await evaluate("window.__taskLatchMotion.seek(" + timelineTime.toFixed(3) + ")");
        const image = await send("Page.captureScreenshot", { format: "jpeg", quality: 91, fromSurface: true });
        await writeFile(join(frames, String(frameIndex++).padStart(6, "0") + ".jpg"), Buffer.from(image.data, "base64"));
      }
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1920,
      screenHeight: 1080,
    });
    await send("Page.navigate", { url: base + "motion-promo.html" });
    for (let attempt = 0; attempt < 100; attempt++) {
      const title = String(await evaluate("document.title").catch(() => ""));
      if (title.includes("TaskLatch")) break;
      await wait(100);
    }
    if (!String(await evaluate("document.title")).includes("TaskLatch")) throw new Error("Motion film page did not load.");
    for (let attempt = 0; attempt < 100; attempt++) {
      const initialStatus = await evaluate("document.querySelector('#tasklatch-demo-frame')?.contentDocument?.querySelector('#status-heading')?.textContent.trim() || ''");
      if (initialStatus === "Onboarded") break;
      await wait(100);
    }
    const initialStatus = String(await evaluate("document.querySelector('#tasklatch-demo-frame').contentDocument.querySelector('#status-heading').textContent.trim()"));
    const initialPayment = String(await evaluate("document.querySelector('#tasklatch-demo-frame').contentDocument.querySelector('#payment-label').textContent.trim()"));
    if (initialStatus !== "Onboarded" || initialPayment !== "Not recorded") {
      throw new Error("The product iframe did not start in its truthful synthetic state.");
    }

    await evaluate("window.__taskLatchMotion.seek(1.35)");
    await wait(1500);
    const cover = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(coverPath, Buffer.from(cover.data, "base64"));
    await evaluate("window.__taskLatchMotion.restart()");
    await capture(10);
    await evaluate("window.__taskLatchMotion.seek(9.8)");
    const assignedStatus = String(await evaluate("document.querySelector('#tasklatch-demo-frame').contentDocument.querySelector('#status-heading').textContent.trim()"));
    const taskReference = String(await evaluate("document.querySelector('#tasklatch-demo-frame').contentDocument.querySelector('#assignment-note').innerText"));
    if (assignedStatus !== "Task assigned" || !taskReference.includes("DEMO-TASK-17")) {
      throw new Error("The working product did not record the synthetic task assignment.");
    }
    await capture(10);
    const finalPayment = String(await evaluate("document.querySelector('#tasklatch-demo-frame').contentDocument.querySelector('#payment-label').textContent.trim()"));
    const finalBeat = String(await evaluate("document.body.dataset.scene"));
    if (finalPayment !== "Not recorded" || finalBeat !== "5") {
      throw new Error("The closing scene must keep payment unrecorded and reach the brand card.");
    }
    if (frameIndex !== captureFps * duration) throw new Error("Expected " + (captureFps * duration) + " captured frames; captured " + frameIndex + ".");

    const vtt = "WEBVTT\n\n" + cues.map(([start, end, text], index) =>
      (index + 1) + "\n" + vttTime(start) + " --> " + vttTime(end) + "\n" + text
    ).join("\n\n") + "\n";
    await writeFile(captionsPath, vtt, "utf8");
    const encoder = spawn(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", String(captureFps),
      "-i", join(frames, "%06d.jpg"),
      "-vf", "scale=1920:1080:in_range=pc:out_range=tv:flags=lanczos,format=yuv420p",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-color_range", "tv",
      "-crf", "20",
      "-preset", "fast",
      "-movflags", "+faststart",
      "-metadata", "title=TaskLatch — Onboarded is not assigned",
      "-metadata", "comment=Personal motion concept using a working synthetic-data product demo",
      "-an",
      videoPath,
    ], { stdio: "inherit", windowsHide: true });
    const exitCode = await new Promise((resolveExit, reject) => {
      encoder.once("error", reject);
      encoder.once("exit", resolveExit);
    });
    if (exitCode !== 0) throw new Error("Motion-promo video encoding failed with exit code " + exitCode + ".");
    process.stdout.write("Captured " + frameIndex + " rendered animation frames at " + captureFps + " fps and encoded a 20-second 1920x1080 film at " + outputFps + " fps.\n");
    process.stdout.write("Verified: the real demo starts onboarded, records DEMO-TASK-17, and leaves payment not recorded.\n");
    process.stdout.write("Saved " + videoPath + "\nSaved " + captionsPath + "\nSaved " + coverPath + "\n");
  } finally {
    try { socket?.close(); } catch { /* Close the isolated browser. */ }
    await stopIsolatedBrowser(profile, browser);
    await stopChild(server);
    await removeTempWithRetry(temp);
  }
}

await main();
