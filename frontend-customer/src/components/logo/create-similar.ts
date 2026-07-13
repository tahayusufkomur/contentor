// One-shot "Create similar" for paid coaches: Gemini recreates the curated
// logo's icon (icon stage), Claude designs the name lockup around it (name
// stage), and the caller lands the coach in the Editor with a complete
// draft. Chains the SAME staged converse endpoints + two-pass draft->finish
// loop as studio-chat — no new backend surface. A similar run costs 2 chat
// turns. See docs/superpowers/specs/2026-07-13-logo-studio-curated-v2-design.md.
import {
  composeConverseDesign,
  composeIconPreview,
  type Brief,
  type ConverseDesign,
} from "@/lib/logo/composer";
import {
  fetchConverseFinish,
  fetchConverseTurn,
  type ChatStage,
} from "@/lib/logo/converse-api";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoRecipe } from "@/types/logo";
import { renderDraftPngs } from "./render-draft";

export class SimilarError extends Error {}

export interface SimilarResult {
  /** "lockup" = full AI design; "icon" = the name turn failed after a good
   * icon — the recipe wraps the icon in a clean default lockup instead. */
  kind: "lockup" | "icon";
  design: ConverseDesign;
  recipe: LogoRecipe;
  turnsRemaining: number;
}

const GATE_NOTICES: Record<string, string> = {
  disabled: "AI design isn't available right now.",
  upgrade_required: "Upgrade to design with AI.",
  quota_exhausted: "You've used this month's AI design turns.",
};

type TurnBody = Parameters<typeof fetchConverseTurn>[0];

/** One converse turn with the chat's exact two-pass behavior: draft ->
 * client-side PNG render -> finish, falling back to the drafts on any
 * failure. Throws SimilarError when the turn is gated or comes back empty. */
async function runStage(
  stage: ChatStage,
  body: TurnBody,
  brandName: string,
): Promise<{
  designs: ConverseDesign[];
  turnsRemaining: number;
  assistantText: string;
}> {
  const resp = await fetchConverseTurn(body);
  if (resp.source !== "ai") {
    throw new SimilarError(
      GATE_NOTICES[resp.source] ?? "Couldn't reach the design studio just now.",
    );
  }
  let designs = resp.designs;
  if (resp.phase === "draft" && resp.token) {
    try {
      const images = await renderDraftPngs(resp.designs, stage, brandName);
      const final = await fetchConverseFinish(resp.token, images);
      if (final.source === "ai" && final.designs.length) {
        designs = final.designs;
      }
    } catch {
      // Keep the drafts the client already holds.
    }
  }
  if (!designs.length) {
    throw new SimilarError("The AI couldn't draw this one — try another logo.");
  }
  return {
    designs,
    turnsRemaining: resp.turns_remaining,
    assistantText: resp.message,
  };
}

export async function generateSimilar(
  logo: CuratedLogo,
  brief: Brief,
  brandName: string,
): Promise<SimilarResult> {
  const briefBody = {
    niche: brief.niche,
    style_chips: brief.styleChips,
    vibe: brief.vibe ?? "",
  };
  const iconMessage = `Recreate this icon concept in the same spirit for my brand: ${
    logo.prompt || logo.title
  }`;
  const icon = await runStage(
    "icon",
    {
      stage: "icon",
      brief: briefBody,
      transcript: [],
      pinned: {},
      message: iconMessage,
    },
    brandName,
  );
  const picked = icon.designs[0]!;
  const tagline = brief.tagline ?? "";

  try {
    const name = await runStage(
      "name",
      {
        stage: "name",
        brief: briefBody,
        transcript: [
          { role: "user", text: iconMessage },
          { role: "assistant", text: icon.assistantText },
        ],
        // Same pin shape the chat sends: traced paths verbatim, elements
        // for recompilable geometry.
        pinned: { mark_elements: picked.elements, mark_paths: picked.paths },
        message: `Design the full lockup for "${brandName}" around this mark.`,
      },
      brandName,
    );
    const design = name.designs[0]!;
    return {
      kind: "lockup",
      design,
      recipe: { ...composeConverseDesign(design, brandName), tagline },
      turnsRemaining: name.turnsRemaining,
    };
  } catch {
    // Degraded path: the icon succeeded — still yield a usable draft (icon
    // in a clean default lockup) so the spent turn isn't wasted.
    return {
      kind: "icon",
      design: picked,
      recipe: { ...composeIconPreview(picked, brandName), tagline },
      turnsRemaining: icon.turnsRemaining,
    };
  }
}
