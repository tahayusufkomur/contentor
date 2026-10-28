// What crawlers read on a coach's site: /sitemap.xml, /robots.txt and /llms.txt
// (app/sitemap.ts, app/robots.ts, app/llms.txt/route.ts). Fetched without the
// visitor's cookie, the way a crawler sees the site: a signed-in coach opening
// her own sitemap must not find her unpublished courses in it.
import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { getTranslations } from "next-intl/server";

import { PAGE_ROUTES } from "@/lib/blocks/pages";
import type { BlogPostPublic } from "@/lib/blog-public";
import { BASE_DOMAIN, DJANGO_API_URL } from "@/lib/constants";
import { visibleNavLinks, type SiteMenu } from "@/lib/navbar";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import type { Course } from "@/types/course";
import type { NavLink, PageKey, TenantConfig } from "@/types/tenant";

/** Never for crawlers: the coach's admin and setup, the API, sign-in, and
 *  every page a student needs an account for ("/live" also covers
 *  /live-classes and /live-stream). */
export const PRIVATE_PATHS = [
  "/admin",
  "/setup",
  "/api/",
  "/login",
  "/callback",
  "/impersonate",
  "/dashboard",
  "/learn",
  "/checkout",
  "/orders",
  "/subscriptions",
  "/community",
  "/live",
];

// A plain internal path. Next writes sitemap URLs into the XML unescaped, and
// a nav link may be external or carry a query or fragment.
const PAGE_PATH = /^\/[\w/-]*$/;

/** The `site` translator, as far as this file needs it: page names for the
 *  labels and the "Pages" heading of llms.txt. */
export type PageT = (key: `page.${PageKey | "blog"}` | "nav.pages") => string;

export interface PublicSite {
  /** The host the crawler asked for, so every URL stays on it. */
  origin: string;
  config: TenantConfig;
}

export interface SiteIndex extends PublicSite {
  pages: NavLink[];
  courses: Course[];
  posts: BlogPostPublic[];
}

/** The tenant behind this request, or null when a crawler should find
 *  nothing: no such tenant, or a site still behind its preview gate. */
export async function fetchPublicSite(): Promise<PublicSite | null> {
  const config = await fetchTenantConfig(await getTenantSlug());
  if (!config || config.is_published === false) return null;
  const host = (await headers()).get("host") ?? "";
  // Dev serves *.localhost over plain http. Prod is always https: TLS ends at
  // Cloudflare and Caddy reaches Next over http, so x-forwarded-proto says http.
  const scheme = BASE_DOMAIN === "localhost" ? "http" : "https";
  return { origin: `${scheme}://${host}`, config };
}

async function getJson<T>(path: string, domain: string): Promise<T | null> {
  try {
    const res = await fetch(`${DJANGO_API_URL}${path}`, {
      headers: { "X-Tenant-Domain": domain },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type Paged<T> = { results: T[]; next: string | null };

/** Everything the sitemap and llms.txt list. */
export async function fetchSiteIndex(): Promise<SiteIndex | null> {
  const site = await fetchPublicSite();
  if (!site) return null;
  const domain = new URL(site.origin).hostname;
  const t = await getTranslations("site");
  const allPosts = async () => {
    const posts: BlogPostPublic[] = [];
    // ponytail: the public list pages 12 posts at a time; 50 pages (600 posts)
    // cap one sitemap. Give the endpoint a page_size when a coach outgrows it.
    for (let page = 1; page <= 50; page++) {
      const data = await getJson<Paged<BlogPostPublic>>(
        `/api/v1/blog/posts/?page=${page}`,
        domain,
      );
      posts.push(...(data?.results ?? []));
      if (!data?.next) break;
    }
    return posts;
  };
  const [plans, menu, courses, posts] = await Promise.all([
    getJson<unknown[]>("/api/v1/billing/plans/", domain),
    getJson<SiteMenu>("/api/v1/site/menu/", domain),
    getJson<Course[]>("/api/v1/courses/", domain),
    allPosts(),
  ]);
  return {
    ...site,
    // Plans and the menu fail open, as the site's own nav does ((public)/layout.tsx).
    pages: sitePages(
      site.config,
      plans ? plans.length > 0 : true,
      menu ?? undefined,
      posts.length > 0,
      t,
    ),
    courses: courses ?? [],
    posts,
  };
}

/** The pages worth a crawler's visit: home, every page the coach built or
 *  links to, minus the empty ones the nav hides too (navbar.ts). */
export function sitePages(
  config: TenantConfig,
  plansEnabled: boolean,
  menu: SiteMenu | undefined,
  hasPosts: boolean,
  t: PageT,
): NavLink[] {
  const built = (Object.keys(PAGE_ROUTES) as PageKey[])
    .filter((key) =>
      config.pages?.[key]?.blocks?.some((b) => b.enabled !== false),
    )
    .map((key) => ({ href: PAGE_ROUTES[key], label: t(`page.${key}`) }));
  const candidates = [
    { href: "/", label: t("page.home") },
    ...(config.navbar_config?.links ?? []),
    ...built,
    ...(hasPosts ? [{ href: "/blog", label: t("page.blog") }] : []),
  ].filter(
    ({ href }) =>
      PAGE_PATH.test(href) && !PRIVATE_PATHS.some((p) => href.startsWith(p)),
  );
  // One entry per path; the first label wins, so the coach's nav labels beat
  // the page defaults.
  const pages = new Map<string, NavLink>();
  for (const link of visibleNavLinks(candidates, plansEnabled, menu)) {
    if (!pages.has(link.href)) pages.set(link.href, link);
  }
  return [...pages.values()];
}

export function sitemapEntries({
  origin,
  pages,
  courses,
  posts,
}: SiteIndex): MetadataRoute.Sitemap {
  return [
    ...pages.map((p) => ({ url: origin + p.href })),
    ...courses.map((c) => ({
      url: `${origin}/courses/${c.slug}`,
      lastModified: c.updated_at,
    })),
    // A noindex post stays on the blog, out of search.
    ...posts
      .filter((p) => !p.noindex)
      .map((p) => ({
        url: `${origin}/blog/${p.slug}`,
        lastModified: p.published_at,
      })),
  ];
}

const flat = (s: unknown) =>
  (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim();
const clip = (s: string) => (s.length > 200 ? `${s.slice(0, 199)}…` : s);

/** llms.txt (llmstxt.org): who the coach is, what she teaches, and where
 *  her pages and courses are. */
export function llmsTxt(
  { origin, config, pages, courses }: SiteIndex,
  t: PageT,
): string {
  const hero = config.pages?.home?.blocks?.find(
    (b) => b.enabled !== false && b.type.includes("hero"),
  );
  // Section heroes say headline/subhead, the older blocks heading/subheading.
  const headline = flat(hero?.headline ?? hero?.heading);
  const subhead = flat(hero?.subhead ?? hero?.subheading);
  const summary = flat(config.meta_description) || subhead || headline;
  const details = [headline, subhead].filter((s) => s && s !== summary);
  const section = (title: string, items: string[]) =>
    items.length ? `## ${title}\n\n${items.join("\n")}` : "";
  return `${[
    `# ${flat(config.brand_name || config.tenant_name)}`,
    summary && `> ${summary}`,
    details.join(" "),
    section(
      t("nav.pages"),
      pages.map((p) => `- [${p.label}](${origin}${p.href})`),
    ),
    section(
      t("page.courses"),
      courses.map((c) => {
        const about = clip(flat(c.description));
        return `- [${flat(c.title)}](${origin}/courses/${c.slug})${about && `: ${about}`}`;
      }),
    ),
  ]
    .filter(Boolean)
    .join("\n\n")}\n`;
}
