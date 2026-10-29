import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../messages/en/admin.json";
import pl from "../../../../messages/pl/admin.json";

const t = (locale: string, messages: unknown) =>
  createTranslator({
    locale,
    messages: { admin: messages } as never,
    namespace: "admin.owner.navbar" as never,
  }) as unknown as (key: string) => string;

describe("the navbar's 'add a suggested link' buttons", () => {
  it("are one whole message per suggestion, taking no pre-translated noun", () => {
    expect(t("en", en)("addSuggestion.events")).toBe("Add Live Sessions");
    expect(t("en", en)("addSuggestion.store")).toBe("Add Store");
    // Each language writes its own phrase, with the noun in the case it needs.
    expect(t("pl", pl)("addSuggestion.events")).not.toContain("{");
    expect(t("pl", pl)("addSuggestion.store")).not.toContain("{");
  });
});
