import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAdminNav } from "@/lib/admin-nav";

const SRC = path.resolve(__dirname, "../..");

/** Pages whose <h1> lives in a component rather than in page.tsx. */
const TITLE_FILE: Record<string, string> = {};
/** The inbox is a mail client: its folder rail is its heading. */
const NO_TITLE = new Set(["/admin/inbox"]);

describe("one name per page", () => {
  const items = buildAdminNav((key) => key)
    .flatMap((section) => section.items)
    .filter((item) => !item.external && !NO_TITLE.has(item.href));

  it.each(items.map((item) => [item.href, item.key] as const))(
    "%s titles itself nav.items.%s",
    (href, key) => {
      const rel =
        TITLE_FILE[href] ??
        path.join("app", href === "/admin" ? "admin" : href, "page.tsx");
      const file = path.join(SRC, rel);
      expect(existsSync(file), `${rel} exists`).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(
        new RegExp(`<h1[^>]*>[\\s\\S]{0,80}t\\("nav\\.items\\.${key}"\\)`),
      );
    },
  );
});
