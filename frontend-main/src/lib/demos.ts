/**
 * Marketing-side metadata for the read-only demo tenants.
 *
 * The actual demo content lives in the backend (apps/core/management/commands/
 * demo_data/*.py) and is provisioned via `python manage.py seed_all_demos`.
 *
 * Keep `subdomain` in sync with the backend TENANT["subdomain"] values, and
 * `niche` with the demo_data module filename. The marketing gallery renders
 * one card per entry, each linking to the matching demo's /api/demo/enter
 * route on its own subdomain.
 */

export interface DemoNiche {
  niche: string; // module key — used by signup ?template=...
  subdomain: string; // resolves the real demo tenant's host
  name: string;
  tagline: string;
  accent: string; // tailwind class, used for card accent
}

export const DEMO_NICHES: DemoNiche[] = [
  {
    niche: "yoga",
    subdomain: "demo-yoga",
    name: "Yoga Studio",
    tagline:
      "Forest-themed yoga school selling courses + live drop-in classes.",
    accent: "from-emerald-500 to-teal-600",
  },
  {
    niche: "pilates",
    subdomain: "demo-pilates",
    name: "Pilates Studio",
    tagline: "Structured 6-week programs with weekly live sessions.",
    accent: "from-sky-500 to-indigo-600",
  },
  {
    niche: "fitness",
    subdomain: "demo-fitness",
    name: "Fitness Academy",
    tagline:
      "High-intensity training plans, calendars, and Zoom group classes.",
    accent: "from-orange-500 to-red-600",
  },
  {
    niche: "belly_dance",
    subdomain: "demo-bellydance",
    name: "Belly Dance Academy",
    tagline: "Choreography courses, monthly recurring sessions, and bundles.",
    accent: "from-amber-500 to-pink-600",
  },
  {
    niche: "pole_dance",
    subdomain: "demo-poledance",
    name: "Pole Dance Studio",
    tagline:
      "Progressive skill courses with subscription tiers and recordings.",
    accent: "from-fuchsia-500 to-violet-600",
  },
  {
    niche: "face_yoga",
    subdomain: "demo-faceyoga",
    name: "Face Yoga Studio",
    tagline:
      "Niche micro-courses with email campaigns and downloadable guides.",
    accent: "from-rose-500 to-pink-600",
  },
  {
    niche: "makeup",
    subdomain: "demo-makeup",
    name: "Makeup Academy",
    tagline:
      "Tutorial libraries, on-site workshops, and creator merch bundles.",
    accent: "from-pink-500 to-rose-600",
  },
];

export function getDemoBySlug(niche: string): DemoNiche | undefined {
  return DEMO_NICHES.find((d) => d.niche === niche);
}

export function demoEntryUrl(
  demo: DemoNiche,
  role: "student" | "coach",
  baseDomain: string,
): string {
  return `//${demo.subdomain}.${baseDomain}/api/demo/enter?as=${role}`;
}
