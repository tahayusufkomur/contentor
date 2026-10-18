import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What the hook talks to. The draft's own logic is the real one; these are the network, the router and the
// toasts around it.
const api = vi.hoisted(() => ({
  saveDesign: vi.fn(),
  keepDesign: vi.fn(),
  deleteDesign: vi.fn(),
  getDesign: vi.fn(),
  refresh: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/designs-api", () => ({
  saveDesign: api.saveDesign,
  keepDesign: api.keepDesign,
  deleteDesign: api.deleteDesign,
  getDesign: api.getDesign,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: api.refresh }),
}));
vi.mock("@shared/navigation/navigation-provider", () => ({
  useNavigate: () => api.navigate,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/copilot/api", () => ({ undoCopilotAction: vi.fn() }));
vi.mock("@/lib/covers/open-studio", () => ({ openCoverStudio: vi.fn() }));
vi.mock("@/lib/site-events", () => ({
  announceAssistantApplied: vi.fn(),
  announceSiteUpdated: vi.fn(),
}));

import {
  useCoverDraft,
  type CoverDraft,
} from "@/components/studio/use-cover-draft";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { WorkKind } from "@/lib/covers/work";
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
const NEW_PHOTO = "22222222-2222-4222-8222-222222222222";
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

const reload = vi.fn();

/** The hook as one render of it gives it. A server render runs no effect and keeps no state past it, so what
 *  the hook returns is its first state: `working` lists the kinds of photo already on their way, set during
 *  that render the way React allows (a state change in the render that makes it re-renders at once). The
 *  functions it returns are the real ones, and can be called afterwards. */
function mount(working: WorkKind[] = []): CoverDraft {
  let draft!: CoverDraft;
  function Probe() {
    draft = useCoverDraft({
      design,
      editable: true,
      generationsLeft: 5,
      reload,
    });
    for (const kind of working) {
      if (!draft.isWorking(kind)) draft.setWork(kind, true);
    }
    return null;
  }
  renderToStaticMarkup(
    createElement(
      Intl,
      { locale: "en", timeZone: "UTC", messages },
      createElement(Probe),
    ),
  );
  return draft;
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of Object.values(api)) fn.mockReset();
  reload.mockReset();
  api.saveDesign.mockResolvedValue({});
  api.keepDesign.mockResolvedValue({
    audit_id: null,
    result: { title: "Morning flow" },
  });
  api.deleteDesign.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

/** What the autosave sent, once its 800 ms are up. */
async function saved() {
  await vi.advanceTimersByTimeAsync(1000);
  return api.saveDesign.mock.calls.map(([, recipe]) => recipe);
}

describe("useCoverDraft locked", () => {
  it("is false for a draft with nothing on its way, and does not freeze editing", () => {
    const draft = mount();
    expect(draft.locked).toBe(false);
    expect(draft.busy).toBe(false);
  });

  it("holds Keep and Discard while a photo is on its way, from the Photos drawer or the Uploads one", () => {
    for (const kind of ["photos", "uploads"] as const) {
      const draft = mount([kind]);
      expect(draft.isWorking(kind), kind).toBe(true);
      expect(draft.locked, kind).toBe(true);
      // editing goes on: only Keep and Discard wait, so the photo lands on a cover that is still there
      expect(draft.busy, kind).toBe(false);
    }
    expect(mount(["photos", "uploads"]).locked).toBe(true);
  });
});

describe("useCoverDraft pick", () => {
  it("puts a photo that lands on the cover, and saves it", async () => {
    const draft = mount();
    draft.pick({ id: NEW_PHOTO, url: "https://cdn.test/new.jpg" });
    const sent = await saved();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ photo: { id: NEW_PHOTO } });
  });

  it("changes nothing for a photo that lands after Keep has started the reload: the cover is kept as it was", async () => {
    const draft = mount();
    await draft.keep();
    expect(api.keepDesign).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);

    draft.pick({ id: NEW_PHOTO, url: "https://cdn.test/new.jpg" });
    expect(await saved()).toEqual([]);
  });

  it("changes nothing for a photo that lands after Discard: a save to a draft that is gone would be a 404", async () => {
    const draft = mount();
    await draft.discard();
    expect(api.deleteDesign).toHaveBeenCalledTimes(1);
    expect(api.navigate).toHaveBeenCalledWith("/admin/studio");

    draft.pick({ id: NEW_PHOTO, url: "https://cdn.test/new.jpg" });
    expect(await saved()).toEqual([]);
  });
});
