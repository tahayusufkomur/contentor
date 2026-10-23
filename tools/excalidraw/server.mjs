// Offline Excalidraw for docs/diagrams/*.excalidraw: `make diagrams`.
// Bundles editor.jsx + export.js with esbuild on start (fonts are served from
// node_modules, never a CDN) and serves a small file API:
//   GET /api/diagrams          -> ["two-server-setup", ...]
//   GET|PUT /api/diagrams/<n>  -> docs/diagrams/<n>.excalidraw
// render.mjs reuses build() + createServer() to export PNGs headless.
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIAGRAMS = path.resolve(HERE, "../../docs/diagrams");
const PAGES = { "/": "index.html", "/export.html": "export.html" };
const STATIC = {
  "/dist/": path.join(HERE, "dist"),
  "/fonts/": path.join(
    HERE,
    "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  ),
};
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const NAME = /^[a-z0-9][a-z0-9-]*$/; // a diagram's file stem; keeps writes inside docs/diagrams
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/; // a DNS-rebound page carries its own Host

export function build() {
  return esbuild.build({
    entryPoints: [path.join(HERE, "editor.jsx"), path.join(HERE, "export.js")],
    outdir: path.join(HERE, "dist"),
    bundle: true,
    splitting: true,
    format: "esm",
    minify: true,
    jsx: "automatic",
    conditions: ["production"], // @excalidraw/excalidraw/index.css has no default export condition
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".woff2": "file" },
    logLevel: "warning",
  });
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const send = (code, body = "", type = "text/plain") =>
      res
        .writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" })
        .end(body);
    if (!LOCAL_HOST.test(req.headers.host ?? ""))
      return send(403, "localhost only");
    const { pathname } = new URL(req.url, "http://localhost");
    try {
      if (pathname === "/api/diagrams") {
        const names = (await fs.readdir(DIAGRAMS))
          .filter((f) => f.endsWith(".excalidraw"))
          .map((f) => f.slice(0, -".excalidraw".length))
          .sort();
        return send(200, JSON.stringify(names), TYPES[".json"]);
      }
      if (pathname.startsWith("/api/diagrams/")) {
        const name = pathname.slice("/api/diagrams/".length);
        if (!NAME.test(name))
          return send(400, "diagram names are a-z, 0-9 and dashes");
        const file = path.join(DIAGRAMS, `${name}.excalidraw`);
        if (req.method === "GET")
          return send(200, await fs.readFile(file), TYPES[".json"]);
        if (req.method !== "PUT") return send(405);
        const body = await readBody(req);
        if (JSON.parse(body).type !== "excalidraw")
          return send(400, "not an Excalidraw scene");
        await fs.writeFile(file, body);
        return send(204);
      }
      const prefix = Object.keys(STATIC).find((p) => pathname.startsWith(p));
      const file = PAGES[pathname]
        ? path.join(HERE, PAGES[pathname])
        : prefix && path.join(STATIC[prefix], pathname.slice(prefix.length));
      if (!file || (prefix && !file.startsWith(STATIC[prefix] + path.sep)))
        return send(404);
      return send(
        200,
        await fs.readFile(file),
        TYPES[path.extname(file)] ?? "application/octet-stream",
      );
    } catch (err) {
      return send(err.code === "ENOENT" ? 404 : 500, err.message);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await fs.mkdir(DIAGRAMS, { recursive: true });
  await build();
  const port = Number(process.env.PORT) || 5199;
  createServer()
    .on("error", (err) => {
      if (err.code !== "EADDRINUSE") throw err;
      console.error(
        `Port ${port} is in use, most likely by an editor already running: open http://localhost:${port}, or pick another port: make diagrams PORT=<port>`,
      );
      process.exit(1);
    })
    .listen(port, "127.0.0.1", () =>
      console.log(
        `Contentor diagrams: http://localhost:${port}  (files: docs/diagrams/)`,
      ),
    );
}
