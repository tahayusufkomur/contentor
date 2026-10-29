import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import admin from "../../../../../messages/en/admin.json";
import studio from "@shared/i18n/messages/en/studio.json";

const ts = createTranslator({
  locale: "en",
  messages: { studio },
  namespace: "studio",
});
const ta = createTranslator({
  locale: "en",
  messages: { admin },
  namespace: "admin",
});

describe("counts the creator reads or types", () => {
  it("the free window's day input is followed by a counted unit", () => {
    const text = (count: number) =>
      ts.rich("access.window.firstDaysAfter", {
        count,
        days: () => "[7]",
      });
    expect(text(1)).toBe("For the first [7] day after someone joins the site");
    expect(text(7)).toBe("For the first [7] days after someone joins the site");
  });

  it("the bulk bar's 'N selected' is a plural", () => {
    expect(ta("mediaBrowser.selected", { count: 1 })).toBe("1 selected");
    expect(ta("mediaBrowser.selected", { count: 3 })).toBe("3 selected");
  });
});
