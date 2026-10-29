import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../../messages/en/admin.json";
import pl from "../../../../../messages/pl/admin.json";
import { manageKey } from "../unified-calendar";

const label = (locale: string, messages: unknown, category: string) => {
  const t = createTranslator({
    locale,
    messages: { admin: messages } as never,
    namespace: "admin.calendar" as never,
  }) as unknown as (key: string) => string;
  return t(manageKey(category));
};

describe("the calendar's Manage button", () => {
  it("is one whole message per category, so each language can decline the noun", () => {
    expect(manageKey("live")).toBe("manageLive");
    expect(manageKey("email")).toBe("manageEmail");
    expect(manageKey("blog")).toBe("manageBlog");
    expect(manageKey("something_new")).toBe("manageOther");
  });

  it("reads as before in English", () => {
    expect(label("en", en, "live")).toBe("Manage Live Event");
    expect(label("en", en, "email")).toBe("Manage Email Broadcast");
    expect(label("en", en, "blog")).toBe("Manage Blog Post");
    expect(label("en", en, "other")).toBe("Manage");
  });

  it("has no noun pasted in for pl", () => {
    for (const category of ["live", "email", "blog", "other"])
      expect(label("pl", pl, category)).not.toMatch(/[{}]/);
  });
});
