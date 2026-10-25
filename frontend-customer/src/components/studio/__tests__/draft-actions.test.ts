import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { DraftActions } from "@/components/studio/draft-actions";
import type { CoverDraft } from "@/components/studio/use-cover-draft";
import type { DesignRecord } from "@/types/design";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(createElement(Intl, { locale: "en", messages }, node));

const WAIT = "Wait for the photo to finish";

/** Only what DraftActions reads. */
const draftOf = (over: Partial<CoverDraft> = {}) =>
  ({
    saveState: "saved",
    retrySave: vi.fn(),
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    keep: vi.fn(),
    keeping: false,
    editCopy: vi.fn(),
    copying: false,
    busy: false,
    locked: false,
    ...over,
  }) as unknown as CoverDraft;

const actions = (draft: CoverDraft, inBar = false) =>
  render(
    createElement(DraftActions, {
      draft,
      design: { state: "draft" } as DesignRecord,
      editable: true,
      canCopy: false,
      noun: "course",
      onDiscard: vi.fn(),
      inBar,
    }),
  );

/** The opening tag of the button with this name. */
const button = (markup: string, name: string) =>
  markup.match(
    new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*${name}`),
  )![0];

describe("DraftActions while a photo is on its way", () => {
  it("greys Keep and Discard and says why, on the buttons and on the group the hover lands on", () => {
    for (const inBar of [false, true]) {
      const markup = actions(draftOf({ locked: true }), inBar);
      expect(button(markup, "Keep on course")).toContain('disabled=""');
      expect(button(markup, "Keep on course")).toContain(`title="${WAIT}"`);
      expect(button(markup, "Discard")).toContain('disabled=""');
      expect(button(markup, "Discard")).toContain(`title="${WAIT}"`);
      // a disabled button takes no pointer: the group around the two answers the hover
      expect(markup).toMatch(new RegExp(`<div[^>]*title="${WAIT}"`));
    }
  });

  it("says nothing when nothing is held, or when the draft is being kept (that is plain to see)", () => {
    expect(actions(draftOf())).not.toContain(WAIT);
    const keeping = actions(
      draftOf({ locked: true, busy: true, keeping: true }),
    );
    expect(keeping).not.toContain(WAIT);
    expect(button(keeping, "Discard")).toContain('disabled=""');
  });
});

describe("DraftActions: Download", () => {
  const withExport = (inBar: boolean, editable = true) =>
    render(
      createElement(DraftActions, {
        draft: draftOf({ save: vi.fn() } as Partial<CoverDraft>),
        design: {
          id: "d1",
          state: editable ? "draft" : "kept",
        } as DesignRecord,
        editable,
        canCopy: !editable,
        noun: "course",
        onDiscard: vi.fn(),
        inBar,
        exportShape: "4/5",
      }),
    );

  it("is a button with its name in the workspace's bar, and an icon beside Undo on a phone", () => {
    expect(withExport(true)).toMatch(
      /<button[^>]*>(?:(?!<\/button>)[\s\S])*Download<\/button>/,
    );
    const phone = withExport(false);
    expect(phone).toContain('aria-label="Download"');
    expect(phone).not.toMatch(/<svg[^>]*>[\s\S]*?<\/svg>Download<\/button>/);
    // a kept cover has no Undo row: its Download sits with Edit a copy
    expect(withExport(false, false)).toMatch(/<\/svg>Download<\/button>/);
  });

  it("is not there when the site cannot make files", () => {
    expect(actions(draftOf(), true)).not.toContain("Download");
    expect(actions(draftOf())).not.toContain("Download");
  });
});
