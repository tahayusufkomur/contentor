import type { PageKey } from "@/types/tenant";

export const PAGE_KEYS: PageKey[] = ["home", "about", "courses", "pricing", "faq", "contact"];

// `pricing` renders at /plans — the one route/key mismatch, resolved here only.
export const PAGE_ROUTES: Record<PageKey, string> = {
  home: "/",
  about: "/about",
  courses: "/courses",
  pricing: "/plans",
  faq: "/faq",
  contact: "/contact",
};

export const PAGE_LABELS: Record<PageKey, string> = {
  home: "Home",
  about: "About",
  courses: "Courses",
  pricing: "Pricing",
  faq: "FAQ",
  contact: "Contact",
};

const ROUTE_TO_PAGE_KEY: Record<string, PageKey> = Object.entries(PAGE_ROUTES).reduce(
  (acc, [key, route]) => {
    acc[route] = key as PageKey;
    return acc;
  },
  {} as Record<string, PageKey>,
);

/** Map a pathname to its page key, or null if the path isn't an editable page. */
export function pageKeyForPath(pathname: string): PageKey | null {
  const normalized = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return ROUTE_TO_PAGE_KEY[normalized] ?? null;
}
