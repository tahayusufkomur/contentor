// scripts/screenshot-map/render.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { render, summarize } = require("./render");

test("summarize counts statuses", () => {
  assert.deepEqual(
    summarize([{ status: "ok" }, { status: "error" }, { status: "ok" }, { status: "skipped" }]),
    { ok: 2, error: 1, skipped: 1 },
  );
});

test("render builds a self-contained cytoscape board", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const graph = {
    nodes: [
      { id: "customer|/a", label: "/a", role: "coach", status: "ok", cluster: "customer · Coach", png },
      { id: "customer|/b", label: "</script><img>", role: "coach", status: "skipped", cluster: "customer · Coach", png: null },
    ],
    edges: [{ source: "customer|/a", target: "customer|/b" }],
    suppressedCount: 2,
  };
  const html = render(
    graph,
    { generatedAt: "2026-06-28", commit: "abc1234", summary: { ok: 1, error: 0, skipped: 1 } },
    { cytoscapeSrc: "/*CYTO_STUB*/" },
  );

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /CYTO_STUB/); // library inlined (stub)
  assert.match(html, /id="cy"/); // canvas container
  assert.match(html, /cytoscape\(/); // boots cytoscape
  assert.match(html, /data:image\/png;base64,/); // thumbnail inlined
  assert.match(html, /abc1234/);
  assert.match(html, /2 global-nav links hidden/);
  // hostile label is escaped inside the JSON, not emitted raw
  assert.ok(!html.includes("</script><img>"), "raw hostile label must not appear");
  assert.match(html, /\\u003c\/script>\\u003cimg>/);
  // no external resource refs
  assert.ok(!/<script\s+src=/.test(html));
  assert.ok(!/<img\s+src="\/[^"]/.test(html));
});
