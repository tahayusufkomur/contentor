// tools/flowmap/server.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os"), path = require("node:path"), fs = require("node:fs");
const { open } = require("./db");
const { createServer } = require("./server");

async function withServer(fn) {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fm-")), "t.db");
  const db = open(dbPath);
  const srv = createServer(db);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}`;
  try { await fn(base); } finally { srv.close(); db.close(); }
}
const post = (base, p, body) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("screens + flows round-trip over HTTP", async () => {
  await withServer(async (base) => {
    let r = await post(base, "/api/screens", [
      { key: "main|/", url: "/", role: "anon", frontend: "main", title: "Home", thumb: "t1", full: "f1" },
      { key: "main|/plans", url: "/plans", role: "anon", frontend: "main", title: "Plans", thumb: "t2", full: "f2" },
    ]);
    assert.equal(r.status, 200);
    const screens = await (await fetch(base + "/api/screens")).json();
    assert.equal(screens.length, 2);
    assert.equal(screens[0].full, undefined);
    const one = await (await fetch(base + "/api/screens/" + encodeURIComponent("main|/"))).json();
    assert.equal(one.full, "f1");
    const { id } = await (await post(base, "/api/flows", { name: "Subscribe", steps: [{ from: "main|/", to: "main|/plans", label: "go" }] })).json();
    const flows = await (await fetch(base + "/api/flows")).json();
    assert.equal(flows.length, 1);
    assert.equal(flows[0].stepCount, 1);
    const flow = await (await fetch(base + "/api/flows/" + id)).json();
    assert.equal(flow.steps.length, 1);
    assert.equal(flow.screens.length, 2);
    assert.equal((await fetch(base + "/api/flows/" + id, { method: "DELETE" })).status, 200);
    assert.equal((await (await fetch(base + "/api/flows")).json()).length, 0);
  });
});

test("bad json -> 400, unknown route -> 404, index served", async () => {
  await withServer(async (base) => {
    let r = await fetch(base + "/api/flows", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    assert.equal(r.status, 400);
    assert.equal((await fetch(base + "/api/nope")).status, 404);
    r = await fetch(base + "/");
    assert.equal(r.status, 200);
    assert.match(await r.text(), /flowmap/i);
  });
});
