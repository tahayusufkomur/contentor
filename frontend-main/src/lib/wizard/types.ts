import type { LogoRecipe } from "@/types/logo";

export interface WizardCatalog {
  niches: string[];
  goals: string[];
  themes: string[];
  theme_ranking: Record<string, string[]>;
  fonts: Record<string, string>; // wizard font id -> font_family value
  navbar_layouts: string[];
  hero_styles: string[];
  logo_modes: string[];
  page_layouts: Record<string, { id: string; blocks: string[] }[]>;
  home_goal_blocks: { goal: string; type: string }[];
  description_max_len: number;
  recommended: WizardAnswers;
}

export interface DescriptionFollowups {
  /** The description text these questions were generated for — lets the
   * client skip regeneration when the coach didn't change their answer. */
  for: string;
  items: { q: string; a: string }[];
}

export interface WizardLogoAnswer {
  mode: "wordmark" | "curated" | "ai";
  curated_id: number | null;
  /** "ai" mode only: the composed recipe (LogoRenderer input, same shape
   * the Logo Studio produces) and the S3 keys the client-rendered PNGs were
   * staged under by wizardLogoUpload — applied at provisioning time. */
  recipe?: LogoRecipe | null;
  export_keys?: { logo: string; icon: string };
}

export interface WizardAnswers {
  niche?: string;
  description?: string;
  description_followups?: DescriptionFollowups;
  goals?: string[];
  theme?: string;
  font_family?: string;
  navbar_layout?: string;
  hero_style?: string;
  page_layouts?: Record<string, string>;
  logo?: WizardLogoAnswer;
}

export interface WizardState {
  version?: number;
  current_step?: string;
  answers?: WizardAnswers;
  step_timestamps?: Record<string, string>;
  finished_rest_for_me?: boolean;
}

export interface WizardStateResponse {
  slug: string;
  status: string;
  template_status: string;
  has_paid_platform_plan: boolean;
  state: WizardState;
}

export interface CuratedLogoItem {
  id: number;
  title: string;
  filename: string;
  prompt: string;
  tags: string;
  image_url: string;
  mark_paths: unknown;
}
