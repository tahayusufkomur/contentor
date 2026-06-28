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
