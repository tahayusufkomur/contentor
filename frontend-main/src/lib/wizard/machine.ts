/** Pure wizard step machine — no React, no fetch. The server's catalog is
 * the vocabulary; this module only decides ORDER and SKIPPING. */

import type { WizardAnswers, WizardCatalog } from "./types";

export const CHAPTERS = [
  "business",
  "look",
  "pages",
  "logo",
  "launch",
] as const;
export type ChapterId = (typeof CHAPTERS)[number];

export interface StepDef {
  id: string; // e.g. "business.niche", "pages.home", "review"
  chapter: ChapterId;
}

const PAGE_ORDER = [
  "home",
  "about",
  "courses",
  "pricing",
  "faq",
  "contact",
] as const;

const SELLING_GOALS = ["sell_courses", "sell_downloads"];

export function buildSteps(
  catalog: WizardCatalog,
  answers: WizardAnswers,
): StepDef[] {
  const goals = answers.goals ?? [];
  const selling =
    goals.length === 0 || goals.some((g) => SELLING_GOALS.includes(g));
  const steps: StepDef[] = [
    { id: "business.niche", chapter: "business" },
    { id: "business.describe", chapter: "business" },
  ];
  if ((answers.description_followups?.items?.length ?? 0) > 0) {
    steps.push({ id: "business.followups", chapter: "business" });
  }
  steps.push(
    { id: "business.goals", chapter: "business" },
    { id: "look.theme", chapter: "look" },
    { id: "look.font", chapter: "look" },
    { id: "look.navbar", chapter: "look" },
    { id: "look.hero", chapter: "look" },
  );
  for (const page of PAGE_ORDER) {
    if (page === "pricing" && !selling) continue; // answers matter: no selling -> no pricing step
    if ((catalog.page_layouts[page] ?? []).length < 2) continue;
    steps.push({ id: `pages.${page}`, chapter: "pages" });
  }
  steps.push({ id: "logo", chapter: "logo" });
  steps.push({ id: "review", chapter: "launch" });
  return steps;
}

export function stepIndex(steps: StepDef[], id: string): number {
  const idx = steps.findIndex((s) => s.id === id);
  return idx === -1 ? 0 : idx;
}

export function nextStep(steps: StepDef[], id: string): StepDef | null {
  return steps[stepIndex(steps, id) + 1] ?? null;
}

export function prevStep(steps: StepDef[], id: string): StepDef | null {
  const idx = stepIndex(steps, id);
  return idx > 0 ? steps[idx - 1] : null;
}

/** Endowed progress: verify already "earned" 15%. */
export function progressPct(steps: StepDef[], id: string): number {
  return Math.round(
    15 + (85 * stepIndex(steps, id)) / Math.max(steps.length - 1, 1),
  );
}

function answered(step: StepDef, answers: WizardAnswers): boolean {
  switch (step.id) {
    case "business.niche":
      return Boolean(answers.niche);
    case "business.describe":
      return answers.description !== undefined;
    case "business.followups":
      // Never blocks resume: questions are optional; current_step decides
      // whether the coach returns here.
      return true;
    case "business.goals":
      return answers.goals !== undefined;
    case "look.theme":
      return Boolean(answers.theme);
    case "look.font":
      return Boolean(answers.font_family);
    case "look.navbar":
      return Boolean(answers.navbar_layout);
    case "look.hero":
      return Boolean(answers.hero_style);
    case "logo":
      return Boolean(answers.logo);
    case "review":
      return false;
    default: {
      const page = step.id.replace("pages.", "");
      return Boolean(answers.page_layouts?.[page]);
    }
  }
}

export function firstUnansweredStep(
  steps: StepDef[],
  answers: WizardAnswers,
): StepDef {
  return steps.find((s) => !answered(s, answers)) ?? steps[steps.length - 1];
}

/** "Finish the rest for me": recommended values for every unanswered design
 * key (niche-aware theme/font), leaving explicit answers untouched. */
export function finishRestAnswers(
  catalog: WizardCatalog,
  answers: WizardAnswers,
): WizardAnswers {
  const rec = catalog.recommended;
  const niche = answers.niche ?? rec.niche ?? "general";
  const ranked = catalog.theme_ranking[niche] ?? catalog.themes;
  const pageLayouts: Record<string, string> = {};
  for (const [page, options] of Object.entries(catalog.page_layouts)) {
    pageLayouts[page] = answers.page_layouts?.[page] ?? options[0].id;
  }
  return {
    description: answers.description ?? "",
    goals: answers.goals ?? rec.goals,
    theme: answers.theme ?? ranked[0],
    font_family: answers.font_family ?? rec.font_family,
    navbar_layout: answers.navbar_layout ?? rec.navbar_layout,
    hero_style: answers.hero_style ?? rec.hero_style,
    page_layouts: pageLayouts,
    logo: answers.logo ?? { mode: "wordmark", curated_id: null },
  };
}
