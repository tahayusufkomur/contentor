export interface NavLink {
  label: string;
  href: string;
}

export type NavbarLayout = "classic" | "centered" | "split" | "minimal" | "pill";

export interface NavbarConfig {
  links: NavLink[];
  cta: { text: string; href: string } | null;
  show_login: boolean;
  /** Desktop arrangement preset. Missing/unknown renders as "classic". */
  layout?: NavbarLayout;
  /** Transparent over the home-page hero, solid on scroll. Ignored for "pill". */
  transparent_over_hero?: boolean;
  /** Show the "Install app" link (default true). */
  show_install?: boolean;
}

export interface LandingHero {
  enabled: boolean;
  headline: string;
  subheadline: string;
  cta_text: string;
  cta_href: string;
  bg_image_url: string | null;
  bg_image_photo_id?: string | null;
}

export interface LandingAbout {
  enabled: boolean;
  heading: string;
  body: string;
  image_url: string | null;
  image_photo_id?: string | null;
}

export interface LandingCourses {
  enabled: boolean;
  heading: string;
}

export interface LandingTestimonial {
  name: string;
  text: string;
  avatar_url: string;
}

export interface LandingTestimonials {
  enabled: boolean;
  heading: string;
  items: LandingTestimonial[];
}

export interface LandingFaqItem {
  q: string;
  a: string;
}

export interface LandingFaq {
  enabled: boolean;
  heading: string;
  items: LandingFaqItem[];
}

export interface LandingCta {
  enabled: boolean;
  heading: string;
  button_text: string;
  button_href: string;
}

export interface LandingSections {
  hero?: LandingHero;
  about?: LandingAbout;
  courses?: LandingCourses;
  testimonials?: LandingTestimonials;
  faq?: LandingFaq;
  cta?: LandingCta;
}

// ---------------------------------------------------------------------------
// Website builder (pages + blocks). Supersedes LandingSections above.
// ---------------------------------------------------------------------------

/** An image field value. The serializer re-signs `url` from `photo_id` on read. */
export interface BlockImage {
  url: string | null;
  photo_id: string | null;
}

/** A video field value — an external embed URL or a signed library-video URL. */
export interface BlockVideo {
  url: string | null;
  video_id: number | null;
}

/** Optional, theme-safe per-block style override (hybrid theme-lock). Values are
 *  clamped server-side to a small allowlist; see backend `defaults.py`. */
export interface BlockStyleOverride {
  /** Theme-token background: muted | card | accent | primary (default = none). */
  background?: string;
  /** Vertical spacing step: none | compact | normal | spacious. */
  spacing?: string;
  /** Text alignment: left | center | right. */
  align?: string;
  /** Theme-token text colour: muted | brand (default = none, uses the theme). */
  textColor?: string;
}

/** A single block: an `id`, a `type` from the registry, and a flat content bag. */
export interface Block {
  id: string;
  type: string;
  enabled?: boolean;
  style?: BlockStyleOverride;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
}

export interface PageConfig {
  blocks: Block[];
}

export type PageKey =
  | "home"
  | "about"
  | "courses"
  | "pricing"
  | "faq"
  | "contact";

export type PagesConfig = Partial<Record<PageKey, PageConfig>>;

/** A page template — a named set of pre-arranged blocks a coach can apply to a
 *  page. Built-in templates ship in the frontend (with `pageKeys`/`description`);
 *  coach-saved templates persist in `TenantConfig.page_templates`. */
export interface PageTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  /** Built-in only: which pages this template is offered for. */
  pageKeys?: PageKey[];
  blocks: Block[];
}

export interface TenantConfig {
  id: number;
  brand_name: string;
  logo_url: string;
  logo_id?: string | null;
  theme: string;
  dark_mode_enabled: boolean;
  font_family: string;
  custom_css: string;
  enabled_modules: string[];
  social_links: Record<string, string>;
  meta_description: string;
  navbar_config: NavbarConfig;
  /** Legacy single-page config. Superseded by `pages`; kept for back-compat. */
  landing_sections: LandingSections;
  /** Website-builder content, keyed by page. */
  pages?: PagesConfig;
  /** Coach-saved page templates ("my templates"). */
  page_templates?: PageTemplate[];
  timezone: string;
  onboarding_completed: boolean;
  is_demo?: boolean;
  /** Whether demo read-only enforcement is active (off locally). When false, the
   * demo banner is hidden and the tenant is editable. */
  demo_readonly?: boolean;
  tenant_name?: string;
  tenant_slug?: string;
  demo_niche?: string;
  /** Unified niche (real-tenant template niche, else demo niche). Used by the
   *  site builder to seed new blocks with niche-appropriate example content. */
  niche?: string;
  /** Publish gate: when false the public site is hidden behind a preview gate. */
  is_published?: boolean;
  has_preview_password?: boolean;
}
