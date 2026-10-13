import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAsyncRunner } from "@shared/hooks/async-runner";
import { buildSelectionPayload } from "@/lib/copilot/selection";
import {
  isCreateKind,
  isUndoableKind,
  reduceChat,
  runBundle,
  toTranscript,
} from "@/lib/copilot/state";
import { starterKey } from "@/lib/copilot/starters";
import { ACTION_KINDS, type ChatEntry } from "@/lib/copilot/types";
import adminMessages from "../../../messages/en/admin.json";

const el = (
  over: Partial<Parameters<typeof buildSelectionPayload>[0]> = {},
) => ({
  tagName: "H2",
  textContent: "  Find your inner strength  ",
  closest: () => ({ getAttribute: () => "blk_hero" }),
  parentElement: { textContent: "Welcome Find your inner strength Join now" },
  ...over,
});

describe("buildSelectionPayload", () => {
  it("captures block id, tag, trimmed text and parent context", () => {
    const p = buildSelectionPayload(el(), "/pricing");
    expect(p).toEqual({
      path: "/pricing",
      block_id: "blk_hero",
      tag: "h2",
      text: "Find your inner strength",
      context: "Welcome Find your inner strength Join now",
    });
  });

  it("handles non-block elements and clamps long text", () => {
    const p = buildSelectionPayload(
      el({
        closest: () => null,
        textContent: "x".repeat(500),
        parentElement: null,
      }),
      "/",
    );
    expect(p.block_id).toBeNull();
    expect(p.text).toHaveLength(200);
    expect(p.context).toBe("");
  });
});

describe("chat state", () => {
  const entries: ChatEntry[] = [{ role: "coach", text: "hi" }];

  it("appends answers and action cards", () => {
    const next = reduceChat(entries, {
      kind: "actions",
      text: "plan",
      actions: [
        { kind: "add_block", title: "Add cta to home", detail: "", token: "t" },
      ],
    });
    expect(next).toHaveLength(2);
    expect(next[1].cards?.[0].token).toBe("t");
  });

  it("marks unavailable turns", () => {
    expect(reduceChat(entries, { kind: "unavailable" })[1].text).toBe(
      "__unavailable__",
    );
  });

  it("toTranscript strips cards and caps at 20", () => {
    const many: ChatEntry[] = Array.from({ length: 30 }, (_, i) => ({
      role: "coach",
      text: `m${i}`,
    }));
    const t = toTranscript(many);
    expect(t).toHaveLength(20);
    expect(t[19]).toEqual({ role: "coach", text: "m29" });
  });

  it("toTranscript excludes the unavailable marker entry", () => {
    const withMarker: ChatEntry[] = [
      { role: "coach", text: "hi" },
      { role: "assistant", text: "__unavailable__" },
      { role: "coach", text: "still there?" },
    ];
    const t = toTranscript(withMarker);
    expect(t).toEqual([
      { role: "coach", text: "hi" },
      { role: "coach", text: "still there?" },
    ]);
  });

  it("preserves the assistant turn kind for the ask-cap", () => {
    const entries = reduceChat([], { kind: "ask", text: "Which page?" });
    expect(entries[0].kind).toBe("ask");
    expect(toTranscript(entries)[0]).toEqual({
      role: "assistant",
      text: "Which page?",
      kind: "ask",
    });
  });

  it("omits kind for entries that never had one", () => {
    expect(toTranscript([{ role: "coach", text: "hi" }])[0]).toEqual({
      role: "coach",
      text: "hi",
    });
  });

  it("folds attached photos into the text so later turns can reuse the ids", () => {
    const t = toTranscript([
      {
        role: "coach",
        text: "here is my photo",
        attached: [
          {
            id: "abc-123",
            title: "My mark",
            desc: "a ballet dancer",
            // UI-only — must never leak into the model transcript.
            signed_url: "https://s3.example/thumb.png?sig=x",
          },
          { id: "def-456", title: "" },
        ],
      },
    ]);
    expect(t[0].text).toBe(
      "here is my photo\n[attached photos: photo_id=abc-123 'My mark' — a ballet dancer, photo_id=def-456 'untitled']",
    );
  });
});

describe("isCreateKind", () => {
  it("separates content creates from site edits", () => {
    expect(isCreateKind("create_course")).toBe(true);
    expect(isCreateKind("create_event")).toBe(true);
    expect(isCreateKind("create_blog_post")).toBe(true);
    expect(isCreateKind("edit_pages")).toBe(false);
    expect(isCreateKind("add_block")).toBe(false);
    expect(isCreateKind("edit_theme")).toBe(false);
    expect(isCreateKind("edit_navbar")).toBe(false);
    expect(isCreateKind("set_block_image")).toBe(false);
  });
});

describe("isUndoableKind", () => {
  it("allows undo for site/chrome edit kinds", () => {
    expect(isUndoableKind("edit_pages")).toBe(true);
    expect(isUndoableKind("add_block")).toBe(true);
    expect(isUndoableKind("remove_block")).toBe(true);
    expect(isUndoableKind("move_block")).toBe(true);
    expect(isUndoableKind("edit_block_fields")).toBe(true);
    expect(isUndoableKind("toggle_block")).toBe(true);
    expect(isUndoableKind("duplicate_block")).toBe(true);
    expect(isUndoableKind("edit_theme")).toBe(true);
    expect(isUndoableKind("edit_navbar")).toBe(true);
    expect(isUndoableKind("edit_seo")).toBe(true);
    expect(isUndoableKind("set_block_image")).toBe(true);
    expect(isUndoableKind("set_course_cover")).toBe(true);
    expect(isUndoableKind("set_logo")).toBe(true);
  });

  it("allows undo for a draft the assistant created (it is deleted while untouched)", () => {
    expect(isUndoableKind("create_course")).toBe(true);
    expect(isUndoableKind("create_event")).toBe(true);
    expect(isUndoableKind("create_blog_post")).toBe(true);
    expect(isUndoableKind("draft_announcement")).toBe(true);
  });

  it("disallows undo for edit/publish kinds (empty inverse server-side)", () => {
    expect(isUndoableKind("edit_course")).toBe(false);
    expect(isUndoableKind("edit_curriculum")).toBe(false);
    expect(isUndoableKind("edit_event")).toBe(false);
    expect(isUndoableKind("edit_blog_post")).toBe(false);
    expect(isUndoableKind("publish_course")).toBe(false);
    expect(isUndoableKind("publish_blog_post")).toBe(false);
  });
});

describe("ACTION_KINDS", () => {
  // The backend lives outside this package: present on a developer's machine
  // and in the repo checkout, absent inside the frontend container.
  const engine = path.resolve(
    __dirname,
    "../../../../backend/apps/core/copilot/engine.py",
  );
  it.skipIf(!existsSync(engine))(
    "lists exactly the actions the backend can propose",
    () => {
      const backend = [
        ...readFileSync(engine, "utf8").matchAll(
          /^ {4}kind: Literal\["([a-z_]+)"\]$/gm,
        ),
      ].map((m) => m[1]);
      expect(backend.length).toBeGreaterThan(20);
      expect([...ACTION_KINDS].sort()).toEqual(backend.sort());
    },
  );
});

describe("starterKey", () => {
  it("picks the page's own starters, a course page's over the list's", () => {
    expect(starterKey("/admin")).toBe("home");
    expect(starterKey("/admin/courses")).toBe("courses");
    expect(starterKey("/admin/courses/new")).toBe("courses");
    expect(starterKey("/admin/courses/morning-flow")).toBe("course");
    expect(starterKey("/admin/live")).toBe("events");
    expect(starterKey("/admin/store/bundles/new")).toBe("money");
  });

  it("falls back to the general set on a page with none of its own", () => {
    expect(starterKey("/admin/settings")).toBe("home");
    expect(starterKey("/admin/live-streams")).toBe("home");
  });

  it("has prompts in the messages for every key it can return", () => {
    const starters = (
      adminMessages as { dock: { starters: Record<string, string[]> } }
    ).dock.starters;
    for (const pathname of [
      "/admin",
      "/admin/courses",
      "/admin/courses/x",
      "/admin/live",
      "/admin/blog",
      "/admin/notifications",
      "/admin/students",
      "/admin/payouts",
      "/admin/media",
    ]) {
      const prompts = starters[starterKey(pathname)];
      expect(prompts.length).toBeGreaterThanOrEqual(3);
      expect(prompts.length).toBeLessThanOrEqual(4);
    }
  });
});
