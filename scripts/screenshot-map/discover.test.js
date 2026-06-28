const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { discover } = require("./discover");

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smap-"));
  const page = (rel) => {
    const dir = path.join(root, "app", rel);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "page.tsx"), "export default null");
  };
  page("admin/courses");
  page("(student)/dashboard");
  page("(public)/about");
  page("admin/tenants/[slug]");
  page("api/ignored"); // must be skipped
  page(""); // root marketing page
  return root;
}

test("discover derives url, area, role, and dynamic flags", () => {
  const root = fixtureRoot();
  const fe = {
    name: "t",
    appDir: "app",
    host: "h",
    areaRole: { admin: "coach", "(student)": "student", "(public)": "anon", "": "anon" },
  };
  const byUrl = Object.fromEntries(discover(fe, root).map((r) => [r.url, r]));

  assert.equal(byUrl["/admin/courses"].role, "coach");
  assert.equal(byUrl["/dashboard"].role, "student");
  assert.equal(byUrl["/about"].role, "anon");
  assert.equal(byUrl["/"].role, "anon");
  assert.equal(byUrl["/admin/tenants/[slug]"].dynamic, true);
  assert.deepEqual(byUrl["/admin/tenants/[slug]"].segments, ["slug"]);
  assert.equal(byUrl["/admin/courses"].frontend, "t");
  assert.equal(byUrl["/admin/courses"].host, "h");
  assert.equal(byUrl["/api/ignored"], undefined); // api dir skipped
});
