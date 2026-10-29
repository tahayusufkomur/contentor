import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPlatformPosts,
  platformBlogHasPosts,
  postLanguage,
  postPath,
} from "@/lib/platform-blog";

const before = process.env.NEXT_PUBLIC_ENABLED_LOCALES;
beforeEach(() => {
  process.env.NEXT_PUBLIC_ENABLED_LOCALES = "en,tr";
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (before === undefined) delete process.env.NEXT_PUBLIC_ENABLED_LOCALES;
  else process.env.NEXT_PUBLIC_ENABLED_LOCALES = before;
});

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: unknown) => ({
    ok: true,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the blog index of a language", () => {
  it("asks for that language's posts only", async () => {
    const fetchMock = stubFetch({ results: [{ slug: "merhaba" }] });
    expect(await fetchPlatformPosts("tr")).toEqual([{ slug: "merhaba" }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("?language=tr");
  });

  it("asks for every post when no language is given", async () => {
    const fetchMock = stubFetch({ results: [] });
    await fetchPlatformPosts();
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("language");
  });
});

describe("the header's Blog link", () => {
  it("looks at one post, cached for five minutes", async () => {
    const fetchMock = stubFetch({ count: 3, results: [] });
    expect(await platformBlogHasPosts("tr")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { next?: { revalidate: number } },
    ];
    expect(url).toContain("language=tr");
    expect(url).toContain("page_size=1");
    expect(init.next?.revalidate).toBe(300);
  });

  it("is hidden in a language with no posts", async () => {
    stubFetch({ count: 0, results: [] });
    expect(await platformBlogHasPosts("tr")).toBe(false);
  });

  it("is hidden when the blog cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await platformBlogHasPosts("tr")).toBe(false);
  });
});

describe("where a post lives", () => {
  it("follows the post's own language", () => {
    const post = { slug: "merhaba", language: "tr" };
    expect(postLanguage(post)).toBe("tr");
    expect(postPath(post)).toBe("/tr/blog/merhaba");
  });

  it("keeps English at the unprefixed address", () => {
    expect(postPath({ slug: "hello", language: "en" })).toBe("/blog/hello");
    expect(postPath({ slug: "hello" })).toBe("/blog/hello");
  });

  it("falls back to English for a language that is not enabled", () => {
    const post = { slug: "witaj", language: "pl" };
    expect(postLanguage(post)).toBe("en");
    expect(postPath(post)).toBe("/blog/witaj");
  });
});
