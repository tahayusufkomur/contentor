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
  const thumb = "data:image/jpeg;base64,/9j/THUMB";
  const full = "data:image/jpeg;base64,/9j/FULL";
  const graph = {
    nodes: [
      { id: "customer|/a", label: "/a", role: "coach", status: "ok", cluster: "customer · Coach", thumb, full },
      { id: "customer|/b", label: "</script><img>", role: "coach", status: "skipped", cluster: "customer · Coach", thumb: null, full: null },
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
  assert.match(html, /\/9j\/THUMB/); // downscaled thumbnail inlined as the node texture
  assert.match(html, /\/9j\/FULL/); // medium lightbox image inlined
  assert.match(html, /abc1234/);
  assert.match(html, /2 global-nav links hidden/);
  // hostile label is escaped inside the JSON, not emitted raw
  assert.ok(!html.includes("</script><img>"), "raw hostile label must not appear");
  assert.match(html, /\\u003c\/script>\\u003cimg>/);
  // no external resource refs
  assert.ok(!/<script\s+src=/.test(html));
  assert.ok(!/<img\s+src="\/[^"]/.test(html));
  // imgless (skipped/error) nodes must OMIT the img key — an empty img ("") matches the
  // node[img] style and applies background-image:"" which crashes Cytoscape at runtime.
  assert.ok(!html.includes('"img":""'), "imgless nodes must omit the img key, not set img:''");
});
