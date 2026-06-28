// scripts/screenshot-map/render.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { render, summarize } = require("./render");

test("summarize counts statuses", () => {
  const s = summarize([{ status: "ok" }, { status: "ok" }, { status: "error" }, { status: "skipped" }]);
  assert.deepEqual(s, { ok: 2, error: 1, skipped: 1 });
});

test("render produces self-contained html with both frontends and inlined thumbnails", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const results = [
    { frontend: "main", area: "admin", role: "superadmin", url: "/admin/tenants", status: "ok", note: "", png },
    { frontend: "customer", area: "admin", role: "coach", url: "/admin/courses", status: "ok", note: "", png: null },
    { frontend: "customer", area: "admin", role: "coach", url: "/admin/courses/[id]", status: "skipped", note: "no target", png: null },
  ];
  const html = render(results, { generatedAt: "2026-06-27T00:00:00Z", commit: "abc1234", summary: summarize(results) });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Contentor screenshot map/);
  assert.match(html, /data:image\/png;base64,/); // thumbnail inlined
  assert.match(html, />main</);
  assert.match(html, />customer</);
  assert.match(html, /skipped/);
  assert.match(html, /abc1234/);
  assert.ok(!/<img src="\/[^"]/.test(html)); // no external image refs
});
