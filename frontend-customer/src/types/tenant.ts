export interface NavLink {
  label: string;
  href: string;
}

export interface NavbarConfig {
  links: NavLink[];
  cta: { text: string; href: string } | null;
  show_login: boolean;
}

export interface LandingHero {
  enabled: boolean;
  headline: string;
  subheadline: string;
  cta_text: string;
  cta_href: string;
  bg_image_url: string | null;
}

export interface LandingAbout {
  enabled: boolean;
  heading: string;
  body: string;
  image_url: string | null;
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

export interface TenantConfig {
  id: number;
  brand_name: string;
  logo_url: string;
  theme: string;
  dark_mode_enabled: boolean;
  font_family: string;
  custom_css: string;
  enabled_modules: string[];
  social_links: Record<string, string>;
  meta_description: string;
  navbar_config: NavbarConfig;
  landing_sections: LandingSections;
  onboarding_completed: boolean;
}
