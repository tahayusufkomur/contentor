// Pure view-selectors for the Design-with-AI wizard. Given the React-free
// ChatState (chat-state.ts), derive which wizard step is active, each step's
// stepper status, the candidates to show for the current step, and the running
// "your logo so far" selection. Kept side-effect-free so studio-chat.tsx only
// renders these — and so the branchy step logic stays unit-testable.
import type { ChatState } from "@/lib/logo/chat-state";
import type { ConverseDesign } from "@/lib/logo/composer";

export type WizardStep = "describe" | "icon" | "name" | "tagline";
export type StepStatus = "done" | "current" | "upcoming";

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: "describe", label: "Describe" },
  { id: "icon", label: "Icon" },
  { id: "name", label: "Name" },
  { id: "tagline", label: "Tagline" },
];

const ORDER: WizardStep[] = ["describe", "icon", "name", "tagline"];

/** The step the coach is on. An empty transcript means they haven't described
 * their brand yet, so the Describe step is active; otherwise the backend stage
 * (icon/name/tagline) is the wizard step. */
export function activeStep(state: ChatState): WizardStep {
  return state.messages.length === 0 ? "describe" : state.stage;
}

/** Stepper state for one step. Once the whole flow is done every step reads as
 * done; otherwise it's relative to the active step's position. */
export function stepStatus(state: ChatState, step: WizardStep): StepStatus {
  if (state.done) return "done";
  const current = ORDER.indexOf(activeStep(state));
  const idx = ORDER.indexOf(step);
  if (idx < current) return "done";
  if (idx === current) return "current";
  return "upcoming";
}

/** The latest assistant candidates generated for the CURRENT stage — the only
 * turn the wizard body renders (older turns stay in the transcript purely as
 * backend context). Null while describing or once the flow is done. */
export function currentCandidates(
  state: ChatState,
): { message: string; designs: ConverseDesign[] } | null {
  if (activeStep(state) === "describe" || state.done) return null;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i]!;
    if (
      m.role === "assistant" &&
      m.stage === state.stage &&
      m.designs?.length
    ) {
      return { message: m.text, designs: m.designs };
    }
  }
  return null;
}

/** The running pick shown in "Your logo so far": the name-and-later lockup once
 * one is picked, else the icon once picked, else nothing. */
export function currentSelection(
  state: ChatState,
): { kind: "lockup" | "icon"; design: ConverseDesign } | null {
  if (state.pinnedLockup) return { kind: "lockup", design: state.pinnedLockup };
  if (state.pinnedIcon) return { kind: "icon", design: state.pinnedIcon };
  return null;
}
