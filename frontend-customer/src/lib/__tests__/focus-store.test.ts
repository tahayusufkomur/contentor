import { describe, expect, it, vi } from "vitest";
import type { FocusOverview, FocusState } from "@/lib/focus/api";
import {
  claimLiveCard,
  focusProgress,
  markLiveCards,
  onCoursesPage,
  openCreationFor,
  setFirstAnswer,
  takeFirstAnswer,
} from "@/lib/focus/store";

vi.mock("@/lib/api-client", () => ({ clientFetch: vi.fn() }));

const overview = (open: FocusOverview["open"]): FocusOverview => ({
  enabled: true,
  first: {},
  open,
});

const record = (id: number) => ({ id, slug: `c-${id}`, title: "C" });

describe("openCreationFor", () => {
  it("finds her open creation for this record", () => {
    const o = overview([
      { id: 4, kind: "course", record: record(10) },
      { id: 5, kind: "course", record: record(11) },
    ]);
    expect(openCreationFor(o, "course", 11)).toBe(5);
  });

  it("is null for another record, another kind, or no overview", () => {
    const o = overview([{ id: 4, kind: "course", record: record(10) }]);
    expect(openCreationFor(o, "course", 99)).toBeNull();
    expect(openCreationFor(o, "class", 10)).toBeNull();
    expect(openCreationFor(null, "course", 10)).toBeNull();
  });
});

describe("focusProgress", () => {
  it("counts the steps done", () => {
    const state = {
      steps: [
        { id: "topic", done: true },
        { id: "level", done: true },
        { id: "size", done: false },
      ],
    } as FocusState;
    expect(focusProgress(state)).toEqual({ done: 2, total: 3 });
  });
});

const reply = (token: string) => [{ cards: [{ token }] }];

describe("the assistant opening focus mode", () => {
  it("knows the courses pages, and not the new-course page", () => {
    expect(onCoursesPage("/admin/courses")).toBe(true);
    expect(onCoursesPage("/admin/courses/desk-yoga")).toBe(true);
    expect(onCoursesPage("/admin/courses/new")).toBe(false);
    expect(onCoursesPage("/admin/blog")).toBe(false);
    expect(onCoursesPage(null)).toBe(false);
  });

  it("lets a live card on a courses page open it once, never again", () => {
    markLiveCards("/admin/courses", reply("a"));
    expect(claimLiveCard("a", "/admin/courses")).toBe(true);
    expect(claimLiveCard("a", "/admin/courses")).toBe(false);
  });

  it("never lets a card that arrived elsewhere, or an old one, open it", () => {
    markLiveCards("/admin/blog", reply("b"));
    expect(claimLiveCard("b", "/admin/courses")).toBe(false);
    expect(claimLiveCard("old", "/admin/courses")).toBe(false);
  });

  it("never lets a live card open it once she is off the courses pages", () => {
    markLiveCards("/admin/courses", reply("c"));
    expect(claimLiveCard("c", "/admin/blog")).toBe(false);
    // Claimed all the same: back on a courses page, it never moves her screen either.
    expect(claimLiveCard("c", "/admin/courses")).toBe(false);
  });

  it("hands her words over once", () => {
    setFirstAnswer("a course on desk yoga");
    expect(takeFirstAnswer()).toBe("a course on desk yoga");
    expect(takeFirstAnswer()).toBeNull();
  });
});
