import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
const allowedMediaExtensions = new Set([".mp4", ".vtt"]);
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      const ext = extname(entry.name).toLowerCase();
      if (imageExtensions.has(ext)) errors.push(`Image file found: ${path}`);
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
  process.stdout.write(`Project checks passed. Image files: 0. Video/subtitle assets: ${media.length}.\n`);
}
