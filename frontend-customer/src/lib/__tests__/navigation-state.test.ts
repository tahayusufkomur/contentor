import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProgressController,
  defaultActiveMatch,
  isNavItemActive,
} from "@shared/navigation/navigation-state";

describe("defaultActiveMatch", () => {
  it("matches an exact path", () => {
    expect(defaultActiveMatch("/admin/students", "/admin/students")).toBe(true);
  });

  it("matches a nested child on a segment boundary", () => {
    expect(defaultActiveMatch("/admin/students/7", "/admin/students")).toBe(true);
  });

  it("does not treat /admin as a prefix of everything", () => {
    expect(defaultActiveMatch("/admin/students", "/admin")).toBe(false);
    expect(defaultActiveMatch("/admin", "/admin")).toBe(true);
  });

  it("does not match a sibling that merely shares a string prefix", () => {
    // Regression: both /admin/live and /admin/live-streams are nav items, and
    // the old `pathname.startsWith(href)` highlighted both at once.
    expect(defaultActiveMatch("/admin/live-streams", "/admin/live")).toBe(false);
    expect(defaultActiveMatch("/admin/live-streams", "/admin/live-streams")).toBe(true);
  });
});

describe("isNavItemActive", () => {
  it("uses pathname when nothing is pending", () => {
    const state = { pathname: "/admin/calendar", pendingHref: null };
    expect(isNavItemActive(state, "/admin/calendar")).toBe(true);
    expect(isNavItemActive(state, "/admin/students")).toBe(false);
  });

  it("lets a pending href win over the committed pathname", () => {
    const state = { pathname: "/admin/calendar", pendingHref: "/admin/students" };
    expect(isNavItemActive(state, "/admin/students")).toBe(true);
    expect(isNavItemActive(state, "/admin/calendar")).toBe(false);
  });

  it("honours a custom matcher", () => {
    const state = { pathname: "/x", pendingHref: null };
    expect(isNavItemActive(state, "/y", () => true)).toBe(true);
  });
});

describe("createProgressController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(delayMs = 150) {
    const onShow = vi.fn();
    const onHide = vi.fn();
    return { onShow, onHide, c: createProgressController({ delayMs, onShow, onHide }) };
  }

  it("stays hidden when the navigation finishes inside the delay window", () => {
    const { c, onShow, onHide } = setup();
    c.start();
    vi.advanceTimersByTime(100);
    c.finish();
    vi.advanceTimersByTime(1000);
    expect(onShow).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
  });

  it("shows once the delay elapses", () => {
    const { c, onShow } = setup();
    c.start();
    vi.advanceTimersByTime(150);
    expect(onShow).toHaveBeenCalledOnce();
  });

  it("hides when a shown navigation finishes", () => {
    const { c, onHide } = setup();
    c.start();
    vi.advanceTimersByTime(150);
    c.finish();
    expect(onHide).toHaveBeenCalledOnce();
  });

  it("ignores a repeated start while already tracking", () => {
    const { c, onShow } = setup();
    c.start();
    c.start();
    vi.advanceTimersByTime(150);
    expect(onShow).toHaveBeenCalledOnce();
  });

  it("is idempotent on finish so back/forward cannot strand the bar", () => {
    const { c, onHide } = setup();
    c.finish();
    expect(onHide).not.toHaveBeenCalled();
    c.start();
    vi.advanceTimersByTime(150);
    c.finish();
    c.finish();
    expect(onHide).toHaveBeenCalledOnce();
  });

  it("cancels a pending timer on dispose", () => {
    const { c, onShow } = setup();
    c.start();
    c.dispose();
    vi.advanceTimersByTime(1000);
    expect(onShow).not.toHaveBeenCalled();
  });
});
