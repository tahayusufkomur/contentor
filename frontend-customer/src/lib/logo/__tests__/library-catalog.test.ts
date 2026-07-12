import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCuratedCatalog, rankByNiche } from "../library-catalog";

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

  it("ranks tag-matching logos first for the niche", () => {
    const logos = RAW.map((r) => ({
      ...r,
      tags: r.tags.split(",").map((t) => t.trim()),
      imageUrl: r.image_url,
    }));
    const ranked = rankByNiche(logos, "wellness");
    expect(ranked.map((l) => l.title)).toEqual(["Yoga", "Chef"]);
  });
});
