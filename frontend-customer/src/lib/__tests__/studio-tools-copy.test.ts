import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { AdminKitError, kitDetail } from "@shared/admin-kit/client";
import { parseRecord } from "@shared/admin-kit/json-record-modal";
import type { ModelMeta } from "@shared/admin-kit/types";
import { tEnglish } from "@/lib/english-copy";
import studio from "../../../../packages/shared/src/i18n/messages/en/studio.json";

const kit = createTranslator({
  locale: "en",
  messages: { studio } as never,
  namespace: "studio.adminKit" as never,
}) as unknown as Parameters<typeof kitDetail>[1] &
  Parameters<typeof parseRecord>[2];

describe("tEnglish", () => {
  it("is English whatever the page's language, with rich tags", () => {
    expect(tEnglish("impersonation.exit")).toBe("Exit");
    expect(
      tEnglish.rich("impersonation.viewingAs", {
        email: "a@b.c",
        by: "root",
        b: (chunks) => `[${chunks}]`,
      }),
    ).toBe("Viewing as [a@b.c] · impersonated by root");
  });
});

describe("admin kit messages", () => {
  it("words an error the server sent nothing for, and keeps the server's own words", () => {
    expect(kitDetail(new AdminKitError(502, null), kit)).toBe(
      "Request failed (502)",
    );
    expect(kitDetail(new AdminKitError(400, { detail: "No." }), kit)).toBe(
      "No.",
    );
    expect(kitDetail(new AdminKitError(400, { name: ["Bad"] }), kit)).toBe("");
  });

  it("parseRecord speaks through the translator it is given", () => {
    const meta = {
      form_fields: [{ name: "title", type: "string" }],
    } as ModelMeta;
    expect(parseRecord(meta, "[1]", kit).error).toBe("Expected a JSON object.");
    expect(parseRecord(meta, '{"x":1}', kit).error).toBe("Unknown field(s): x");
    expect(parseRecord(meta, "{", kit).error).toMatch(/^Invalid JSON: /);
    expect(parseRecord(meta, '{"title":"a"}', kit).data).toEqual({
      title: "a",
    });
  });
});
