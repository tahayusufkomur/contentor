import { describe, expect, it } from "vitest";
import {
  headerNavLinks,
  logoSizeClass,
  showBrandName,
  showSubscribeButton,
  visibleNavLinks,
} from "@/lib/navbar";

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

describe("visibleNavLinks", () => {
  const links = [
    { label: "Courses", href: "/courses" },
    { label: "Pricing", href: "/plans" },
  ];
  it("hides Pricing when the tenant has no plans", () => {
    expect(visibleNavLinks(links, false).map((l) => l.href)).toEqual([
      "/courses",
    ]);
    expect(visibleNavLinks(links, true)).toHaveLength(2);
  });
  it("hides Courses and the class pages with nothing behind them", () => {
    const all = [
      ...links,
      { label: "Events", href: "/events" },
      { label: "Calendar", href: "/calendar" },
      { label: "About", href: "/about" },
    ];
    const hrefs = (menu: { courses: boolean; events: boolean }) =>
      visibleNavLinks(all, true, menu).map((l) => l.href);
    expect(hrefs({ courses: false, events: false })).toEqual([
      "/plans",
      "/about",
    ]);
    expect(hrefs({ courses: true, events: true })).toHaveLength(5);
    // Unknown (the menu fetch failed): every link stays.
    expect(visibleNavLinks(all, true)).toHaveLength(5);
  });
});

describe("headerNavLinks", () => {
  const all = [
    { label: "Courses", href: "/courses" },
    { label: "Events", href: "/events" },
    { label: "Calendar", href: "/calendar" },
    { label: "Pricing", href: "/plans" },
    { label: "About", href: "/about" },
    { label: "FAQ", href: "/faq" },
  ];
  it("collapses /calendar when /events is present and hides /faq in the top bar", () => {
    expect(
      headerNavLinks(all, true, { courses: true, events: true }).map(
        (l) => l.href,
      ),
    ).toEqual(["/courses", "/events", "/plans", "/about"]);
    expect(
      headerNavLinks(all, true, { courses: true, events: true }, true).map(
        (l) => l.href,
      ),
    ).toEqual(["/courses", "/events", "/plans"]);
  });
  it("keeps /calendar when /events was removed by the coach", () => {
    const withoutEvents = all.filter((l) => l.href !== "/events");
    expect(
      headerNavLinks(withoutEvents, false, { courses: true, events: true }).map(
        (l) => l.href,
      ),
    ).toEqual(["/courses", "/calendar", "/about"]);
  });
});

describe("showSubscribeButton", () => {
  it("is for students of a tenant with plans only", () => {
    expect(showSubscribeButton(true, "student")).toBe(true);
    expect(showSubscribeButton(false, "student")).toBe(false);
    expect(showSubscribeButton(true, "owner")).toBe(false);
    expect(showSubscribeButton(true, "coach")).toBe(false);
  });
});
