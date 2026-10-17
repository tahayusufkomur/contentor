import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  OWNERS,
  SPECIALIST_KEYS,
  asSpecialist,
  ownerOf,
  specialistFor,
} from "@/lib/copilot/team";
import { ACTION_KINDS } from "@/lib/copilot/types";
import adminMessages from "../../../messages/en/admin.json";

describe("specialistFor", () => {
  it.each([
    ["/admin", "assistant"],
    ["/admin/courses/new", "content"],
    ["/admin/live", "content"],
    ["/admin/downloads", "content"],
    ["/admin/inbox", "community"],
    ["/admin/community", "community"],
    ["/admin/messages/new", "marketing"],
    ["/admin/blog", "marketing"],
    ["/admin/store/bundles/new", "finance"],
    ["/admin/payouts", "finance"],
    ["/admin/media", "designer"],
    ["/admin/assistant", "assistant"],
    ["/admin/settings", "assistant"],
    ["/", "designer"],
    ["/courses/morning-flow", "designer"],
  ])("%s is answered by the %s", (pathname, key) => {
    expect(specialistFor(pathname)).toBe(key);
  });

  it("falls back to the Assistant with no path", () => {
    expect(specialistFor(null)).toBe("assistant");
  });
});

describe("asSpecialist", () => {
  it("keeps a known key and turns anything else into the Assistant", () => {
    expect(asSpecialist("finance")).toBe("finance");
    for (const junk of [undefined, null, "ceo", 7, {}]) {
      expect(asSpecialist(junk)).toBe("assistant");
    }
  });
});

describe("ownerOf", () => {
  it("signs each action with its owner", () => {
    expect(ownerOf("set_logo")).toBe("designer");
    expect(ownerOf("create_course")).toBe("content");
    expect(ownerOf("draft_announcement")).toBe("community");
    expect(ownerOf("unknown")).toBe("assistant");
  });

  it("gives every action kind an owner", () => {
    for (const kind of ACTION_KINDS) {
      expect(SPECIALIST_KEYS).toContain(OWNERS[kind]);
    }
  });
});

describe("the team matches the backend", () => {
  // Present in the repo checkout, absent inside the frontend container.
  const teamPy = path.resolve(
    __dirname,
    "../../../../backend/apps/core/copilot/team.py",
  );
  it.skipIf(!existsSync(teamPy))("keys, names and owners", () => {
    const source = readFileSync(teamPy, "utf8");
    const keys = [
      ...(source.match(/^KEYS = \(([^)]*)\)/m)?.[1] ?? "").matchAll(
        /"([a-z]+)"/g,
      ),
    ].map((m) => m[1]);
    expect(keys).toEqual([...SPECIALIST_KEYS]);

    const block = (name: string) =>
      Object.fromEntries(
        [
          ...(
            source.match(
              new RegExp(`^${name} = \\{([\\s\\S]*?)^\\}`, "m"),
            )?.[1] ?? ""
          ).matchAll(/^ {4}"([a-z_]+)": "([^"]+)",$/gm),
        ].map((m) => [m[1], m[2]]),
      );
    const specialists = adminMessages.team.specialists as Record<
      string,
      { name: string }
    >;
    expect(block("NAMES")).toEqual(
      Object.fromEntries(SPECIALIST_KEYS.map((k) => [k, specialists[k].name])),
    );
    expect(block("OWNERS")).toEqual(OWNERS);
  });
});
