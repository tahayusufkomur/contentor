// scripts/screenshot-map/auth.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sessionCookie } = require("./auth");

test("sessionCookie builds a contentor cookie scoped to the host", () => {
  const c = sessionCookie("jwt123", "yoga.localhost");
  assert.equal(c.name, "contentor_access_token");
  assert.equal(c.value, "jwt123");
  assert.equal(c.domain, "yoga.localhost");
  assert.equal(c.path, "/");
  assert.equal(c.httpOnly, true);
  assert.equal(c.secure, false);
  assert.equal(c.sameSite, "Lax");
});
