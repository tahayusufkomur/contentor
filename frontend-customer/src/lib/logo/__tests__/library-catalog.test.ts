import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCuratedCatalog, rankByNiche } from "../library-catalog";

afterEach(() => vi.restoreAllMocks());

const RAW = [
  { title: "Yoga", filename: "yoga.png", prompt: "a yoga logo", tags: "yoga, wellness, zen" },
  { title: "Chef", filename: "chef.png", prompt: "a chef logo", tags: "cooking, food" },
];

describe("library-catalog", () => {
  it("fetches, splits tags, and builds imageUrl", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RAW }));
    const logos = await fetchCuratedCatalog();
    expect(fetch).toHaveBeenCalledWith("/logos/logo_meta.json");
    expect(logos[0]).toMatchObject({
      title: "Yoga",
      imageUrl: "/logos/yoga.png",
      tags: ["yoga", "wellness", "zen"],
    });
  });

  it("returns [] when the catalog is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchCuratedCatalog()).toEqual([]);
  });

  it("ranks tag-matching logos first for the niche", () => {
    const logos = RAW.map((r) => ({ ...r, tags: r.tags.split(",").map((t) => t.trim()), imageUrl: `/logos/${r.filename}` }));
    const ranked = rankByNiche(logos, "wellness");
    expect(ranked.map((l) => l.title)).toEqual(["Yoga", "Chef"]);
  });
});
