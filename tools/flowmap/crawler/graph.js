// scripts/screenshot-map/graph.js
const ROLE_TITLES = { coach: "Coach", student: "Student", superadmin: "Superadmin", anon: "Public" };

// A link target reachable from >= this fraction of a frontend's pages is treated as
// global navigation (navbar/sidebar/footer) and its incoming edges are dropped from the board.
const GLOBAL_NAV_THRESHOLD = 0.7;

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

function buildGraph(results, routesByFrontend) {
  const nodes = results.map((r) => ({
    id: nodeId(r.frontend, r.url),
    label: r.url,
    role: r.role,
    status: r.status,
    cluster: clusterLabel(r),
    thumb: r.thumb || null,
    full: r.full || null,
  }));

  // Resolve links to edges (deduped, no self-loops). Keep frontend on each edge
  // for per-frontend suppression, then drop it from the returned shape.
  const seen = new Set();
  const raw = [];
  for (const r of results) {
    const src = nodeId(r.frontend, r.url);
    const routes = routesByFrontend[r.frontend] || [];
    for (const href of r.links || []) {
      const tgt = resolveLinkToRoute(href, routes);
      if (!tgt || tgt === src) continue;
      const key = `${src}->${tgt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      raw.push({ source: src, target: tgt, frontend: r.frontend });
    }
  }

  // Global-nav suppression, per frontend.
  let suppressedCount = 0;
  const edges = [];
  for (const fe of [...new Set(results.map((r) => r.frontend))]) {
    const feEdges = raw.filter((e) => e.frontend === fe);
    const P = new Set(results.filter((r) => r.frontend === fe).map((r) => nodeId(r.frontend, r.url))).size;
    const sourcesByTarget = {};
    for (const e of feEdges) (sourcesByTarget[e.target] ||= new Set()).add(e.source);
    for (const e of feEdges) {
      const distinct = sourcesByTarget[e.target].size;
      if (P > 0 && distinct / P >= GLOBAL_NAV_THRESHOLD) {
        suppressedCount++;
      } else {
        edges.push({ source: e.source, target: e.target });
      }
    }
  }

  return { nodes, edges, suppressedCount };
}

module.exports = { nodeId, clusterLabel, normalizePath, routeMatches, resolveLinkToRoute, buildGraph };
