// scripts/screenshot-map/capture.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classify, resolveUrl } = require("./capture");

test("classify flags HTTP errors and auth redirects, passes good pages", () => {
  assert.equal(classify({ httpStatus: 500, finalUrl: "http://h/x", role: "anon" }).status, "error");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/login", role: "coach" }).status, "error");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/admin", role: "coach" }).status, "ok");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/login", role: "anon" }).status, "ok");
});

test("resolveUrl skips unmapped dynamic routes and resolves mapped ones", () => {
  assert.equal(resolveUrl({ url: "/admin/about", dynamic: false }, { dynamic: {} }).resolvedUrl, "/admin/about");
  assert.equal(resolveUrl({ url: "/admin/courses/[id]", dynamic: true }, { dynamic: {} }).status, "skipped");
  const r = resolveUrl(
    { url: "/admin/tenants/[slug]", dynamic: true },
    { dynamic: { "/admin/tenants/[slug]": "/admin/tenants/yoga" } },
  );
  assert.equal(r.status, "ok");
  assert.equal(r.resolvedUrl, "/admin/tenants/yoga");
});
