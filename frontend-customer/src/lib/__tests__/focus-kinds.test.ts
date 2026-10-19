import { describe, expect, it } from "vitest";

import { focusTimeKey, KIND_ROUTES, kindForCard } from "@/lib/focus/kinds";

describe("focus kinds", () => {
  it("every kind has its routes", () => {
    const rows = Object.entries(KIND_ROUTES);
    expect(rows.map(([kind]) => kind)).toContain("course");
    for (const [, routes] of rows) {
      for (const href of [routes.newHref, routes.plainHref, routes.listHref])
        expect(href).toMatch(/^\/admin\//);
      expect(routes.plainHref).not.toBe(routes.newHref);
    }
    expect(KIND_ROUTES.course).toEqual({
      newHref: "/admin/courses/new",
      plainHref: "/admin/courses/new?form=1",
      listHref: "/admin/courses",
      card: "create_course",
    });
    expect(KIND_ROUTES.event).toEqual({
      newHref: "/admin/live?new=1",
      plainHref: "/admin/live?new=1&form=1",
      listHref: "/admin/live",
      card: "create_event",
    });
    expect(KIND_ROUTES.message).toEqual({
      newHref: "/admin/messages/new",
      plainHref: "/admin/messages/new?form=1",
      listHref: "/admin/messages",
      card: "draft_announcement",
    });
    expect(focusTimeKey("course")).toBe("focus:course");
  });

  it("a card kind maps to at most one focus kind", () => {
    const cards = Object.values(KIND_ROUTES).flatMap((r) =>
      r.card ? [r.card] : [],
    );
    expect(new Set(cards).size).toBe(cards.length);
    expect(kindForCard("create_course")).toBe("course");
    expect(kindForCard("create_event")).toBe("event");
    expect(kindForCard("draft_announcement")).toBe("message");
    expect(kindForCard("edit_course")).toBeNull();
  });
});
