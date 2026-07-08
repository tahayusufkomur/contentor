import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-logic tests only (src/lib/logo). React components are covered by
// `npm run build` + the Playwright e2e suite, per repo convention.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/__tests__/**/*.test.ts"] },
});
