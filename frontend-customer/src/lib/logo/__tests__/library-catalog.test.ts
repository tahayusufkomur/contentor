import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCuratedCatalog,
  fetchLibrary,
  rankForBrief,
  takeLibraryLogo,
} from "../library-catalog";

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
      {
        title: "Yoga",
        filename: "y.png",
        prompt: "",
        tags: ["yoga", "minimal"],
        imageUrl: "y",
      },
      {
        title: "Chef",
        filename: "c.png",
        prompt: "",
        tags: ["cooking"],
        imageUrl: "c",
      },
      {
        title: "Zen",
        filename: "z.png",
        prompt: "",
        tags: ["yoga"],
        imageUrl: "z",
      },
    ];
    const ranked = rankForBrief(logos, {
      niche: "yoga studio",
      styleChips: ["Minimal"],
    });
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
      {
        title: "V",
        filename: "v.png",
        prompt: "",
        tags: "yoga",
        image_url: "v",
        mark_paths: [{ d: "M0 0 Z", fill: "mark" }],
      },
      {
        title: "R",
        filename: "r.png",
        prompt: "",
        tags: "yoga",
        image_url: "r",
        mark_paths: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => raw }),
    );
    const logos = await fetchCuratedCatalog();
    expect(logos[0].markPaths).toEqual([{ d: "M0 0 Z", fill: "mark" }]);
    expect(logos[1].markPaths).toBeUndefined();
  });
});

describe("remote logo library", () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });

  it("maps catalog marks, keyed by their asset id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          source: "pix4less",
          results: [
            {
              id: "a1",
              title: "Lotus",
              description: "a lotus mark",
              tags: ["Yoga", "calm"],
              image_url:
                "https://catalog.test/media/previews/a1/thumbnail.webp",
            },
          ],
        }),
      ),
    );
    const logos = await fetchLibrary("yoga elegant");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "/api/v1/logos/library/?q=yoga%20elegant",
    );
    expect(logos).toEqual([
      {
        title: "Lotus",
        filename: "a1",
        prompt: "a lotus mark",
        tags: ["yoga", "calm"],
        imageUrl: "https://catalog.test/media/previews/a1/thumbnail.webp",
        assetId: "a1",
      },
    ]);
  });

  it("answers null for the local library and when the call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ source: "local" })),
    );
    expect(await fetchLibrary("yoga")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchLibrary("yoga")).toBeNull();
  });

  it("takes a mark: the traced vector when there is one, else the image", async () => {
    const photo = { id: "p1", signed_url: "https://storage.test/p1.webp" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ photo, mark_paths: [{ d: "M 1 1 Z", fill: "mark" }] }),
        )
        .mockResolvedValueOnce(json({ photo, mark_paths: null })),
    );
    expect(await takeLibraryLogo("a1")).toEqual({
      photoId: "p1",
      imageUrl: photo.signed_url,
      markPaths: [{ d: "M 1 1 Z", fill: "mark" }],
    });
    expect((await takeLibraryLogo("a1")).markPaths).toBeUndefined();
    expect(vi.mocked(fetch).mock.calls[0]).toMatchObject([
      "/api/v1/logos/library/a1/use/",
      { method: "POST" },
    ]);
  });
});
