import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const ADMIN = path.join(SRC, "app/admin");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : walk(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every folder under app/admin holding a page.tsx, as a matcher: a
 *  `[param]` segment matches any one segment. */
const routes = walk(ADMIN)
  .filter((file) => path.basename(file) === "page.tsx")
  .map((file) => {
    const rel = path.relative(ADMIN, path.dirname(file));
    const segments = rel ? rel.split(path.sep) : [];
    const pattern = segments
      .map((s) => (s.startsWith("[") ? "[^/]+" : s))
      .join("/");
    return new RegExp(`^/admin${pattern ? `/${pattern}` : ""}$`);
  });

/** "/admin/..." string literals in a source file, reduced to their path:
 *  query and hash dropped, `${...}` treated as one dynamic segment. */
function adminPaths(source: string): string[] {
  return [...source.matchAll(/["'`](\/admin(?:\/[^"'`?#\s]*)?)(?=["'`?#\s])/g)]
    .map((m) =>
      m[1]
        .replace(/\$\{[^}]*\}/g, "x")
        .replace(/\$\{.*$/, "x")
        .replace(/\/$/, ""),
    )
    .filter((p) => p === "/admin" || p.startsWith("/admin/"));
}

describe("admin links", () => {
  it("finds the admin's routes", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  // Five upgrade links once pointed at /admin/billing/subscription, a folder
  // with no page: a 404 on the way to a coach's first payment.
  it("every /admin link in the app leads to a page", () => {
    const dead = walk(SRC).flatMap((file) =>
      adminPaths(readFileSync(file, "utf8"))
        .filter((p) => !routes.some((route) => route.test(p)))
        .map((p) => `${path.relative(SRC, file)}: ${p}`),
    );
    expect(dead).toEqual([]);
  });
});
