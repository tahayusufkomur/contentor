// scripts/screenshot-map/vendor.js
const fs = require("node:fs");
const path = require("node:path");

function cytoscapeSource() {
  const p = path.join(__dirname, "node_modules", "cytoscape", "dist", "cytoscape.min.js");
  if (!fs.existsSync(p)) {
    throw new Error(
      "cytoscape is not installed — run `npm install` in scripts/screenshot-map (the `make screenshot-map` target does this automatically).",
    );
  }
  return fs.readFileSync(p, "utf8");
}

module.exports = { cytoscapeSource };
