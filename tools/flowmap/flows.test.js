// tools/flowmap/flows.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, parseFlows } = require("./flows");

test("buildPrompt includes every screen and edge and asks for JSON", () => {
  const p = buildPrompt(
    [{ key: "main|/", url: "/", role: "anon", title: "Home" }, { key: "main|/plans", url: "/plans", role: "anon", title: "Plans" }],
    [{ source: "main|/", target: "main|/plans" }],
  );
  assert.match(p, /main\|\//);
  assert.match(p, /main\|\/plans/);
  assert.match(p, /main\|\/ -> main\|\/plans/);
  assert.match(p, /JSON array/i);
});

test("parseFlows extracts a valid array, drops malformed, flags unknown keys", () => {
  const valid = ["main|/", "main|/plans"];
  const text =
    'sure:\n[{"name":"Subscribe","description":"d","steps":[{"from":"main|/","to":"main|/plans","label":"go"},{"from":"main|/plans","to":"main|/ghost"}]},{"name":"bad"}]\ndone';
  const { flows, warnings } = parseFlows(text, valid);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].name, "Subscribe");
  assert.equal(flows[0].steps.length, 2);
  assert.ok(warnings.some((w) => w.includes("main|/ghost")));
  assert.ok(warnings.some((w) => w.toLowerCase().includes("malformed")));
});

test("parseFlows handles non-JSON gracefully", () => {
  const { flows, warnings } = parseFlows("no json here", []);
  assert.equal(flows.length, 0);
  assert.ok(warnings.length > 0);
});
