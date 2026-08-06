import { describe, expect, it } from "vitest";

import { docToMessage } from "@/lib/copilot/composer";

describe("docToMessage", () => {
  it("joins paragraphs with blank lines", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    };
    expect(docToMessage(doc)).toBe("First\n\nSecond");
  });

  it("renders bullet lists as dash lines", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Change:" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "the hero" }] },
              ],
            },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "the footer" }] },
              ],
            },
          ],
        },
      ],
    };
    expect(docToMessage(doc)).toBe("Change:\n\n- the hero\n- the footer");
  });

  it("keeps bold and italic as markdown markers", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "make it " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "soft", marks: [{ type: "italic" }] },
          ],
        },
      ],
    };
    expect(docToMessage(doc)).toBe("make it **bold** and *soft*");
  });

  it("returns empty string for an empty doc", () => {
    expect(docToMessage({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
  });

  it("keeps hard breaks inside a paragraph", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "line one" },
            { type: "hardBreak" },
            { type: "text", text: "line two" },
          ],
        },
      ],
    };
    expect(docToMessage(doc)).toBe("line one\nline two");
  });
});
