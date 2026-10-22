import { describe, expect, it } from "vitest";

import { EmailEditor, blankDesign as publicBlank } from "@shared/email/editor";
import { blankDesign, createBlock } from "@shared/email/editor/factory";
import {
  editorReducer,
  initEditorState,
  type EditorState,
} from "@shared/email/editor/store";
import { findBlock } from "@shared/email/editor/tree";
import type { HeadingBlock } from "@shared/email/editor/types";

function withHeading() {
  const heading = createBlock("heading") as HeadingBlock;
  const state = editorReducer(initEditorState(blankDesign()), {
    type: "insert",
    block: heading,
    target: { region: "body" },
  });
  return { state, heading };
}

const textOf = (s: EditorState, id: string) => {
  const b = findBlock(s.design, id);
  return b?.type === "heading" ? b.data.text : null;
};

describe("email editor store", () => {
  it("exports the editor component", () => {
    expect(typeof EmailEditor).toBe("function");
    expect(publicBlank().footer.blocks[0].type).toBe("brandFooter");
  });

  it("inserting selects the new block and is one undo step", () => {
    const { state, heading } = withHeading();
    expect(state.selectedId).toBe(heading.id);
    expect(state.past).toHaveLength(1);
    const undone = editorReducer(state, { type: "undo" });
    expect(undone.design.body.blocks).toEqual([]);
    expect(undone.selectedId).toBeNull();
    const redone = editorReducer(undone, { type: "redo" });
    expect(redone.design.body.blocks[0].id).toBe(heading.id);
  });

  it("folds fast typing in one field into one undo step", () => {
    const { state, heading } = withHeading();
    let s = state;
    for (const [i, text] of ["H", "He", "Hey"].entries()) {
      s = editorReducer(s, {
        type: "update",
        id: heading.id,
        patch: { data: { text } },
        at: 1000 + i * 100,
      });
    }
    expect(textOf(s, heading.id)).toBe("Hey");
    expect(s.past).toHaveLength(2); // the insert + one typing step
    const undone = editorReducer(s, { type: "undo" });
    expect(textOf(undone, heading.id)).toBe(heading.data.text);

    // A pause, or another field, starts a new step.
    const later = editorReducer(s, {
      type: "update",
      id: heading.id,
      patch: { data: { text: "Hey!" } },
      at: 5000,
    });
    expect(later.past).toHaveLength(3);
    const other = editorReducer(s, {
      type: "update",
      id: heading.id,
      patch: { style: { fontSize: 40 } },
      at: 1250,
    });
    expect(other.past).toHaveLength(3);
  });

  it("sync replaces the design as one undoable step and keeps a still-present selection", () => {
    const { state, heading } = withHeading();
    const outside = {
      ...state.design,
      body: { blocks: [...state.design.body.blocks, createBlock("text")] },
    };
    const synced = editorReducer(state, { type: "sync", design: outside });
    expect(synced.design).toBe(outside);
    expect(synced.selectedId).toBe(heading.id);
    expect(editorReducer(synced, { type: "undo" }).design).toBe(state.design);

    const gone = editorReducer(state, { type: "sync", design: blankDesign() });
    expect(gone.selectedId).toBeNull();
  });

  it("remove drops the selection, duplicate selects the copy", () => {
    const { state, heading } = withHeading();
    const copy = editorReducer(state, { type: "duplicate", id: heading.id });
    expect(copy.design.body.blocks).toHaveLength(2);
    expect(copy.selectedId).toBe(copy.design.body.blocks[1].id);
    const removed = editorReducer(state, { type: "remove", id: heading.id });
    expect(removed.selectedId).toBeNull();
    expect(removed.design.body.blocks).toEqual([]);
  });

  it("settings changes coalesce like typing", () => {
    const s0 = initEditorState(blankDesign());
    const s1 = editorReducer(s0, {
      type: "settings",
      patch: { contentWidth: 610 },
      at: 10,
    });
    const s2 = editorReducer(s1, {
      type: "settings",
      patch: { contentWidth: 620 },
      at: 200,
    });
    expect(s2.design.settings.contentWidth).toBe(620);
    expect(s2.past).toHaveLength(1);
  });
});
