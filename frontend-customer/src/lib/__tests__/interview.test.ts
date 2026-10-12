import { describe, expect, it } from "vitest";
import {
  turnErrorText,
  type GuideTurn,
  type InterviewEntry,
} from "@/lib/setup-flow";
import { ApiError } from "@/types/api";
import {
  accessBadge,
  waysIn,
  activityLine,
  ADDRESS_BOXES,
  addressOk,
  contactOk,
  priceOk,
  defaultSchedule,
  finishedNotes,
  formatPrice,
  joinSpeech,
  landedPage,
  noteOf,
  pickedOptions,
  planLabel,
  questionSteps,
  SECTIONS,
  sectionOf,
  socialLink,
  socialOk,
  starterStart,
  stageIndex,
  tileIcons,
  withNote,
} from "@/lib/interview";

describe("joinSpeech", () => {
  it("starts from an empty box", () => {
    expect(joinSpeech("", " hello there ")).toBe("hello there");
  });
  it("appends with one space", () => {
    expect(joinSpeech("I teach yoga ", "to office workers")).toBe(
      "I teach yoga to office workers",
    );
  });
  it("ignores an empty phrase", () => {
    expect(joinSpeech("keep me", "  ")).toBe("keep me");
  });
});

describe("landedPage", () => {
  it("finds the page that just turned ready", () => {
    expect(
      landedPage(
        { home: { status: "building" }, about: { status: "idle" } },
        { home: { status: "ready" }, about: { status: "building" } },
      ),
    ).toBe("home");
  });
  it("is null when nothing changed", () => {
    expect(
      landedPage({ home: { status: "ready" } }, { home: { status: "ready" } }),
    ).toBeNull();
  });
});

describe("formatPrice", () => {
  it("formats cents in the plan currency", () => {
    expect(formatPrice(1990, "usd")).toBe("$19.90");
    expect(formatPrice(null, "eur")).toBe("");
  });
});

describe("questionSteps", () => {
  const ask = (field: string, question = `${field}?`): GuideTurn => ({
    ack: "",
    question,
    options: ["A", "B"],
    field,
    can_delegate: true,
  });
  const guide = (field: string, question?: string): InterviewEntry => ({
    role: "guide",
    ...ask(field, question),
  });
  const said = (text: string, field?: string): InterviewEntry => ({
    role: "coach",
    text,
    ...(field ? { field } : {}),
  });

  it("keeps icons and hints on a question", () => {
    const g: GuideTurn = {
      ...ask("tone"),
      icons: { A: "heart" },
      hints: { A: "Come as you are." },
    };
    const steps = questionSteps([{ role: "guide", ...g }], g);
    expect(steps[0].icons).toEqual({ A: "heart" });
    expect(steps[0].hints).toEqual({ A: "Come as you are." });
  });

  it("keeps icons and hints on an answered question too", () => {
    const g: GuideTurn = {
      ...ask("tone"),
      icons: { A: "heart" },
      hints: { A: "Come as you are." },
    };
    const steps = questionSteps(
      [{ role: "guide", ...g }, said("A")],
      ask("next"),
    );
    expect(steps[0].icons).toEqual({ A: "heart" });
    expect(steps[0].hints).toEqual({ A: "Come as you are." });
  });

  it("lists answered questions in order, then the live one", () => {
    const entries = [
      guide("teaches"),
      said("Yoga"),
      guide("audience"),
      said("Parents"),
      guide("outcome"),
    ];
    const steps = questionSteps(entries, ask("outcome"));
    expect(steps.map((s) => [s.field, s.answer])).toEqual([
      ["teaches", "Yoga"],
      ["audience", "Parents"],
      ["outcome", undefined],
    ]);
  });
  it("keeps a revisited question in place with its new answer", () => {
    const entries = [
      guide("teaches"),
      said("Yoga"),
      guide("audience", "Who?"),
      said("Parents"),
      guide("outcome"),
      said("Pilates", "teaches"),
      guide("outcome", "What changes?"),
    ];
    const steps = questionSteps(entries, ask("outcome", "What changes?"));
    expect(steps.map((s) => [s.field, s.answer])).toEqual([
      ["teaches", "Pilates"],
      ["audience", "Parents"],
      ["outcome", undefined],
    ]);
    expect(steps[2].question).toBe("What changes?");
  });
  it("has no live step once nothing is left to ask", () => {
    const done: GuideTurn = { ...ask("x"), field: null, question: "Ready" };
    expect(questionSteps([guide("teaches"), said("Yoga")], done)).toHaveLength(
      1,
    );
  });
});

describe("pickedOptions", () => {
  const step = {
    ...{ ack: "", question: "q", field: "f", can_delegate: true },
  };
  it("finds every option a multi answer named", () => {
    expect(
      pickedOptions({
        ...step,
        multi: true,
        options: ["Parents", "Busy professionals", "Seniors"],
        answer: "parents, Busy professionals",
      }),
    ).toEqual(["Parents", "Busy professionals"]);
  });
  it("keeps options that contain commas whole", () => {
    expect(
      pickedOptions({
        ...step,
        multi: true,
        options: ["No mirrors, no judgement", "Small classes", "Costumes"],
        answer: "No mirrors, no judgement, Small classes",
      }),
    ).toEqual(["No mirrors, no judgement", "Small classes"]);
  });
  it("matches a single answer whole, and typed text not at all", () => {
    expect(
      pickedOptions({ ...step, options: ["Yoga"], answer: "Yoga" }),
    ).toEqual(["Yoga"]);
    expect(
      pickedOptions({ ...step, options: ["Yoga"], answer: "Yoga, mostly" }),
    ).toEqual([]);
  });
});

describe("activityLine", () => {
  it("is null when nothing is building", () => {
    expect(activityLine({ home: { status: "ready" } }, {})).toBeNull();
  });
  it("names the page and its stage", () => {
    expect(activityLine({ about: { status: "building" } }, {})).toBe(
      "Building your About page: planning the layout",
    );
    expect(
      activityLine({ home: { status: "building", stage: "photos" } }, {}),
    ).toBe("Building your home page: picking photos");
    expect(stageIndex("copy")).toBe(1);
  });
  it("counts what else is on the way", () => {
    expect(
      activityLine(
        { home: { status: "building", stage: "copy" } },
        { course: "building", post: "ready" },
      ),
    ).toBe("Building your home page: writing the words · 1 more on the way");
    expect(activityLine({}, { course: "building" })).toBe(
      "Drafting your first course",
    );
  });
});

describe("finishedNotes", () => {
  const builds = (home: string, about = "idle") => ({
    home: { status: home },
    about: { status: about },
  });
  it("announces pages and drafts that just finished", () => {
    expect(
      finishedNotes(
        {
          builds: builds("building", "building"),
          drafts: { course: "building" },
        },
        { builds: builds("ready", "failed"), drafts: { course: "ready" } },
      ),
    ).toEqual([
      "Your home page is ready. Have a look, and tell me anything you’d like changed.",
      "I couldn’t finish your About page, so it keeps its first version for now.",
      "Your first course is drafted. I’m adding it to your Courses page.",
    ]);
  });
  it("says nothing when nothing changed", () => {
    const same = { builds: builds("ready"), drafts: { course: "ready" } };
    expect(finishedNotes(same, same)).toEqual([]);
  });
});

describe("answers sent with a note", () => {
  const step: GuideTurn = {
    ack: "",
    question: "Who do you teach?",
    field: "audience",
    can_delegate: false,
    multi: true,
    options: ["Desk workers needing relief", "Runners"],
  };
  it("puts the note on its own line after the picks", () => {
    expect(
      withNote("Desk workers needing relief", "  mostly women over 40 "),
    ).toBe("Desk workers needing relief\nmostly women over 40");
    expect(withNote("", "just a note")).toBe("just a note");
    expect(withNote("Runners", "")).toBe("Runners");
  });
  it("going back ticks the tiles and puts the note back in the box", () => {
    const answer = withNote(
      "Desk workers needing relief",
      "mostly women over 40",
    );
    expect(pickedOptions({ ...step, answer })).toEqual([
      "Desk workers needing relief",
    ]);
    expect(noteOf(answer)).toBe("mostly women over 40");
    expect(noteOf("Runners")).toBe("");
  });
});

describe("starterStart", () => {
  it("opens a starter in its card without its ellipsis", () => {
    expect(starterStart("I found yoga when…")).toBe("I found yoga when");
    expect(starterStart("200-hour training...")).toBe("200-hour training");
    expect(starterStart("My own struggle with")).toBe("My own struggle with");
  });
});

describe("planLabel", () => {
  it("names the plan and its monthly price", () => {
    expect(
      planLabel({ name: "starter", amount_cents: 1990, currency: "usd" }),
    ).toBe("Starter plan · $19.90/mo");
    expect(
      planLabel({ name: "pro", amount_cents: null, currency: "EUR" }),
    ).toBe("Pro plan");
  });
});

describe("socialOk mirrors the server", () => {
  it.each([
    ["Instagram", "@mira.yoga", true],
    ["Instagram", "mira yoga house", false],
    ["Instagram", "https://www.instagram.com/mira.yoga/?hl=en", true],
    ["YouTube", "youtu.be/abc", true],
    ["X", "twitter.com/mira", true],
    ["TikTok", "", false],
    ["Instagram", "mira.yoga.", true],
    // A link has to be on the network's own site, with a profile after it.
    ["Instagram", "instagram.com/mira.yoga", true],
    ["Instagram", "facebook.com/mira", false],
    ["Instagram", "https://tiktok.com/@mira", false],
    ["Instagram", "instagram.com", false],
    ["Instagram", "www.facebook.com", false],
  ] as const)("%s %s", (network, raw, ok) => {
    expect(socialOk(network, raw)).toBe(ok);
  });

  it("reads a valid entry back as the profile it means", () => {
    expect(socialLink("Instagram", "@mira.yoga")).toBe(
      "instagram.com/mira.yoga",
    );
    expect(socialLink("YouTube", "mira")).toBe("youtube.com/@mira");
    expect(socialLink("LinkedIn", "https://linkedin.com/in/mira")).toBe(
      "linkedin.com/in/mira",
    );
    expect(socialLink("Instagram", "facebook.com/mira")).toBeNull();
  });
});

describe("turnErrorText", () => {
  it("names a refused handle and falls back for anything else", () => {
    expect(
      turnErrorText(new ApiError(400, { detail: "invalid_handle" })),
    ).toMatch(/handle/);
    expect(turnErrorText(new Error("offline"))).toMatch(/didn’t go through/);
  });
});

describe("tileIcons", () => {
  const base: GuideTurn = {
    ack: "",
    question: "Which kinds?",
    field: "specialty",
    can_delegate: false,
    options: ["Hatha", "Yin", "Power"],
  };
  it("shows icons only when every tile has its own", () => {
    const own = { Hatha: "sun", Yin: "moon", Power: "zap" };
    expect(tileIcons({ ...base, icons: own })).toBe(true);
    // Audit V2: eight yoga tiles shared one icon, which said nothing.
    const same = { Hatha: "flower-2", Yin: "flower-2", Power: "flower-2" };
    expect(tileIcons({ ...base, icons: same })).toBe(false);
    // Some AI tiles lost theirs and the grid looked uneven.
    expect(tileIcons({ ...base, icons: { Hatha: "sun", Yin: "moon" } })).toBe(
      false,
    );
    expect(tileIcons(base)).toBe(false);
  });
});

describe("defaultSchedule", () => {
  // Audit G6: the picker started empty, with no date or time.
  const saturday = new Date(2026, 9, 10, 12, 0); // Sat 10 Oct 2026, local
  it("starts a weekly class the Monday after today, in the evening", () => {
    expect(defaultSchedule("recurring", saturday)).toEqual({
      start: "2026-10-12",
      slots: [{ days: [], times: ["18:00"] }],
    });
    const monday = new Date(2026, 9, 12, 9, 0);
    expect(defaultSchedule("recurring", monday).start).toBe("2026-10-19");
  });
  it("puts a one-time class a week out, in the evening", () => {
    expect(defaultSchedule("once", saturday)).toEqual({
      at: "2026-10-17T18:00",
    });
  });
});

describe("sectionOf", () => {
  // Audit P1: "Question N of about T" went 16 → 21 → 20 → 22 → 21.
  it("follows the asking order and never steps back", () => {
    const asked = [
      "teaches",
      "specialty",
      "audience",
      "outcome",
      "offers",
      "pitch",
      "difference",
      "tone",
      "site_style",
      "story",
      "credentials",
      "site_logo",
      "payments",
      "memberships",
      "course_topic",
      "course_price",
      "course_review",
      "live_topic",
      "live_when",
      "event_price",
      "event_review",
      "onsite_topic",
      "onsite_when",
      "location",
      "onsite_price",
      "onsite_review",
      "calendar_view",
      "article_topic",
      "socials",
      "contact",
    ];
    const order = asked.map(sectionOf);
    expect(order.every((s, i) => i === 0 || s >= order[i - 1])).toBe(true);
    expect(order[0]).toBe(0);
    expect(sectionOf("contact")).toBe(SECTIONS.length - 1);
  });
  it("puts go-live after every section", () => {
    expect(sectionOf(null)).toBe(SECTIONS.length);
  });
});

describe("the address question", () => {
  it("sits in the in-person event's own questions, before its review", () => {
    const fields = SECTIONS[sectionOf("onsite_when")].fields;
    expect(fields.indexOf("location")).toBeGreaterThan(
      fields.indexOf("onsite_when"),
    );
    expect(fields.indexOf("onsite_review")).toBeGreaterThan(
      fields.indexOf("location"),
    );
    expect(fields.indexOf("onsite_topic")).toBeGreaterThan(
      fields.indexOf("event_review"),
    );
    expect(sectionOf("location")).toBe(sectionOf("onsite_when"));
    expect(sectionOf("calendar_view")).toBe(sectionOf("live_when"));
  });
  it("takes a filled box and refuses an empty one", () => {
    expect(ADDRESS_BOXES).toEqual(["Place", "Address"]);
    expect(addressOk("Hauptstr. 12")).toBe(true);
    expect(addressOk("  ")).toBe(false);
  });
});

describe("priceOk mirrors parse_price", () => {
  it.each([
    ["19", true],
    ["4,50", true],
    ["$12 a month", true],
    ["0", false],
    ["", false],
    ["lots", false],
    ["10000", false],
  ])("%s → %s", (raw, ok) => expect(priceOk(raw)).toBe(ok));
});

describe("contactOk mirrors the server", () => {
  // interview_brief.contact_detail_ok: an email, or 6 to 15 digits.
  it.each([
    ["Email", "mira@example.com", true],
    ["Email", "mira at example", false],
    ["WhatsApp", "+49 170 1234567", true],
    ["Phone", "(030) 123-4567", true],
    ["WhatsApp", "call me", false],
    ["Phone", "12345", false],
    ["Contact form", "", true],
  ] as const)("%s %s", (way, raw, ok) => {
    expect(contactOk(way, raw)).toBe(ok);
  });
});

describe("who can open it: the badge follows the ways in ticked", () => {
  // interview_brief.access_options: buying it, each membership, or free.
  it.each([
    ["Anyone who buys the course, Digital membership", null],
    ["Digital membership, All-access", "Members only"],
    ["Free for everyone", "Free"],
    ["Weekly face yoga classes\nonly my regulars", "Members only"],
    [undefined, null],
  ] as const)("%s → %s", (answer, badge) =>
    expect(accessBadge(waysIn(answer))).toBe(badge),
  );
  it("drops the note typed with the picks", () =>
    expect(waysIn("Digital membership, All-access\nfor now")).toEqual([
      "Digital membership",
      "All-access",
    ]));
});
