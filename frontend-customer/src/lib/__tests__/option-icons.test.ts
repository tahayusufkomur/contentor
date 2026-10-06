import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OPTION_ICONS } from "@/lib/option-icons";

const PY = path.resolve(
  __dirname,
  "../../../../backend/apps/tenant_config/interview_brief.py",
);

describe("OPTION_ICONS", () => {
  it("covers every icon id the backend may send", () => {
    const src = readFileSync(PY, "utf8");
    const block = src.slice(
      src.indexOf("ICONS = ("),
      src.indexOf("\n)\n", src.indexOf("ICONS = (")),
    );
    const ids = [...block.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(50);
    const missing = ids.filter((id) => !(id in OPTION_ICONS));
    expect(missing).toEqual([]);
  });
});
