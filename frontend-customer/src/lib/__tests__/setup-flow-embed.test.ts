import { describe, expect, it } from "vitest";
import { embedSrc } from "../setup-flow";

describe("embedSrc", () => {
  it("flags a path for the plain preview by default", () => {
    expect(embedSrc("/")).toBe("/?embed=1");
    expect(embedSrc("/courses")).toBe("/courses?embed=1");
  });

  it("opens the full editor with mode edit, keeping an existing query", () => {
    expect(embedSrc("/plans", "edit")).toBe("/plans?embed=edit");
    expect(embedSrc("/courses?tag=yoga", "edit")).toBe(
      "/courses?tag=yoga&embed=edit",
    );
  });
});
