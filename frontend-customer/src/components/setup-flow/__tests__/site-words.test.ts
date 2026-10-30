import { createElement } from "react";
import { describe, expect, it } from "vitest";
import adminPl from "../../../../messages/pl/admin.json";
import sitePl from "../../../../../packages/shared/src/i18n/messages/pl/site.json";
import siteDe from "../../../../../packages/shared/src/i18n/messages/de/site.json";
import type { ReviewCard } from "@/lib/setup-flow";
import { BuilderPreview, type BuilderData } from "../builder-preview";
import { DraftReview } from "../draft-review";
import { renderFor } from "./intl";

// A Polish creator on a German site: the studio around a preview is Polish,
// what students will read on the item card (badge, chips, billing) is German.
const pl = { locale: "pl", admin: adminPl, site: siteDe };

const data = (over: Partial<BuilderData> = {}): BuilderData => ({
  answers: {},
  review: null,
  covers: [],
  ...over,
});
const builder = (
  kind: "course" | "event" | "onsite" | "membership",
  over: Partial<BuilderData> = {},
  brandName = "",
) =>
  renderFor(
    createElement(BuilderPreview, {
      kind,
      data: data(over),
      brandName,
      disabled: false,
      onCover: async () => undefined,
    } as never),
    pl,
  );

const item = {
  title: "Yoga",
  description: "Six weeks.",
  price: "",
  currency: "EUR",
  cover_url: "https://cdn.test/a.jpg",
  covers: [],
  when: "2030-01-08T18:30:00Z",
  event_kind: "live" as const,
};
const draft = (members?: string[]) =>
  renderFor(
    createElement(DraftReview, {
      card: {
        kind: "event",
        status: "ready",
        item: { ...item, members },
      } satisfies ReviewCard,
      delay: 0,
      disabled: false,
      changing: false,
      onCover: async () => undefined,
      onRetry: () => undefined,
    } as never),
    pl,
  );

describe("the builder preview", () => {
  it("shows the badge and the chip in the site's language, the rest in the creator's", () => {
    const html = builder("event", {
      answers: { event_access: "x" },
      wayIds: { event_access: ["Free for everyone"] },
    });
    expect(html).toContain(siteDe.price.free);
    expect(html).toContain(siteDe.event.onlineLive);
    expect(html).not.toContain(sitePl.price.free);
    expect(html).not.toContain(sitePl.event.onlineLive);
    expect(html).toContain(adminPl.setupFlow.builder.pickTime);
  });

  it("names the members-only badge and the in-person chip the way students read them", () => {
    const html = builder("onsite", {
      answers: { onsite_access: "x" },
      wayIds: { onsite_access: ["Members"] },
    });
    expect(html).toContain(siteDe.price.membersOnly);
    expect(html).toContain(siteDe.event.inPerson);
    expect(html).not.toContain(sitePl.price.membersOnly);
  });

  it("writes a membership's kicker and billing line the way students read them", () => {
    const html = builder(
      "membership",
      { tiers: [{ label: "Gold", price: "9", blurb: "" }] },
      "Maya",
    );
    expect(html).toContain(
      siteDe.setupSketch.membership.replace("{brand}", "Maya"),
    );
    expect(html).toContain(siteDe.setupSketch.billing);
    expect(html).toContain(adminPl.setupFlow.builder.tiersIntro);
  });
});

describe("the draft review card", () => {
  it("shows the price badge and the chip in the site's language", () => {
    const html = draft();
    expect(html).toContain(siteDe.price.free);
    expect(html).toContain(siteDe.event.onlineLive);
    expect(html).not.toContain(sitePl.price.free);
    expect(html).not.toContain(sitePl.event.onlineLive);
    expect(html).toContain("<h2");
  });

  it("says members only in the site's language", () => {
    expect(draft(["Gold"])).toContain(siteDe.price.membersOnly);
  });
});
