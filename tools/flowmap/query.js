// tools/flowmap/query.js — read-only text view of the flowmap DB (no server, no browser).
// Usage:
//   node --experimental-sqlite query.js            # all flows + their steps
//   node --experimental-sqlite query.js <id>       # one flow
//   node --experimental-sqlite query.js screens    # list valid screen keys
const fs = require("node:fs");
const path = require("node:path");
const { open } = require("./db");

const DB_PATH = path.join(__dirname, "flowmap.db");

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("No flowmap.db yet. Run: make flowmap-register");
    process.exit(1);
  }
  const db = open(DB_PATH);
  const arg = (process.argv[2] || "").trim();

  if (arg === "screens") {
    const screens = db.getScreens();
    console.log(`${screens.length} screens (key [role] "title"):\n`);
    for (const s of screens) {
      console.log(`  ${s.key}  [${s.role || "?"}]${s.title ? `  "${s.title}"` : ""}`);
    }
    db.close();
    return;
  }

  const flows = db.listFlows();
  if (!flows.length) {
    console.log("No flows registered. Run: make flowmap-register");
    db.close();
    return;
  }

  const only = /^\d+$/.test(arg) ? Number(arg) : null;
  if (only !== null && !flows.some((f) => f.id === only)) {
    console.error(`No flow with id ${only}. Available ids: ${flows.map((f) => f.id).join(", ")}`);
    db.close();
    process.exit(1);
  }
  const list = only !== null ? flows.filter((f) => f.id === only) : flows;

  for (const meta of list) {
    const flow = db.getFlow(meta.id);
    console.log(`#${flow.id}  ${flow.name}${flow.description ? ` — ${flow.description}` : ""}`);
    for (const st of flow.steps) {
      const arrow = st.label ? `--[${st.label}]-->` : "-->";
      console.log(`    ${st.from}  ${arrow}  ${st.to}`);
    }
    console.log("");
  }
  console.log(`${list.length} flow${list.length === 1 ? "" : "s"}${only !== null ? "" : ` of ${flows.length}`}.`);
  db.close();
}

main();
