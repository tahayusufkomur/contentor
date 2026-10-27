import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewCard, ReviewItem } from "@/lib/setup-flow";
import { BusyOverlay } from "../busy-overlay";
import { DraftReview } from "../draft-review";

const item: ReviewItem = {
  title: "Yoga for desk workers",
  description: "Six weeks to a looser back.",
  price: "49.00",
  currency: "EUR",
  cover_url: "https://cdn.test/a.jpg",
  covers: [
    { value: "a", url: "https://cdn.test/a.jpg", current: true },
    { value: "b", url: "https://cdn.test/b.jpg", current: false },
  ],
  modules: [{ title: "Week 1", lessons: ["Neck", "Shoulders"] }],
};
const card = (over: Partial<ReviewCard>): ReviewCard => ({
  kind: "course",
  status: "ready",
  item,
  ...over,
});
const render = (c: ReviewCard, changing = false, withTrial = false) =>
  renderToStaticMarkup(
    createElement(DraftReview, {
      card: c,
      delay: 0,
      disabled: false,
      changing,
      onCover: async () => undefined,
      ...(withTrial && { onTrial: async () => undefined }),
      onRetry: () => undefined,
    }),
  );

describe("DraftReview while it updates", () => {
  it("covers a redrafted card with a message that names it, and its steps", () => {
    const html = render(card({ status: "building" }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Rewriting your course with your changes…");
    expect(html).toContain("Outlining the modules");
    expect(html).toContain("Writing the lessons");
    // The draft it replaces stays underneath.
    expect(html).toContain("Yoga for desk workers");
  });

  it("names the kind of thing it is rewriting", () => {
    const html = render(card({ kind: "event", status: "building" }));
    expect(html).toContain("Rewriting your live session with your changes…");
  });

  it("disables the cover picker while it is rewritten", () => {
    const covers = (html: string) =>
      html.match(/<button[^>]*aria-label="Use this cover"[^>]*>/g) ?? [];
    expect(covers(render(card({ status: "ready" })))[0]).not.toContain(
      "disabled",
    );
    expect(covers(render(card({ status: "building" })))[0]).toContain(
      "disabled",
    );
  });

  it("says so from the moment a change is sent, before the rewrite starts", () => {
    const html = render(card({ status: "ready" }), true);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Reading your changes…");
    expect(html).not.toContain("Rewriting your course");
  });

  it("shows no cover on a finished draft", () => {
    const html = render(card({ status: "ready" }));
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("Rewriting");
    expect(html).not.toContain("Reading your changes");
  });

  it("keeps the first draft's own skeleton (no cover over nothing)", () => {
    const html = render(card({ status: "building", item: null }));
    expect(html).toContain("Drafting your first course…");
    expect(html).not.toContain("Rewriting");
  });
});

describe("DraftReview's free trial switch", () => {
  const weekly = (trial?: { offered: boolean; on: boolean }) =>
    card({
      kind: "event",
      item: {
        ...item,
        modules: undefined,
        when: "2030-01-08T18:30:00Z",
        repeats: "Tuesdays at 6:30 PM",
        event_kind: "live",
        trial,
      },
    });
  const switchOf = (html: string) =>
    html.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? "";

  it("asks whether the first session should be a free trial, off to begin with", () => {
    const html = render(weekly({ offered: true, on: false }), false, true);
    expect(html).toContain("Make the first session a free trial?");
    expect(switchOf(html)).toContain('aria-checked="false"');
    expect(html).not.toContain("First session is a free trial");
  });

  it("explains what a trial class is behind an ⓘ that starts closed", () => {
    const html = render(weekly({ offered: true, on: false }), false, true);
    expect(html).toContain("What is a free trial class?");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("lets someone try what you teach");
    // Her own price in the example, in her currency.
    expect(html).toContain("Each session costs €49");
  });

  it("shows the switch on, and says so beside the date, once she turned it on", () => {
    const html = render(weekly({ offered: true, on: true }), false, true);
    expect(switchOf(html)).toContain('aria-checked="true"');
    expect(html).toContain("First session is a free trial");
  });

  it("is not there for a one-time, free or course draft, or without a way to answer", () => {
    expect(
      render(weekly({ offered: false, on: false }), false, true),
    ).not.toContain("free trial?");
    expect(render(weekly(undefined), false, true)).not.toContain("free trial?");
    expect(render(weekly({ offered: true, on: false }))).not.toContain(
      "free trial?",
    );
    expect(render(card({}), false, true)).not.toContain("free trial?");
  });

  it("never calls the creator a teacher, coach or instructor", () => {
    const html = render(weekly({ offered: true, on: false }), false, true);
    expect(html.match(/free trial\?[\s\S]*/i)?.[0]).not.toMatch(
      /teacher|coach|instructor/i,
    );
  });
});

describe("BusyOverlay", () => {
  it("gates every animation behind motion-safe, leaving a solid tint and the message", () => {
    for (const variant of ["card", "compact", "screen"] as const) {
      const html = renderToStaticMarkup(
        createElement(BusyOverlay, {
          variant,
          message: "Making that change…",
          steps: ["One", "Two"],
        }),
      );
      expect(html).toContain("Making that change…");
      expect(html).toContain("bg-[rgb(251_250_247/0.7)]");
      const loose = [...html.matchAll(/class="([^"]*)"/g)]
        .flatMap((m) => m[1].split(/\s+/))
        .filter((c) => c.includes("animate-") && !c.startsWith("motion-safe:"));
      // Only <Spinner>'s own turn (the one animation every wait shares).
      expect([...new Set(loose)]).toEqual([["animate", "spin"].join("-")]);
    }
  });
});
