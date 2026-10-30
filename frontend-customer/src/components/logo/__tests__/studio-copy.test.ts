import { createElement, type FC, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import enAdmin from "../../../../messages/en/admin.json";
import deAdmin from "../../../../messages/de/admin.json";
import enStudio from "../../../../../packages/shared/src/i18n/messages/en/studio.json";
import deStudio from "../../../../../packages/shared/src/i18n/messages/de/studio.json";
import FolderRail from "@shared/mailbox/folder-rail";
import { AiProgress } from "@/components/ui/ai-progress";
import { StudioBrief } from "../studio-brief";
import { StudioEntrance } from "../studio-entrance";

const Intl = NextIntlClientProvider as FC<{
  locale: string;
  messages: Record<string, unknown>;
  children?: ReactNode;
}>;
const render = (
  locale: "en" | "de",
  el: Parameters<typeof renderToStaticMarkup>[0],
) =>
  renderToStaticMarkup(
    createElement(
      Intl,
      {
        locale,
        messages:
          locale === "en"
            ? { admin: enAdmin, studio: enStudio }
            : { admin: deAdmin, studio: deStudio },
      },
      el,
    ),
  );

const brief = { brandName: "", niche: "", styleChips: [] };
const noop = () => undefined;

describe("the logo studio and its shared parts", () => {
  it("read as they always did in English", () => {
    const html = render(
      "en",
      createElement(StudioBrief, {
        brief,
        onChange: noop,
        onSubmit: noop,
        onStartOver: noop,
      }),
    );
    for (const text of [
      "Tell us about your brand",
      "What do you offer?",
      "(pick up to 3)",
      "Show my logo ideas",
      "Elegant",
    ])
      expect(html).toContain(text);
    expect(
      render(
        "en",
        createElement(AiProgress, {
          phases: [{ key: "a", label: "Sketching concepts" }],
          currentPhase: "a",
          onCancel: noop,
        }),
      ),
    ).toContain("Sketching concepts in progress");
    expect(
      render(
        "en",
        createElement(FolderRail, {
          folder: "spam",
          onSelect: noop,
          onCompose: noop,
        }),
      ),
    ).toContain("Archived");
  });

  it("speak the creator's language, with identities untouched", () => {
    const html = render(
      "de",
      createElement(StudioBrief, {
        brief: { ...brief, styleChips: ["Bold"] },
        onChange: noop,
        onSubmit: noop,
        onStartOver: noop,
      }),
    );
    expect(html).not.toContain("Tell us about your brand");
    expect(html).toContain(deAdmin.logo.brief.title);
    expect(html).toContain(deAdmin.logo.brief.chip.Bold);
    const entrance = render(
      "de",
      createElement(StudioEntrance, {
        logos: [],
        onUseCurated: noop,
        onCreateSimilar: noop,
        onUpgrade: noop,
        onDesignWithAi: noop,
        logoAiStatus: null,
        generatingFilename: null,
      } as never),
    );
    expect(entrance).toContain(deAdmin.logo.entrance.readyMade);
  });
});
