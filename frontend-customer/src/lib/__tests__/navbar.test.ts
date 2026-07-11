import { describe, expect, it } from "vitest";
import { logoSizeClass, showBrandName } from "@/lib/navbar";

describe("logoSizeClass", () => {
  it("maps presets to heights and defaults to md", () => {
    expect(logoSizeClass("sm", "classic")).toBe("h-6");
    expect(logoSizeClass("md", "classic")).toBe("h-8");
    expect(logoSizeClass("lg", "classic")).toBe("h-10");
    expect(logoSizeClass("xl", "classic")).toBe("h-12");
    expect(logoSizeClass(undefined, "classic")).toBe("h-8");
  });
  it("caps xl at lg inside the pill layout", () => {
    expect(logoSizeClass("xl", "pill")).toBe("h-10");
    expect(logoSizeClass("lg", "pill")).toBe("h-10");
  });
});

describe("showBrandName", () => {
  it("shows the name when there is no logo", () => {
    expect(showBrandName({ logo_url: "", navbar_config: undefined })).toBe(
      true,
    );
    expect(showBrandName(null)).toBe(true);
  });
  it("hides the name when a logo exists", () => {
    expect(showBrandName({ logo_url: "https://x/logo.png" })).toBe(false);
  });
  it("shows it again when the toggle is on", () => {
    expect(
      showBrandName({
        logo_url: "https://x/logo.png",
        navbar_config: { show_brand_name: true },
      }),
    ).toBe(true);
  });
});
