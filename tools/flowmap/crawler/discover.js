const fs = require("node:fs");
const path = require("node:path");

const isGroup = (s) => s.startsWith("(") && s.endsWith(")");
const isDynamic = (s) => s.startsWith("[") && s.endsWith("]");

function findPageDirs(absAppDir) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "api") continue; // route handlers, not pages
        walk(full);
      } else if (entry.name === "page.tsx") {
        out.push(path.relative(absAppDir, dir));
      }
    }
  })(absAppDir);
  return out;
}

function discover(frontend, repoRoot) {
  const absAppDir = path.join(repoRoot, frontend.appDir);
  return findPageDirs(absAppDir).map((relDir) => {
    const segs = relDir === "" ? [] : relDir.split(path.sep).filter(Boolean);
    const urlSegs = segs.filter((s) => !isGroup(s));
    const url = urlSegs.length ? "/" + urlSegs.join("/") : "/";

    let area = "";
    for (const s of segs) {
      if (Object.prototype.hasOwnProperty.call(frontend.areaRole, s)) {
        area = s;
        break;
      }
    }
    const role = frontend.areaRole[area] ?? "anon";
    const dynSegs = segs.filter(isDynamic).map((s) => s.slice(1, -1));

    return {
      frontend: frontend.name,
      host: frontend.host,
      url,
      area,
      role,
      dynamic: dynSegs.length > 0,
      segments: dynSegs,
    };
  });
}

module.exports = { discover, findPageDirs, isGroup, isDynamic };
