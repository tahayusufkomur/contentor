import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "@/lib/logo/chat-state";

const design = {
  concept: "c",
  rationale: "r",
  paths: [],
  palette: {
    name: "",
    primary: "#111111",
    secondary: "#222222",
    accent: "#333333",
    ink: "#000000",
  },
  color_roles: { mark: "primary", mark2: "secondary", mark_accent: "accent" },
} as never;

describe("chatReducer", () => {
  it("starts at the icon stage, idle", () => {
    expect(initialChatState.stage).toBe("icon");
    expect(initialChatState.status).toBe("idle");
  });

  it("user_message appends and enters designing; draft_received enters reviewing", () => {
    let s = chatReducer(initialChatState, { type: "user_message", text: "hi" });
    expect(s.messages.at(-1)).toEqual({ role: "user", text: "hi" });
    expect(s.status).toBe("designing");
    s = chatReducer(s, { type: "draft_received" });
    expect(s.status).toBe("reviewing");
  });

  it("final_received appends the assistant turn with designs and idles", () => {
    let s = chatReducer(initialChatState, { type: "user_message", text: "hi" });
    s = chatReducer(s, {
      type: "final_received",
      message: "here",
      designs: [design],
    });
    expect(s.status).toBe("idle");
    expect(s.messages.at(-1)?.designs).toHaveLength(1);
  });

  it("pin on icon advances to name; pin on name advances to tagline; pin on tagline finishes", () => {
    let s = chatReducer(initialChatState, { type: "pin", design });
    expect(s.stage).toBe("name");
    expect(s.pinnedIcon).toBe(design);
    s = chatReducer(s, { type: "pin", design });
    expect(s.stage).toBe("tagline");
    expect(s.pinnedLockup).toBe(design);
    s = chatReducer(s, { type: "pin", design });
    expect(s.done).toBe(true);
  });

  it("use_brief_tagline finishes with the brief's tagline applied to the pinned lockup", () => {
    let s = chatReducer(initialChatState, { type: "pin", design });
    s = chatReducer(s, { type: "pin", design });
    s = chatReducer(s, {
      type: "use_brief_tagline",
      tagline: "Move every day",
    });
    expect(s.done).toBe(true);
    expect(s.pinnedLockup).toEqual({ ...design, tagline: "Move every day" });
  });

  it("back to icon clears later pins", () => {
    let s = chatReducer(initialChatState, { type: "pin", design });
    s = chatReducer(s, { type: "pin", design });
    s = chatReducer(s, { type: "back", stage: "icon" });
    expect(s.stage).toBe("icon");
    expect(s.pinnedIcon).toBeNull();
    expect(s.pinnedLockup).toBeNull();
  });

  it("turn_failed returns to idle with an assistant notice", () => {
    let s = chatReducer(initialChatState, { type: "user_message", text: "hi" });
    s = chatReducer(s, {
      type: "turn_failed",
      notice: "Couldn't reach the studio.",
    });
    expect(s.status).toBe("idle");
    expect(s.messages.at(-1)?.text).toContain("Couldn't");
  });
});
