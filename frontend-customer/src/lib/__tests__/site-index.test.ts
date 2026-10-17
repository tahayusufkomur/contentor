import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlogPostPublic } from "@/lib/blog-public";
import type { Course } from "@/types/course";
import type { TenantConfig } from "@/types/tenant";

const tenant = vi.hoisted(() => ({ config: null as unknown }));
vi.mock("next/headers", () => ({
  headers: () => new Headers({ host: "mara.localhost" }),
}));
vi.mock("@/lib/tenant", () => ({
  getTenantSlug: async () => "mara",
  fetchTenantConfig: async () => tenant.config,
}));

import {
  fetchSiteIndex,
  llmsTxt,
  sitemapEntries,
  sitePages,
  type SiteIndex,
} from "@/lib/site-index";

const ORIGIN = "http://mara.localhost";

const config = (over: Partial<TenantConfig> = {}) =>
  ({
    brand_name: "Mara Lindqvist",
    meta_description: "Slow vinyasa and yin for desk workers.",
    is_published: true,
    navbar_config: {
      links: [
        { href: "/courses", label: "Courses" },
        { href: "/events", label: "Live classes" },
        { href: "/plans", label: "Pricing" },
        { href: "/#contact", label: "Contact me" },
        { href: "https://instagram.com/mara", label: "Instagram" },
        { href: "/dashboard", label: "My classes" },
      ],
    },
    pages: {
      home: {
        blocks: [
          {
            id: "h",
            type: "section.hero",
            headline: "Stiff from sitting? Start here.",
            subhead: "45-minute classes.",
          },
        ],
      },
      about: { blocks: [{ id: "a", type: "section.story" }] },
      events: { blocks: [{ id: "e", type: "section.hero" }] },
      faq: { blocks: [{ id: "f", type: "faq", enabled: false }] },
    },
    ...over,
  }) as unknown as TenantConfig;

describe("sitePages", () => {
  it("keeps home, the coach's pages and links; drops external, private and empty ones", () => {
    expect(
      sitePages(config(), false, { courses: true, events: false }, true),
    ).toEqual([
      { href: "/", label: "Home" },
      { href: "/courses", label: "Courses" },
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
    ]);
  });

  it("keeps the coach's own label for a page she links", () => {
    const pages = sitePages(config(), true, undefined, false);
    expect(pages).toContainEqual({ href: "/events", label: "Live classes" });
    expect(pages.map((p) => p.href)).toEqual([
      "/",
      "/courses",
      "/events",
      "/plans",
      "/about",
    ]);
  });
});

const index = (over: Partial<SiteIndex> = {}): SiteIndex => ({
  origin: ORIGIN,
  config: config(),
  pages: [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
  ],
  courses: [
    {
      slug: "a-kinder-back",
      title: "A Kinder Back",
      description: "x".repeat(300),
      updated_at: "2026-10-15T19:59:41Z",
    } as Course,
  ],
  posts: [
    { slug: "hips", published_at: "2026-10-01T00:00:00Z" } as BlogPostPublic,
    {
      slug: "quiet",
      published_at: "2026-10-02T00:00:00Z",
      noindex: true,
    } as BlogPostPublic,
  ],
  ...over,
});

describe("sitemapEntries", () => {
  it("puts every URL on the site's own host and leaves noindex posts out", () => {
    expect(sitemapEntries(index())).toEqual([
      { url: `${ORIGIN}/` },
      { url: `${ORIGIN}/about` },
      {
        url: `${ORIGIN}/courses/a-kinder-back`,
        lastModified: "2026-10-15T19:59:41Z",
      },
      { url: `${ORIGIN}/blog/hips`, lastModified: "2026-10-01T00:00:00Z" },
    ]);
  });
});

describe("llmsTxt", () => {
  it("names the coach, says what she teaches, links her pages and courses", () => {
    expect(llmsTxt(index())).toBe(
      [
        "# Mara Lindqvist",
        "> Slow vinyasa and yin for desk workers.",
        "Stiff from sitting? Start here. 45-minute classes.",
        `## Pages\n\n- [Home](${ORIGIN}/)\n- [About](${ORIGIN}/about)`,
        `## Courses\n\n- [A Kinder Back](${ORIGIN}/courses/a-kinder-back): ${"x".repeat(199)}…`,
      ].join("\n\n") + "\n",
    );
  });

  it("falls back to the home hero without a meta description", () => {
    expect(
      llmsTxt(index({ config: config({ meta_description: "" }) })),
    ).toContain("> 45-minute classes.\n\nStiff from sitting? Start here.\n\n");
  });
});

describe("fetchSiteIndex", () => {
  const calls: { path: string; headers: unknown }[] = [];
  const api: Record<string, unknown> = {
    "/api/v1/billing/plans/": [],
    "/api/v1/site/menu/": { courses: true, events: true },
    "/api/v1/courses/": [{ slug: "a-kinder-back" }],
    "/api/v1/blog/posts/?page=1": { results: [{ slug: "hips" }], next: "2" },
    "/api/v1/blog/posts/?page=2": {
      results: [{ slug: "quiet", noindex: true }],
      next: null,
    },
  };
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const { pathname, search } = new URL(url);
        const body = api[pathname + search];
        calls.push({ path: pathname + search, headers: init.headers });
        return new Response(JSON.stringify(body ?? {}), {
          status: body ? 200 : 404,
        });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads every page of posts as an anonymous visitor of the request's host", async () => {
    tenant.config = config();
    const site = await fetchSiteIndex();
    expect(site?.origin).toBe(ORIGIN);
    expect(site?.posts.map((p) => p.slug)).toEqual(["hips", "quiet"]);
    expect(site?.pages.map((p) => p.href)).not.toContain("/plans"); // sells no plans
    expect(calls).toHaveLength(5);
    for (const call of calls)
      expect(call.headers).toEqual({ "X-Tenant-Domain": "mara.localhost" });
  });

  it("finds nothing on a site still behind its preview gate", async () => {
    tenant.config = config({ is_published: false });
    expect(await fetchSiteIndex()).toBeNull();
    expect(calls).toEqual([]);
  });
});
