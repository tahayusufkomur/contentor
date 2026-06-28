// scripts/screenshot-map/graph.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveLinkToRoute, clusterLabel } = require("./graph");

const routes = [
  { frontend: "customer", host: "demo-yoga.localhost", url: "/admin/courses", dynamic: false },
  { frontend: "customer", host: "demo-yoga.localhost", url: "/admin/courses/[id]", dynamic: true },
  { frontend: "customer", host: "demo-yoga.localhost", url: "/", dynamic: false },
];

test("resolveLinkToRoute: static, dynamic, normalization, foreign host, unmatched", () => {
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/admin/courses", routes), "customer|/admin/courses");
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/admin/courses/123?x=1#h", routes), "customer|/admin/courses/[id]");
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/admin/courses/", routes), "customer|/admin/courses");
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/", routes), "customer|/");
  assert.equal(resolveLinkToRoute("http://localhost/admin/courses", routes), null); // foreign host
  assert.equal(resolveLinkToRoute("mailto:x@y.com", routes), null);
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/nope", routes), null);
});

test("clusterLabel: frontend + title-cased role", () => {
  assert.equal(clusterLabel({ frontend: "customer", role: "coach" }), "customer · Coach");
  assert.equal(clusterLabel({ frontend: "main", role: "anon" }), "main · Public");
  assert.equal(clusterLabel({ frontend: "main", role: "superadmin" }), "main · Superadmin");
});

const { buildGraph } = require("./graph");

function res(frontend, host, url, links, opts = {}) {
  return {
    frontend, host, url,
    role: opts.role || "coach",
    status: opts.status || "ok",
    png: opts.png ?? null,
    dynamic: !!opts.dynamic,
    links,
  };
}

test("buildGraph: node per result, deduped edges, no self-loops, cross-frontend dropped", () => {
  const routesByFrontend = {
    customer: [
      { frontend: "customer", host: "h", url: "/a", dynamic: false },
      { frontend: "customer", host: "h", url: "/b", dynamic: false },
    ],
  };
  const results = [
    res("customer", "h", "/a", ["http://h/b", "http://h/b", "http://h/a", "http://other/b"]),
    res("customer", "h", "/b", []),
  ];
  const g = buildGraph(results, routesByFrontend);
  assert.equal(g.nodes.length, 2);
  assert.equal(g.nodes[0].cluster, "customer · Coach");
  assert.deepEqual(g.edges, [{ source: "customer|/a", target: "customer|/b" }]);
  assert.equal(g.suppressedCount, 0);
});

test("buildGraph: suppresses edges into a target linked from >=70% of pages", () => {
  const routes = [
    { frontend: "customer", host: "h", url: "/hub", dynamic: false },
    { frontend: "customer", host: "h", url: "/p1", dynamic: false },
    { frontend: "customer", host: "h", url: "/p2", dynamic: false },
    { frontend: "customer", host: "h", url: "/p3", dynamic: false },
  ];
  const routesByFrontend = { customer: routes };
  const results = [
    res("customer", "h", "/hub", []),
    res("customer", "h", "/p1", ["http://h/hub"]),
    res("customer", "h", "/p2", ["http://h/hub"]),
    res("customer", "h", "/p3", ["http://h/hub", "http://h/p1"]),
  ];
  // /hub: 3 distinct sources of 4 pages = 75% >= 70% -> 3 edges suppressed.
  // /p1: 1 of 4 = 25% -> kept.
  const g = buildGraph(results, routesByFrontend);
  assert.equal(g.suppressedCount, 3);
  assert.deepEqual(g.edges, [{ source: "customer|/p3", target: "customer|/p1" }]);
});
