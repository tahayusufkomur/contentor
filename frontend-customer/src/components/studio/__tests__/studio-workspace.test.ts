import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

// NavLink needs the Next app router; a plain anchor is enough here.
vi.mock("@/components/ui/nav-link", async () => {
  const { createElement: h } =
    await vi.importActual<typeof import("react")>("react");
  return {
    NavLink: ({
      href,
      className,
      children,
    }: {
      href: string;
      className?: string;
      children?: ReactNode;
    }) => h("a", { href, className }, children),
  };
});

import type { CoverDraft } from "@/components/studio/use-cover-draft";
import { Workspace } from "@/components/studio/studio-workspace";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { DesignRecord } from "@/types/design";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  timeZone: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;

const PHOTO = "11111111-1111-4111-8111-111111111111";
const design: DesignRecord = {
  id: "d1",
  recipe: defaultRecipe({ photoId: PHOTO }),
  photos: { [PHOTO]: "https://cdn.test/photo.jpg" },
  logo_url: null,
  look: "journal",
  kind: "cover",
  target_kind: "course",
  target_key: "1",
  state: "draft",
  made_by: "",
  run_id: "",
  created_at: "2026-10-17T10:00:00Z",
  updated_at: "2026-10-17T10:00:00Z",
  kept_at: null,
  title: "Morning flow",
};

/** Only what the Workspace and the drawers it draws read. */
const draftOf = (over: Partial<CoverDraft> = {}) =>
  ({
    recipe: design.recipe,
    photos: design.photos,
    saveState: "saved",
    edit: vi.fn(),
    pick: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    retrySave: vi.fn(),
    refreshPhotos: vi.fn(),
    generating: false,
    setGenerating: vi.fn(),
    setWork: vi.fn(),
    isWorking: () => false,
    left: 5,
    countPhoto: vi.fn(),
    photosUsedUp: vi.fn(),
    keep: vi.fn(),
    keeping: false,
    discard: vi.fn(),
    discarding: false,
    editCopy: vi.fn(),
    copying: false,
    busy: false,
    locked: false,
    ...over,
  }) as unknown as CoverDraft;

function workspace(draft: CoverDraft) {
  return renderToStaticMarkup(
    createElement(
      Intl,
      { locale: "en", timeZone: "UTC", messages },
      createElement(Workspace, {
        draft,
        design,
        cover: design,
        item: { title: "Morning flow" },
        title: "Morning flow",
        noun: "course",
        size: "card",
        onSize: vi.fn(),
        cardAspect: "4/5",
        selected: null,
        onSelect: vi.fn(),
        set: null,
        photoSources: {
          cardAspect: "4/5",
          inUse: {},
          generationsLeft: 5,
          onPick: vi.fn(),
        },
        others: [],
        timeZone: "UTC",
        notice: "",
        onDiscard: vi.fn(),
      }),
    ),
  );
}

/** The opening tag of the button with this name. */
const button = (markup: string, name: string) =>
  markup.match(
    new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*${name}`),
  )![0];

/** The Photos drawer, as the markup shows it: its tabs, and a wrapper that hides it. */
const photosDrawer = (markup: string) => ({
  mounted: markup.includes('role="tablist"') && markup.includes("Contentor"),
  hidden: /<div hidden="">(?:<section[^>]*>)<h2[^>]*>Photo</.test(markup),
});

describe("Workspace while a photo is on its way", () => {
  const busy = (kinds: string[]) =>
    draftOf({ isWorking: (kind?: string) => kinds.includes(kind ?? "") });

  it("keeps the Photos drawer mounted, out of sight, under the tool she looks at: closing it would stop a paid photo", () => {
    // (the editor opens on Layouts)
    const markup = workspace(busy(["photos"]));
    expect(markup).toContain('<section aria-label="Layouts"');
    expect(markup).toContain("Colour panel");
    expect(photosDrawer(markup)).toEqual({ mounted: true, hidden: true });
  });

  it("drops it when no photo is on its way", () => {
    const markup = workspace(draftOf());
    expect(markup).toContain('<section aria-label="Layouts"');
    expect(photosDrawer(markup)).toEqual({ mounted: false, hidden: false });
  });

  it("does not keep it for an upload, which has its own drawer to stay in", () => {
    expect(photosDrawer(workspace(busy(["uploads"])))).toEqual({
      mounted: false,
      hidden: false,
    });
  });
});

describe("Workspace's Keep and Discard", () => {
  it("are the draft's own: greyed with the reason while the draft is locked, and free when it is not", () => {
    const WAIT = 'title="Wait for the photo to finish"';
    const locked = workspace(draftOf({ locked: true }));
    expect(button(locked, "Keep on course")).toContain('disabled=""');
    expect(button(locked, "Keep on course")).toContain(WAIT);
    expect(button(locked, "Discard")).toContain('disabled=""');
    const free = workspace(draftOf());
    expect(button(free, "Keep on course")).not.toContain('disabled=""');
    expect(button(free, "Discard")).not.toContain('disabled=""');
  });
});
