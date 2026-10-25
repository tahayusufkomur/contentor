import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// NavLink needs the Next app router and Link a router context; plain anchors are enough here.
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
vi.mock("next/link", async () => {
  const { createElement: h } =
    await vi.importActual<typeof import("react")>("react");
  return {
    default: ({
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

import { CourseCard } from "@/components/public/course-card";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { Course } from "@/types/course";
import type { CoverDesign, CoverRecipe } from "@/types/design";
import type { CalendarEvent } from "@/types/live";
import type { Block } from "@/types/tenant";
import { Img, courseCover, eventCover } from "../kit";
import { CoursesPosters } from "../kinetic/courses";
import { CoursesRows, EventsRows } from "../rows";
import { CoursesPaths } from "../sanctum/courses";

const PHOTO = "11111111-1111-4111-8111-111111111111";
const PHOTO_URL = "https://cdn.test/photo.jpg";
const LEGACY_URL = "https://cdn.test/legacy.jpg";

/** A kept design with words and a badge to draw, so that bare mode has something to leave out. */
function design(edit: (recipe: CoverRecipe) => void = () => {}): CoverDesign {
  const recipe = defaultRecipe({ photoId: PHOTO });
  recipe.words = { label: "Course", title: null, subtitle: "Six weeks" };
  recipe.badge = { kind: "live", text: "", fill: "accent" };
  edit(recipe);
  return {
    id: "d1",
    recipe,
    photos: { [PHOTO]: PHOTO_URL },
    logo_url: null,
    look: "atelier",
  };
}

const course = (over: Partial<Course> = {}): Course => ({
  id: 1,
  title: "Morning flow",
  slug: "morning-flow",
  description: "Start the day slowly.",
  instructor: 1,
  instructor_name: "Ada",
  thumbnail_url: "",
  thumbnail_signed_url: LEGACY_URL,
  price: "0",
  pricing_type: "free",
  is_published: true,
  order: 0,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 5,
  type: "live_class",
  title: "Sunrise class",
  description: "",
  status: "scheduled",
  pricing_type: "free",
  price: "0",
  scheduled_at: "2026-11-02T18:30:00Z",
  started_at: null,
  ended_at: null,
  location: "",
  thumbnail_signed_url: LEGACY_URL,
  ...over,
});

const BLOCK: Block = { id: "blk_rows0001", type: "cx" };
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el);
const count = (markup: string, needle: string) =>
  markup.split(needle).length - 1;
/** The attributes of the image tag that shows one URL ("" when none does). */
const imgOf = (markup: string, url: string) =>
  markup
    .split("<img")
    .find((part) => part.includes(`src="${url}"`))
    ?.split(">")[0] ?? "";

describe("Img with a kept design", () => {
  const item = { title: "Morning flow" };
  const frame = (value: unknown, props: Record<string, unknown> = {}) =>
    html(
      createElement(Img, {
        value,
        alt: "Morning flow",
        className: "aspect-square w-full",
        ...props,
      }),
    );

  it("draws the design in its frame and no photo of its own", () => {
    // The design's photo is the item's photo: the same link, so any bare <img> outside the cover would show.
    const out = frame({ url: PHOTO_URL, design: design(), item });
    expect(out).toMatch(
      /^<div data-site-img-frame="" class="relative overflow-hidden bg-muted aspect-square w-full"><div data-cover=""/,
    );
    expect(out).toMatch(/<\/div><\/div>$/);
    // One <img> per size it may show, all inside the cover; the frame holds nothing else.
    expect(out.indexOf("<img")).toBeGreaterThan(out.indexOf("data-cover"));
    expect(out).not.toContain("data-site-img=");
    expect(frame({ url: LEGACY_URL, design: design(), item })).not.toContain(
      LEGACY_URL,
    );
  });

  it("draws words and badge in full mode and neither in bare mode", () => {
    const full = frame({ design: design(), item, mode: "full" });
    expect(full).toContain("data-words");
    expect(full).toContain("data-badge");
    const dflt = frame({ design: design(), item });
    expect(dflt).toContain("data-words");

    const bare = frame({ design: design(), item, mode: "bare" });
    expect(bare).toContain("data-cover");
    expect(bare).not.toContain("data-words");
    expect(bare).not.toContain("data-badge");
  });

  it("puts the look's photo effects on the cover's photo and passes priority through", () => {
    const lazy = imgOf(
      frame({ design: design(), item }, { imgClassName: "grayscale" }),
      PHOTO_URL,
    );
    expect(lazy).toContain("grayscale");
    expect(lazy).toContain('loading="lazy"');
    expect(lazy).not.toContain("fetchpriority");

    const eager = imgOf(
      frame(
        { design: design(), item },
        { imgClassName: "grayscale", priority: true },
      ),
      PHOTO_URL,
    );
    expect(eager).toContain("grayscale");
    expect(eager).toContain('loading="eager"');
    expect(eager).toContain('fetchpriority="high"');
  });

  it("draws the photo when the value has no design", () => {
    for (const value of [
      { url: LEGACY_URL },
      { url: LEGACY_URL, design: null, item, mode: "full" },
    ]) {
      const out = frame(value);
      expect(out).not.toContain("data-cover");
      expect(imgOf(out, LEGACY_URL)).toContain("object-cover");
    }
  });

  it("draws a design given without its item, under the title the image is labelled with", () => {
    const out = frame({ url: LEGACY_URL, design: design() });
    expect(out).toContain("data-cover");
    expect(out).not.toContain(LEGACY_URL);
    expect(out).toContain(">Morning flow<");
    // Its own alt wins over the one the call site gives.
    expect(frame({ design: design(), alt: "Evening flow" })).toContain(
      ">Evening flow<",
    );
  });

  it("is the same markup as before for a photo, a priority photo and no photo", () => {
    expect(frame({ url: LEGACY_URL })).toBe(
      '<div data-site-img-frame="" class="relative overflow-hidden bg-muted aspect-square w-full"><img src="https://cdn.test/legacy.jpg" alt="Morning flow" loading="lazy" decoding="async" data-site-img="" class="absolute inset-0 h-full w-full object-cover object-[50%_30%]"/></div>',
    );
    expect(
      frame(
        { url: LEGACY_URL, design: null, item, mode: "full" },
        { priority: true, imgClassName: "grayscale" },
      ),
    ).toBe(
      '<div data-site-img-frame="" class="relative overflow-hidden bg-muted aspect-square w-full"><img src="https://cdn.test/legacy.jpg" alt="Morning flow" loading="eager" decoding="async" data-site-img="priority" class="absolute inset-0 h-full w-full object-cover object-[50%_30%] grayscale"/></div>',
    );
    expect(frame({ url: null })).toBe(
      '<div data-site-img-frame="" class="relative overflow-hidden bg-muted aspect-square w-full"><div aria-hidden="true" data-empty-image="" class="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_60%),radial-gradient(ellipse_at_80%_90%,color-mix(in_oklch,var(--accent)_22%,transparent),transparent_55%)]"></div></div>',
    );
  });
});

describe("courseCover and eventCover", () => {
  it("gives a course without a design its photo, no design, its own words and the full mode", () => {
    expect(courseCover(course())).toEqual({
      url: LEGACY_URL,
      design: null,
      item: { title: "Morning flow", createdAt: "2026-10-01T00:00:00Z" },
      mode: "full",
    });
    // The legacy link counts when the signed one is missing, and none is a null url.
    expect(
      courseCover(
        course({
          thumbnail_signed_url: undefined,
          thumbnail_url: "legacy.jpg",
        }),
      ).url,
    ).toBe("legacy.jpg");
    expect(
      courseCover(course({ thumbnail_signed_url: undefined })).url,
    ).toBeNull();
  });

  it("carries the kept design and the mode asked for", () => {
    const d = design();
    const cover = courseCover(course({ cover_design: d }), "bare");
    expect(cover.design).toBe(d);
    expect(cover.mode).toBe("bare");
    expect(courseCover(course({ cover_design: null })).design).toBeNull();
  });

  it("reads an event's photo, start and design, and the time zone it is told", () => {
    expect(eventCover(event())).toEqual({
      url: LEGACY_URL,
      design: null,
      item: { title: "Sunrise class", startsAt: "2026-11-02T18:30:00Z" },
      mode: "full",
    });
    const d = design();
    const cover = eventCover(
      event({ cover_design: d, thumbnail_signed_url: null }),
      "bare",
      "Europe/Istanbul",
    );
    expect(cover).toMatchObject({
      url: null,
      design: d,
      mode: "bare",
      item: { startsAt: "2026-11-02T18:30:00Z", timeZone: "Europe/Istanbul" },
    });
  });
});

describe("an event's date badge", () => {
  it("is read in the time zone eventCover is given", () => {
    // 23:30 UTC on 2 November is the 3rd in Istanbul and still the 2nd in New York.
    vi.useFakeTimers({
      now: new Date("2026-10-18T12:00:00Z"),
      toFake: ["Date"],
    });
    try {
      const dated = design((r) => {
        r.badge = { kind: "date", text: "", fill: "accent" };
      });
      const e = event({
        cover_design: dated,
        scheduled_at: "2026-11-02T23:30:00Z",
      });
      const draw = (timeZone: string) =>
        html(createElement(Img, { value: eventCover(e, "full", timeZone) }));
      expect(draw("Europe/Istanbul")).toContain(">Nov 3<");
      expect(draw("America/New_York")).toContain(">Nov 2<");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the streaming rows", () => {
  it("draw a course's design bare: a billboard and a tile print their own titles", () => {
    const out = html(
      createElement(CoursesRows, {
        block: BLOCK,
        data: [
          course({ cover_design: design() }),
          course({ id: 2, title: "Second", cover_design: design() }),
        ],
      }),
    );
    expect(count(out, "data-cover")).toBe(2);
    expect(out).not.toContain("data-words");
    expect(out).not.toContain("data-badge");
    // The billboard leads the page: its photo is eager and high priority.
    expect(imgOf(out, PHOTO_URL)).toContain('fetchpriority="high"');
    // The look's own titles are there.
    expect(out).toContain(">Morning flow<");
    expect(out).toContain(">Second<");
  });

  it("draw an event's design bare, and a photo as a photo", () => {
    const out = html(
      createElement(EventsRows, {
        block: BLOCK,
        data: [
          event({ cover_design: design() }),
          event({ id: 6, cover_design: design() }),
          event({ id: 7 }),
        ],
      }),
    );
    expect(count(out, "data-cover")).toBe(2);
    expect(out).not.toContain("data-words");
    expect(out).not.toContain("data-badge");
    expect(imgOf(out, LEGACY_URL)).toContain("object-cover");
  });

  it("draw plain photos exactly as they did", () => {
    const out = html(
      createElement(CoursesRows, {
        block: BLOCK,
        data: [course(), course({ id: 2, title: "Second" })],
      }),
    );
    expect(out).not.toContain("data-cover");
    expect(count(out, LEGACY_URL)).toBe(2);
  });
});

describe("kinetic's course posters", () => {
  const posters = (data: Course[]) =>
    html(createElement(CoursesPosters, { block: BLOCK, data }));

  it("draw a design bare, and the one-course feature, which prints its title beside the cover, in full", () => {
    const out = posters([
      course({ cover_design: design() }),
      course({ id: 2, title: "Second", cover_design: design() }),
    ]);
    expect(count(out, "data-cover")).toBe(2);
    expect(out).not.toContain("data-words");
    expect(out).not.toContain("data-badge");

    const feature = posters([course({ cover_design: design() })]);
    expect(count(feature, "data-cover")).toBe(1);
    expect(feature).toContain("data-words");
  });
});

describe("sanctum's course paths", () => {
  const paths = (data: Course[]) =>
    html(createElement(CoursesPaths, { block: BLOCK, data }));
  /** The class of the photo window's figure and of the frame inside it. */
  const window = (markup: string) => ({
    figure: /<figure class="([^"]*)"/.exec(markup)?.[1] ?? "",
    frame:
      /<div data-site-img-frame="" class="([^"]*)"/.exec(markup)?.[1] ?? "",
  });

  it("draws a designed cover in a plain rounded frame: the arch would cut off its logo and badge", () => {
    const out = paths([course({ cover_design: design() })]);
    expect(out).toContain("data-cover");
    const { figure, frame } = window(out);
    for (const classes of [figure, frame]) {
      expect(classes).not.toContain("sanctum-arch");
      expect(classes).not.toContain("rounded-t-full");
    }
    expect(figure).toContain("rounded-[var(--radius)]");
    expect(frame).toContain("rounded-[calc(var(--radius)-4px)]");
  });

  it("keeps the arch for a plain photo", () => {
    const out = paths([course()]);
    expect(out).not.toContain("data-cover");
    const { figure, frame } = window(out);
    expect(figure).toContain("rounded-t-full");
    expect(frame).toContain("sanctum-arch");
    expect(imgOf(out, LEGACY_URL)).toContain("object-cover");
  });

  it("decides course by course", () => {
    const out = paths([
      course({ cover_design: design() }),
      course({ id: 2, title: "Second" }),
    ]);
    expect(count(out, "data-cover")).toBe(1);
    expect(count(out, "rounded-t-full")).toBe(1);
    expect(count(out, "sanctum-arch")).toBe(1);
  });
});

describe("CourseCard", () => {
  const card = (variant: "elevated" | "overlay", over: Partial<Course> = {}) =>
    html(
      createElement(CourseCard, {
        course: course({ cover_design: design(), ...over }),
        variant,
      }),
    );

  it("draws a kept design in its image box, full except where the card prints its own title over it", () => {
    for (const variant of ["elevated", "bordered", "minimal"] as const) {
      const out = html(
        createElement(CourseCard, {
          course: course({ cover_design: design() }),
          variant,
        }),
      );
      expect(out, variant).toContain("data-cover");
      expect(out, variant).toContain("data-words");
      expect(out, variant).not.toContain(LEGACY_URL);
    }
    const overlay = card("overlay");
    expect(overlay).toContain("data-cover");
    expect(overlay).not.toContain("data-words");
    expect(overlay).not.toContain("data-badge");
    expect(overlay).not.toContain(LEGACY_URL);
  });

  it("keeps the course's own photo markup without a design", () => {
    const out = card("elevated", { cover_design: null });
    expect(out).not.toContain("data-cover");
    expect(imgOf(out, LEGACY_URL)).toContain("h-44 w-full object-cover");
  });
});
