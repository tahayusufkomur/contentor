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

  it("disallows undo for create/edit/publish/draft kinds (empty inverse server-side)", () => {
    expect(isUndoableKind("create_course")).toBe(false);
    expect(isUndoableKind("create_event")).toBe(false);
    expect(isUndoableKind("create_blog_post")).toBe(false);
    expect(isUndoableKind("edit_course")).toBe(false);
    expect(isUndoableKind("edit_event")).toBe(false);
    expect(isUndoableKind("edit_blog_post")).toBe(false);
    expect(isUndoableKind("publish_course")).toBe(false);
    expect(isUndoableKind("publish_blog_post")).toBe(false);
    expect(isUndoableKind("draft_announcement")).toBe(false);
  });
});

describe("runBundle", () => {
  it("runs confirms in order and stops on failure", async () => {
    const calls: string[] = [];
    const ok = (id: string) => async () => {
      calls.push(id);
    };
    const fail = async () => {
      throw new Error("nope");
    };
    const result = await runBundle([ok("a"), ok("b"), fail, ok("d")]);
    expect(calls).toEqual(["a", "b"]);
    expect(result).toEqual({ done: 2, failed: true });
  });

  it("reports done count with no failures", async () => {
    const calls: string[] = [];
    const ok = (id: string) => async () => {
      calls.push(id);
    };
    const result = await runBundle([ok("a"), ok("b")]);
    expect(calls).toEqual(["a", "b"]);
    expect(result).toEqual({ done: 2, failed: false });
  });

  // Integration seam: what gets registered into the bundle registry MUST be
  // able to reject, or runBundle's stop-on-failure branch is dead code in
  // real wiring. `useAsyncAction`'s `run` (createAsyncRunner) swallows every
  // error — it only ever invokes onError, never re-throws — so registering
  // that (the OLD, buggy wiring) makes a failing mid-bundle action look
  // identical to a successful one from runBundle's point of view: the loop
  // never sees a rejection, so it walks through every remaining action
  // (contract violation) and reports failed:false (false "Applied N
  // changes" toast). Registering the raw throwing body (the fix) restores
  // stop-on-failure. These two cases pin exactly that distinction.
  it("over swallowing async-runner wrappers (OLD wiring): does not stop, reports success", async () => {
    const calls: string[] = [];
    const makeSwallowingConfirm = (id: string, shouldThrow: boolean) => {
      let loading = false;
      const run = createAsyncRunner(
        async () => {
          calls.push(id);
          if (shouldThrow) throw new Error("nope");
        },
        { setLoading: (v) => (loading = v) },
      );
      void loading;
      return run;
    };
    const confirms = [
      makeSwallowingConfirm("a", false),
      makeSwallowingConfirm("b", true), // fails, but the wrapper swallows it
      makeSwallowingConfirm("c", false),
    ];
    const result = await runBundle(confirms);
    // Every action ran, including "c" after "b" failed — proves the bundle
    // did NOT stop, which is exactly the contract violation Finding 1 flags.
    expect(calls).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ done: 3, failed: false });
  });

  it("over raw throwing confirms (the fix): stops at the first failure", async () => {
    const calls: string[] = [];
    const makeRawConfirm = (id: string, shouldThrow: boolean) => async () => {
      calls.push(id);
      if (shouldThrow) throw new Error("nope");
    };
    const confirms = [
      makeRawConfirm("a", false),
      makeRawConfirm("b", true),
      makeRawConfirm("c", false),
    ];
    const result = await runBundle(confirms);
    // "c" never ran — the bundle stopped as soon as "b" rejected.
    expect(calls).toEqual(["a", "b"]);
    expect(result).toEqual({ done: 1, failed: true });
  });
});
