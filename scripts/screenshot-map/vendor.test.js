// scripts/screenshot-map/vendor.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cytoscapeSource } = require("./vendor");

test("cytoscapeSource returns the inlinable cytoscape library", () => {
  const src = cytoscapeSource();
  assert.equal(typeof src, "string");
  assert.ok(src.length > 50000, "expected a substantial library string");
  assert.ok(/cytoscape/i.test(src), "expected the source to mention cytoscape");
});
