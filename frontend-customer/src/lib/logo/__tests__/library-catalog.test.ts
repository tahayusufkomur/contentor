import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCuratedCatalog, rankForBrief } from "../library-catalog";

afterEach(() => vi.restoreAllMocks());

const RAW = [
  {
    title: "Yoga",
    filename: "yoga.png",
    prompt: "a yoga logo",
    tags: "yoga, wellness, zen",
    image_url: "http://storage.local/platform/curated-logos/yoga.png?sig=1",
  },
  {
    title: "Chef",
    filename: "chef.png",
    prompt: "a chef logo",
    tags: "cooking, food",
    image_url: "http://storage.local/platform/curated-logos/chef.png?sig=2",
  },
];

describe("library-catalog", () => {
  it("fetches the catalog API, splits tags, and passes image_url through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => RAW }),
    );
    const logos = await fetchCuratedCatalog();
    expect(fetch).toHaveBeenCalledWith("/api/v1/logos/curated/");
    expect(logos[0]).toMatchObject({
      title: "Yoga",
      filename: "yoga.png",
      imageUrl: RAW[0].image_url,
      tags: ["yoga", "wellness", "zen"],
    });
  });

  it("returns [] when the catalog is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchCuratedCatalog()).toEqual([]);
  });

  it("ranks by combined niche + style-chip tag overlap, stable within ties", () => {
    const logos = [
      { title: "Yoga", filename: "y.png", prompt: "", tags: ["yoga", "minimal"], imageUrl: "y" },
      { title: "Chef", filename: "c.png", prompt: "", tags: ["cooking"], imageUrl: "c" },
      { title: "Zen", filename: "z.png", prompt: "", tags: ["yoga"], imageUrl: "z" },
    ];
    const ranked = rankForBrief(logos, { niche: "yoga studio", styleChips: ["Minimal"] });
    // Yoga matches yoga + minimal (2); Zen matches yoga (1); Chef (0). Ties keep input order.
    expect(ranked.map((l) => l.title)).toEqual(["Yoga", "Zen", "Chef"]);
  });

  it("returns the list unchanged when the brief has no keywords", () => {
    const logos = [
      { title: "A", filename: "a.png", prompt: "", tags: ["x"], imageUrl: "a" },
      { title: "B", filename: "b.png", prompt: "", tags: ["y"], imageUrl: "b" },
    ];
    expect(rankForBrief(logos, {}).map((l) => l.title)).toEqual(["A", "B"]);
  });

  it("parses mark_paths into markPaths when present, undefined otherwise", async () => {
    const raw = [
      { title: "V", filename: "v.png", prompt: "", tags: "yoga", image_url: "v", mark_paths: [{ d: "M0 0 Z", fill: "mark" }] },
      { title: "R", filename: "r.png", prompt: "", tags: "yoga", image_url: "r", mark_paths: null },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => raw }));
    const logos = await fetchCuratedCatalog();
    expect(logos[0].markPaths).toEqual([{ d: "M0 0 Z", fill: "mark" }]);
    expect(logos[1].markPaths).toBeUndefined();
  });
});
