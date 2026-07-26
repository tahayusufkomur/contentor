import path from "node:path";
import { defineConfig } from "vitest/config";

// Pure-logic tests only (src/lib/wizard). React components are covered by
// `npm run build` + the Playwright e2e suite, per repo convention — same
// split as frontend-customer/vitest.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../packages/shared/src"),
    },
  },
  test: { include: ["src/**/__tests__/**/*.test.ts"] },
});
