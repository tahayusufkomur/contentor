import { describe, expect, it } from "vitest";
import { initialsFor } from "@shared/logo/catalog";
import { applyCase } from "@shared/logo/logo-renderer";
import type { TextStyle } from "@shared/logo/types";

const upper = { case: "upper" } as TextStyle;
const title = { case: "title" } as TextStyle;

describe("logo capitals follow the site's language", () => {
  it("writes Turkish dotted capitals", () => {
    expect(applyCase("pilates", upper, "tr")).toBe("PİLATES");
    expect(applyCase("pilates", upper, "en")).toBe("PILATES");
    expect(applyCase("ipek yoga", title, "tr")).toBe("İpek Yoga");
  });

  it("takes initials in the language too", () => {
    expect(initialsFor("ipek yoga", "tr")).toBe("İY");
    expect(initialsFor("ipek yoga", "en")).toBe("IY");
  });
});
