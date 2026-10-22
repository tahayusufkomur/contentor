import { describe, expect, it } from "vitest";

import {
  claimLiveEdit,
  markLiveEdits,
  onEmailEditor,
} from "@/lib/copilot/live-edits";

const EDITOR = "/admin/messages/email/12/edit";

describe("live email edits", () => {
  it("knows the email editor's pages", () => {
    expect(onEmailEditor(EDITOR)).toBe(true);
    expect(onEmailEditor("/admin/messages/email/templates/3")).toBe(true);
    expect(onEmailEditor("/admin/messages/email/12/send")).toBe(false);
    expect(onEmailEditor("/admin/messages/email/new")).toBe(false);
  });

  it("applies a card that arrived in the editor once, and only there", () => {
    markLiveEdits(EDITOR, [
      {
        cards: [
          { token: "t1", kind: "edit_email" },
          { token: "t2", kind: "draft_email" },
        ],
      },
    ]);
    markLiveEdits("/admin/courses", [
      { cards: [{ token: "t3", kind: "edit_email" }] },
    ]);
    expect(claimLiveEdit("t2", EDITOR)).toBe(false);
    expect(claimLiveEdit("t3", EDITOR)).toBe(false);
    expect(claimLiveEdit("t1", "/admin/courses")).toBe(false);
    markLiveEdits(EDITOR, [{ cards: [{ token: "t4", kind: "edit_email" }] }]);
    expect(claimLiveEdit("t4", EDITOR)).toBe(true);
    expect(claimLiveEdit("t4", EDITOR)).toBe(false);
  });
});
