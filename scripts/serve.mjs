import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8782);
const types = new Map([
  [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".mp4", "video/mp4"], [".srt", "text/plain; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" }).end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }
  if (pathname.includes("\\") || pathname.split("/").some((part) => part.startsWith("."))) {
    response.writeHead(404, { "Cache-Control": "no-store" }).end("Not found");
    return;
  }
  const candidate = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!candidate.startsWith(`${root}${sep}`)) {
    response.writeHead(404, { "Cache-Control": "no-store" }).end("Not found");
    return;
  }
  try {
    const info = await stat(candidate);
    if (!info.isFile() || !types.has(extname(candidate).toLowerCase()) || info.size > 30_000_000) throw new Error("not found");
    response.writeHead(200, {
      "Content-Type": types.get(extname(candidate).toLowerCase()),
      "Content-Length": info.size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (request.method === "HEAD") response.end();
    else response.end(await readFile(candidate));
  } catch {
    response.writeHead(404, { "Cache-Control": "no-store" }).end("Not found");
  }
});

server.listen(port, host, () => process.stdout.write(`TaskLatch demo at http://${host}:${port}/\n`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
