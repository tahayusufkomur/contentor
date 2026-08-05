import { describe, expect, it } from "vitest";
import { buildSelectionPayload } from "@/lib/copilot/selection";
import { isCreateKind, reduceChat, toTranscript } from "@/lib/copilot/state";
import type { ChatEntry } from "@/lib/copilot/types";

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
