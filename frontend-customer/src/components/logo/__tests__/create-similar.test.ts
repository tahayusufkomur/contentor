import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConverseDesign } from "@/lib/logo/composer";

vi.mock("@/lib/logo/converse-api", () => ({
  fetchConverseTurn: vi.fn(),
  fetchConverseFinish: vi.fn(),
}));
vi.mock("../render-draft", () => ({
  renderDraftPngs: vi.fn().mockResolvedValue(["data:image/png;base64,x"]),
}));

import {
  fetchConverseFinish,
  fetchConverseTurn,
} from "@/lib/logo/converse-api";
import { renderDraftPngs } from "../render-draft";
import { SimilarError, generateSimilar } from "../create-similar";

const turnMock = vi.mocked(fetchConverseTurn);
const finishMock = vi.mocked(fetchConverseFinish);

const DESIGN: ConverseDesign = {
  concept: "Lotus",
  rationale: "calm and centered",
  paths: [{ d: "M0 0 L10 10 Z", fill: "mark" }],
  elements: [{ kind: "path" }],
  palette: {
    name: "Calm",
    primary: "#336699",
    secondary: "#88aacc",
    accent: "#ee7755",
    ink: "#112233",
  },
  color_roles: {
    badge: "primary",
    mark: "ink",
    mark2: "secondary",
    mark_accent: "accent",
    text: "ink",
    tagline: "secondary",
  },
  layout: "stacked",
  font: "Poppins",
  typography: { case: "none", tracking: 0, weight: 700 },
};

const LOGO = {
  title: "Lotus",
  filename: "lotus.png",
  prompt: "a lotus mark",
  tags: ["yoga"],
  imageUrl: "http://x/lotus.png",
};
const BRIEF = {
  brandName: "Zeynep Yoga",
  niche: "yoga",
  styleChips: ["Elegant" as const],
  tagline: "Breathe daily",
};

function turnResponse(overrides: Record<string, unknown>) {
  return {
    phase: "final" as const,
    message: "here you go",
    designs: [DESIGN],
    turns_remaining: 7,
    source: "ai" as const,
    ...overrides,
  };
}

beforeEach(() => {
  turnMock.mockReset();
  finishMock.mockReset();
  vi.mocked(renderDraftPngs).mockClear();
});

describe("generateSimilar", () => {
  it("chains icon then name turns into a complete lockup recipe", async () => {
    turnMock
      .mockResolvedValueOnce(turnResponse({}))
      .mockResolvedValueOnce(turnResponse({ turns_remaining: 6 }));
    const result = await generateSimilar(LOGO, BRIEF, "Zeynep Yoga");
    expect(result.kind).toBe("lockup");
    expect(result.recipe.name).toBe("Zeynep Yoga");
    expect(result.recipe.tagline).toBe("Breathe daily");
    expect(result.recipe.layout).toBe("stacked");
    expect(result.turnsRemaining).toBe(6);
    // Icon turn: empty transcript + the curated prompt in the message.
    expect(turnMock.mock.calls[0]![0]).toMatchObject({
      stage: "icon",
      transcript: [],
    });
    expect(turnMock.mock.calls[0]![0].message).toContain("a lotus mark");
    // Name turn: pins the picked icon's geometry.
    expect(turnMock.mock.calls[1]![0]).toMatchObject({
      stage: "name",
      pinned: { mark_paths: DESIGN.paths, mark_elements: DESIGN.elements },
    });
  });

  it("runs the two-pass draft->finish loop and prefers the finished designs", async () => {
    const finalDesign = { ...DESIGN, concept: "Refined" };
    turnMock
      .mockResolvedValueOnce(turnResponse({ phase: "draft", token: "t1" }))
      .mockResolvedValueOnce(turnResponse({ turns_remaining: 6 }));
    finishMock.mockResolvedValueOnce(
      turnResponse({ designs: [finalDesign] }),
    );
    const result = await generateSimilar(LOGO, BRIEF, "Zeynep Yoga");
    expect(renderDraftPngs).toHaveBeenCalledTimes(1);
    expect(finishMock).toHaveBeenCalledWith("t1", ["data:image/png;base64,x"]);
    expect(result.kind).toBe("lockup");
  });

  it("keeps the drafts when the finish pass fails", async () => {
    turnMock
      .mockResolvedValueOnce(turnResponse({ phase: "draft", token: "t1" }))
      .mockResolvedValueOnce(turnResponse({}));
    finishMock.mockRejectedValueOnce(new Error("boom"));
    const result = await generateSimilar(LOGO, BRIEF, "Zeynep Yoga");
    expect(result.kind).toBe("lockup");
  });

  it("degrades to an icon-only recipe when the name turn fails", async () => {
    turnMock
      .mockResolvedValueOnce(turnResponse({}))
      .mockResolvedValueOnce(turnResponse({ source: "quota_exhausted" }));
    const result = await generateSimilar(LOGO, BRIEF, "Zeynep Yoga");
    expect(result.kind).toBe("icon");
    expect(result.recipe.mark.type).toBe("custom");
    expect(result.recipe.tagline).toBe("Breathe daily");
    expect(result.turnsRemaining).toBe(7); // from the icon turn
  });

  it("throws SimilarError when the icon turn is gated", async () => {
    turnMock.mockResolvedValueOnce(turnResponse({ source: "quota_exhausted" }));
    await expect(
      generateSimilar(LOGO, BRIEF, "Zeynep Yoga"),
    ).rejects.toBeInstanceOf(SimilarError);
  });

  it("throws SimilarError when the icon turn returns no designs", async () => {
    turnMock.mockResolvedValueOnce(turnResponse({ designs: [] }));
    await expect(
      generateSimilar(LOGO, BRIEF, "Zeynep Yoga"),
    ).rejects.toBeInstanceOf(SimilarError);
  });
});
