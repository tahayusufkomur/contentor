import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Specs mutate shared tenant state (courses, payments) — keep them serial.
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
