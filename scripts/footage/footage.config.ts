// Playwright config for the footage recorder (record.ts). No import from
// @playwright/test: it does not resolve outside e2e/, and the runner only needs
// a plain object. Run from e2e/:
//   npx playwright test -c ../scripts/footage/footage.config.ts [-g <flow>]
export default {
  testDir: ".",
  testMatch: /record\.ts$/,
  timeout: 20 * 60_000,
  workers: 1,
  // A retry re-runs AI turns and recomposes sites: re-run one flow with -g instead.
  retries: 0,
  reporter: "list",
  outputDir: "../../e2e/eval-shots/footage/.pw",
};
