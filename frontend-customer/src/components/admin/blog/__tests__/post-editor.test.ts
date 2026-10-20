import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { Toolbar } from "@/components/admin/blog/post-editor";

/** Only what the toolbar reads while it renders. */
const editor = { isActive: () => false } as unknown as Editor;
const buttons = (disabled: boolean) =>
  renderToStaticMarkup(createElement(Toolbar, { editor, disabled })).match(
    /<button[^>]*>/g,
  ) ?? [];

describe("the post editor's toolbar", () => {
  it("is off while the post is being written for her", () => {
    expect(buttons(true)).toHaveLength(6);
    for (const button of buttons(true)) expect(button).toContain('disabled=""');
  });

  it("is on for her edits", () => {
    for (const button of buttons(false))
      expect(button).not.toContain('disabled=""');
  });
});
