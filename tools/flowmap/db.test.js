const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os"), path = require("node:path"), fs = require("node:fs");
const { open } = require("./db");

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fm-")), "t.db");

test("screens upsert is idempotent and getScreens omits full", () => {
  const db = open(tmpDb());
  db.upsertScreen({ key: "customer|/a", url: "/a", role: "coach", frontend: "customer", title: "A", thumb: "T", full: "F" });
  db.upsertScreen({ key: "customer|/a", url: "/a", role: "coach", frontend: "customer", title: "A2", thumb: "T2", full: "F2" });
  const list = db.getScreens();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "A2");
  assert.equal(list[0].full, undefined);
  assert.equal(db.getScreen("customer|/a").full, "F2");
  assert.equal(db.getScreen("nope"), null);
  db.close();
});

test("flow round-trips with steps + involved screens, and cascades on delete", () => {
  const db = open(tmpDb());
  for (const k of ["main|/", "main|/plans", "main|/checkout"]) {
    db.upsertScreen({ key: k, url: k.split("|")[1], role: "anon", frontend: "main", title: k, thumb: "t" });
  }
  const id = db.createFlow({ name: "Subscribe", description: "d", steps: [
    { from: "main|/", to: "main|/plans", label: "see plans" },
    { from: "main|/plans", to: "main|/checkout" },
  ] });
  const list = db.listFlows();
  assert.equal(list.length, 1);
  assert.equal(list[0].stepCount, 2);
  const flow = db.getFlow(id);
  assert.equal(flow.steps.length, 2);
  assert.equal(flow.steps[0].from, "main|/");
  assert.equal(flow.steps[0].label, "see plans");
  assert.equal(flow.screens.length, 3);
  db.deleteFlow(id);
  assert.equal(db.listFlows().length, 0);
  assert.equal(db.getFlow(id), null);
  db.close();
});

test("reset clears everything", () => {
  const db = open(tmpDb());
  db.upsertScreen({ key: "a", url: "/a" });
  db.createFlow({ name: "f", steps: [] });
  db.reset();
  assert.equal(db.getScreens().length, 0);
  assert.equal(db.listFlows().length, 0);
  db.close();
});
