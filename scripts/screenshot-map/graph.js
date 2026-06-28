// scripts/screenshot-map/graph.js
const ROLE_TITLES = { coach: "Coach", student: "Student", superadmin: "Superadmin", anon: "Public" };

function nodeId(frontend, url) {
  return `${frontend}|${url}`;
}

function clusterLabel(result) {
  const role = ROLE_TITLES[result.role] || (result.role.charAt(0).toUpperCase() + result.role.slice(1));
  return `${result.frontend} · ${role}`;
}

function normalizePath(p) {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function routeMatches(routeUrl, dynamic, p) {
  if (!dynamic) return routeUrl === p;
  const a = routeUrl.split("/");
  const b = p.split("/");
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const seg = a[i];
    if (seg.startsWith("[") && seg.endsWith("]")) continue;
    if (seg !== b[i]) return false;
  }
  return true;
}

function resolveLinkToRoute(href, routes) {
  if (!routes || routes.length === 0) return null;
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.host !== routes[0].host) return null;
  const p = normalizePath(url.pathname);
  for (const r of routes) {
    if (routeMatches(r.url, r.dynamic, p)) return nodeId(r.frontend, r.url);
  }
  return null;
}

module.exports = { nodeId, clusterLabel, normalizePath, routeMatches, resolveLinkToRoute };
