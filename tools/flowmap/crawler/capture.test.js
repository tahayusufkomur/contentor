// scripts/screenshot-map/capture.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classify, resolveUrl } = require("./capture");

test("classify flags HTTP errors and auth redirects, passes good pages", () => {
  assert.equal(classify({ httpStatus: 500, finalUrl: "http://h/x", role: "anon" }).status, "error");
  assert.equal(classify({ httpStatus: 500, finalUrl: "http://h/x", role: "anon" }).note, "HTTP 500");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/login", role: "coach" }).status, "error");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/admin", role: "coach" }).status, "ok");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/login", role: "anon" }).status, "ok");
});

test("resolveUrl skips unmapped dynamic routes and resolves mapped ones", () => {
  assert.equal(resolveUrl({ url: "/admin/about", dynamic: false }, { dynamic: {} }).resolvedUrl, "/admin/about");
  assert.equal(resolveUrl({ url: "/admin/about", dynamic: false }, { dynamic: {} }).status, "ok");
  assert.equal(resolveUrl({ url: "/admin/courses/[id]", dynamic: true }, { dynamic: {} }).status, "skipped");
  assert.equal(resolveUrl({ url: "/admin/courses/[id]", dynamic: true }, { dynamic: {} }).note, "no target in targets.json");
  const r = resolveUrl(
    { url: "/admin/tenants/[slug]", dynamic: true },
    { dynamic: { "/admin/tenants/[slug]": "/admin/tenants/yoga" } },
  );
  assert.equal(r.status, "ok");
  assert.equal(r.resolvedUrl, "/admin/tenants/yoga");
});

test("resolveUrl prefers a per-frontend mapping over the flat one", () => {
  const targets = {
    dynamic: {
      "/admin/m/[model]": "/admin/m/flat",
      main: { "/admin/m/[model]": "/admin/m/platform-plans" },
      customer: { "/admin/m/[model]": "/admin/m/users" },
    },
  };
  assert.equal(resolveUrl({ url: "/admin/m/[model]", dynamic: true, frontend: "main" }, targets).resolvedUrl, "/admin/m/platform-plans");
  assert.equal(resolveUrl({ url: "/admin/m/[model]", dynamic: true, frontend: "customer" }, targets).resolvedUrl, "/admin/m/users");
  // a frontend with no per-frontend entry falls back to the flat map
  assert.equal(resolveUrl({ url: "/admin/m/[model]", dynamic: true, frontend: "other" }, targets).resolvedUrl, "/admin/m/flat");
});
