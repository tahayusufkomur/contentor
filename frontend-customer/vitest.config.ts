import { transformWithOxc } from "vite";
import { defineConfig } from "vitest/config";
import path from "node:path";

// Mostly pure-logic tests. Component tests (sections kit contract, cx renderer)
// render to static markup. tsconfig keeps jsx: "preserve" for Next, which makes
// Vite leave JSX untouched, so compile .tsx with the automatic runtime first.
const tsxAutomatic = {
  name: "tsx-automatic-jsx",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.endsWith(".tsx")) return null;
    return transformWithOxc(code, id, {
      lang: "tsx",
      jsx: { runtime: "automatic" },
    });
  },
};

export default defineConfig({
  plugins: [tsxAutomatic],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../packages/shared/src"),
    },
  },
  test: { include: ["src/**/__tests__/**/*.test.ts"] },
});
