import { describe, expect, it } from "vitest";

import { parseAnswer } from "@/components/admin/assistant/format-answer";

describe("parseAnswer", () => {
  it("extracts a same-site link and strips it from the text", () => {
    const { text, links } = parseAnswer(
      "See the FAQ [here](/faq) for details.",
    );
    expect(text).toBe("See the FAQ  for details.");
    expect(links).toEqual([{ label: "here", href: "/faq" }]);
  });

  it("strips bold markers", () => {
    const { text } = parseAnswer("This is **important**.");
    expect(text).toBe("This is important.");
  });

  it("never matches a protocol-relative or off-site target (regression: security-review finding)", () => {
    // `//evil.com` is a protocol-relative URL — browsers resolve it as an
    // absolute off-site link (https://evil.com), not a same-site path. The
    // regex must reject any href starting with a second slash.
    const { text, links } = parseAnswer(
      "Careful: [click here](//evil.com) looks like a link.",
    );
    expect(links).toEqual([]);
    expect(text).toBe("Careful: [click here](//evil.com) looks like a link.");
  });

  it("still matches ordinary single-leading-slash paths after the fix", () => {
    const { links } = parseAnswer(
      "[Courses](/courses/yoga-basics) and [Store](/store) and [Home](/)",
    );
    expect(links).toEqual([
      { label: "Courses", href: "/courses/yoga-basics" },
      { label: "Store", href: "/store" },
      { label: "Home", href: "/" },
    ]);
  });
});
