#!/usr/bin/env node

/**
 * Fixes @mediapipe/tasks-vision malformed exports field.
 * The package mixes conditional exports ("import", "require") with subpath
 * exports at the same level. They should be nested under ".".
 * See: https://nodejs.org/api/packages.html#conditional-exports
 */

const fs = require("fs");
const path = require("path");

const pkgPath = path.resolve(
  __dirname,
  "../node_modules/@mediapipe/tasks-vision/package.json",
);

if (!fs.existsSync(pkgPath)) {
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

if (pkg.exports && !pkg.exports["."]) {
  const conditionalKeys = [
    "import",
    "require",
    "default",
    "types",
    "node",
    "browser",
  ];
  const rootExport = {};
  const subpathExports = {};

  for (const [key, value] of Object.entries(pkg.exports)) {
    if (conditionalKeys.includes(key)) {
      rootExport[key] = value;
    } else {
      subpathExports[key] = value;
    }
  }

  pkg.exports = { ".": rootExport, ...subpathExports };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log("Fixed @mediapipe/tasks-vision exports field");
}
