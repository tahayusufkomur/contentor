import { describe, expect, it } from "vitest";

import { briefKeywords, rankCuratedLogos } from "@shared/logo/curated-rank";

const catalog = [
  {
    title: "Colorful Lotus Meditation",
    tags: ["yoga", "lotus", "meditation", "colorful"],
  },
  {
    title: "Female Fitness Dumbbell",
    tags: ["fitness", "dumbbell", "woman", "bold"],
  },
  {
    title: "Pole Dancer Silhouette",
    tags: ["pole dance", "dancer", "silhouette"],
  },
  { title: "Lipstick Application", tags: ["makeup", "lipstick", "elegant"] },
  {
    title: "Pregnant Woman Line Art",
    tags: ["yoga", "pilates", "pregnancy", "calm"],
  },
];

describe("briefKeywords", () => {
  it("expands wizard niche ids, underscores included", () => {
    const kw = briefKeywords({ niche: "pole_dance" });
    expect(kw.primary.has("pole dance")).toBe(true);
    expect(kw.secondary.has("dancer")).toBe(true);
  });

  it("tokenizes the coach description and drops stopwords", () => {
    const kw = briefKeywords({
      description: "I coach pregnancy fitness for new moms",
    });
    expect(kw.primary.has("pregnancy")).toBe(true);
    expect(kw.primary.has("for")).toBe(false);
  });

  it("is empty for an empty brief", () => {
    const kw = briefKeywords({});
    expect(kw.primary.size + kw.secondary.size).toBe(0);
  });
});

describe("rankCuratedLogos", () => {
  it("puts the coach's niche first", () => {
    const ranked = rankCuratedLogos(
      catalog,
      briefKeywords({ niche: "fitness" }),
    );
    expect(ranked[0]!.title).toBe("Female Fitness Dumbbell");
  });

  it("whole-phrase tag match beats a shared word", () => {
    // "belly dance" expands to dance/dancer, which also touches the pole
    // dancer — but a pole-dance coach must still see pole art on top.
    const ranked = rankCuratedLogos(
      catalog,
      briefKeywords({ niche: "pole_dance" }),
    );
    expect(ranked[0]!.title).toBe("Pole Dancer Silhouette");
  });

  it("the coach description lifts subject matches within a niche", () => {
    const ranked = rankCuratedLogos(
      catalog,
      briefKeywords({
        niche: "yoga",
        description: "Prenatal yoga for pregnancy and new moms",
      }),
    );
    expect(ranked[0]!.title).toBe("Pregnant Woman Line Art");
  });

  it("keeps catalog order when there is nothing to rank by", () => {
    const ranked = rankCuratedLogos(catalog, briefKeywords({}));
    expect(ranked.map((l) => l.title)).toEqual(catalog.map((l) => l.title));
  });

  it("keeps catalog order among equally scored logos", () => {
    const ranked = rankCuratedLogos(
      catalog,
      briefKeywords({ niche: "general" }),
    );
    expect(ranked.map((l) => l.title)).toEqual(catalog.map((l) => l.title));
  });
});

import { applyAiRank } from "@shared/logo/curated-rank";

describe("applyAiRank", () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  it("puts AI-ranked ids first in rank order, rest keep keyword order", () => {
    expect(applyAiRank(items, [3, 1]).map((x) => x.id)).toEqual([3, 1, 2, 4]);
  });

  it("skips unknown ids and handles empty/absent rank", () => {
    expect(applyAiRank(items, [99, 2]).map((x) => x.id)).toEqual([2, 1, 3, 4]);
    expect(applyAiRank(items, undefined).map((x) => x.id)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(applyAiRank(items, []).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });
});
