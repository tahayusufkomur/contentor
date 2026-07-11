import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "@/lib/logo/chat-state";
import type { ChatState } from "@/lib/logo/chat-state";
import {
  activeStep,
  currentCandidates,
  currentSelection,
  stepStatus,
} from "@/lib/logo/wizard-view";

const design = (concept: string) =>
  ({
    concept,
    rationale: `why ${concept}`,
    paths: [],
    palette: {
      name: "",
      primary: "#111111",
      secondary: "#222222",
      accent: "#333333",
      ink: "#000000",
    },
    color_roles: { mark: "primary", mark2: "secondary", mark_accent: "accent" },
  }) as never;

/** Drive the real reducer to a mid-flow state: describe -> icon turn -> pick. */
function afterIconTurn(): ChatState {
  let s = chatReducer(initialChatState, {
    type: "user_message",
    text: "calm yoga",
  });
  s = chatReducer(s, {
    type: "final_received",
    message: "Here are some icons.",
    designs: [design("leaf"), design("sun")],
  });
  return s;
}

describe("activeStep", () => {
  it("is describe while the transcript is empty", () => {
    expect(activeStep(initialChatState)).toBe("describe");
  });

  it("follows the backend stage once the coach has described", () => {
    expect(activeStep(afterIconTurn())).toBe("icon");
  });
});

describe("stepStatus", () => {
  it("marks describe current and the rest upcoming at the start", () => {
    expect(stepStatus(initialChatState, "describe")).toBe("current");
    expect(stepStatus(initialChatState, "icon")).toBe("upcoming");
    expect(stepStatus(initialChatState, "tagline")).toBe("upcoming");
  });

  it("marks passed steps done and the active stage current", () => {
    const s = afterIconTurn();
    expect(stepStatus(s, "describe")).toBe("done");
    expect(stepStatus(s, "icon")).toBe("current");
    expect(stepStatus(s, "name")).toBe("upcoming");
  });

  it("marks every step done once the flow completes", () => {
    let s = afterIconTurn();
    s = chatReducer(s, { type: "pin", design: design("leaf") }); // -> name
    s = chatReducer(s, {
      type: "final_received",
      message: "Names.",
      designs: [design("wordmark")],
    });
    s = chatReducer(s, { type: "pin", design: design("wordmark") }); // -> tagline
    s = chatReducer(s, { type: "skip_tagline" }); // done
    for (const step of ["describe", "icon", "name", "tagline"] as const) {
      expect(stepStatus(s, step)).toBe("done");
    }
  });
});

describe("currentCandidates", () => {
  it("is null while describing", () => {
    expect(currentCandidates(initialChatState)).toBeNull();
  });

  it("returns the latest assistant turn for the current stage", () => {
    const s = afterIconTurn();
    const cand = currentCandidates(s);
    expect(cand?.message).toBe("Here are some icons.");
    expect(cand?.designs.map((d) => d.concept)).toEqual(["leaf", "sun"]);
  });

  it("ignores turns from an earlier stage after advancing", () => {
    let s = afterIconTurn();
    s = chatReducer(s, { type: "pin", design: design("leaf") }); // stage -> name, no name turn yet
    expect(currentCandidates(s)).toBeNull();
  });

  it("prefers the freshest turn when the coach asks for different options", () => {
    let s = afterIconTurn();
    s = chatReducer(s, { type: "user_message", text: "more geometric" });
    s = chatReducer(s, {
      type: "final_received",
      message: "Fresh icons.",
      designs: [design("hexagon")],
    });
    expect(currentCandidates(s)?.message).toBe("Fresh icons.");
  });
});

describe("currentSelection", () => {
  it("is null before anything is pinned", () => {
    expect(currentSelection(initialChatState)).toBeNull();
  });

  it("shows the icon after the icon step, then upgrades to the lockup", () => {
    let s = afterIconTurn();
    s = chatReducer(s, { type: "pin", design: design("leaf") });
    expect(currentSelection(s)).toEqual({
      kind: "icon",
      design: design("leaf"),
    });
    s = chatReducer(s, {
      type: "final_received",
      message: "Names.",
      designs: [design("wordmark")],
    });
    s = chatReducer(s, { type: "pin", design: design("wordmark") });
    expect(currentSelection(s)).toEqual({
      kind: "lockup",
      design: design("wordmark"),
    });
  });
});
