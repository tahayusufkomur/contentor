// tools/flowmap/server.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const WEB = path.join(__dirname, "web");
const VENDOR = {
  "/vendor/cytoscape.min.js": path.join(__dirname, "node_modules/cytoscape/dist/cytoscape.min.js"),
  "/vendor/dagre.min.js": path.join(__dirname, "node_modules/dagre/dist/dagre.min.js"),
  "/vendor/cytoscape-dagre.js": path.join(__dirname, "node_modules/cytoscape-dagre/cytoscape-dagre.js"),
};
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "", size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 64 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); return; }
      data += c;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function createServer(db) {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    const method = req.method;
    let m;
    try {
      if (pathname === "/api/screens" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const arr = Array.isArray(body) ? body : [body];
        for (const s of arr) db.upsertScreen(s);
        return send(res, 200, { ok: true, count: arr.length });
      }
      if (pathname === "/api/screens" && method === "GET") return send(res, 200, db.getScreens());
      if ((m = pathname.match(/^\/api\/screens\/(.+)$/)) && method === "GET") {
        const s = db.getScreen(decodeURIComponent(m[1]));
        return s ? send(res, 200, s) : send(res, 404, { error: "not found" });
      }
      if (pathname === "/api/flows" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        if (!body || typeof body.name !== "string") return send(res, 400, { error: "name required" });
        return send(res, 200, { id: db.createFlow({ name: body.name, description: body.description, steps: body.steps || [] }) });
      }
      if (pathname === "/api/flows" && method === "GET") return send(res, 200, db.listFlows());
      if ((m = pathname.match(/^\/api\/flows\/(\d+)$/)) && method === "GET") {
        const f = db.getFlow(Number(m[1]));
        return f ? send(res, 200, f) : send(res, 404, { error: "not found" });
      }
      if ((m = pathname.match(/^\/api\/flows\/(\d+)$/)) && method === "DELETE") {
        db.deleteFlow(Number(m[1]));
        return send(res, 200, { ok: true });
      }
      if (pathname === "/api/reset" && method === "POST") {
        db.reset();
        return send(res, 200, { ok: true });
      }
      if (VENDOR[pathname]) return send(res, 200, fs.readFileSync(VENDOR[pathname]), "text/javascript");
      const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const fp = path.join(WEB, rel);
      if ((fp === WEB || fp.startsWith(WEB + path.sep)) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        return send(res, 200, fs.readFileSync(fp), TYPES[path.extname(fp)] || "application/octet-stream");
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 400, { error: String(e.message || e) });
    }
  });
}

if (require.main === module) {
  const { open } = require("./db");
  const PORT = process.env.FLOWMAP_PORT || 7878;
  const db = open(path.join(__dirname, "flowmap.db"));
  createServer(db).listen(PORT, () => console.log(`flowmap → http://localhost:${PORT}`));
}

module.exports = { createServer };
