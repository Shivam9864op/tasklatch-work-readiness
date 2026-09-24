import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
const allowedMediaExtensions = new Set([".mp4", ".vtt", ".png"]);
const allowedCoverPaths = new Set([
  "media/tasklatch-quick-demo-cover.png",
  "media/tasklatch-motion-promo-cover.png",
]);
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      const ext = extname(entry.name).toLowerCase();
      const relativePath = path.slice(root.length + 1).replaceAll("\\", "/");
      if (imageExtensions.has(ext) && !allowedCoverPaths.has(relativePath)) errors.push("Unexpected image file: " + path);
      if (path.includes(`${join("media", "")}`) && !allowedMediaExtensions.has(ext)) errors.push(`Unexpected media file: ${path}`);
    }
  }
}

await walk(root);
const html = await readFile(join(root, "index.html"), "utf8");
const app = await readFile(join(root, "src", "app.mjs"), "utf8");
const css = await readFile(join(root, "styles.css"), "utf8");
if (/<img\b|<picture\b|<svg\b/i.test(html + app)) errors.push("An image element or SVG was found in the interface source.");
if (/https?:\/\/fonts\.|fonts\.googleapis|<img\b/i.test(html + app + css)) errors.push("An external font or image request was found.");
if (!html.includes("<video") && !app.includes("<video") && !app.includes("video-card")) errors.push("Video walkthrough player is missing.");
const quickDemoHtml = await readFile(join(root, "quick-demo.html"), "utf8");
const quickDemoPage = await readFile(join(root, "src", "quick-demo-page.mjs"), "utf8");
if (!quickDemoHtml.includes("quick-demo.css") || !quickDemoPage.includes("assignQuickDemoTask")) errors.push("Interactive one-feature demo source is missing.");
const motionHtml = await readFile(join(root, "motion-promo.html"), "utf8");
const motionScript = await readFile(join(root, "src", "motion-promo.mjs"), "utf8");
const motionCss = await readFile(join(root, "motion-promo.css"), "utf8");
const motionRecorder = await readFile(join(root, "scripts", "record-motion-promo.mjs"), "utf8");
if (!motionHtml.includes('src="./quick-demo.html?source=motion-film"') || !motionScript.includes('querySelector("#record-sample")')) {
  errors.push("Motion promo must present and operate the working synthetic product demo.");
}
if (!motionScript.includes('"Task assigned"') || !motionRecorder.includes('"Not recorded"') || !motionCss.includes(".payment-spotlight")) {
  errors.push("Motion promo must distinguish a recorded task from unrecorded payment.");
}
if (!motionRecorder.includes("const captureFps = 60") || !motionRecorder.includes("const outputFps = 60") || motionRecorder.includes("minterpolate=")) {
  errors.push("Motion promo must capture and export actual animation frames at 60 fps without synthetic interpolation.");
}
for (const file of ["tasklatch-motion-promo.mp4", "tasklatch-motion-promo.en.vtt", "tasklatch-motion-promo-cover.png"]) {
  try {
    const info = await stat(join(root, "media", file));
    if (info.size < 100) errors.push("Motion-promo asset is unexpectedly small: " + file);
  } catch {
    errors.push("Motion-promo asset is missing: " + file);
  }
}
const serverSource = await readFile(join(root, "scripts", "serve.mjs"), "utf8");
if (!serverSource.includes("img-src 'none'")) errors.push("Static server must disallow images by policy.");
const packageFile = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (!packageFile.scripts?.test) errors.push("Test script is missing.");
if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  const mediaDirectory = join(root, "media");
  let media = [];
  try { media = (await readdir(mediaDirectory)).filter((name) => !name.startsWith(".")); } catch {}
  process.stdout.write("Project checks passed. One screenshot cover, no app image loads. Video/subtitle assets: " + media.length + ".\n");
}
