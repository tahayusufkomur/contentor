// Pure state machine for the Design-with-AI chat. React-free so the stage /
// pin / status transitions are unit-testable; studio-chat.tsx renders it.
import type { ChatStage } from "@/lib/logo/converse-api";
import type { ConverseDesign } from "@/lib/logo/composer";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  designs?: ConverseDesign[];
}

export interface ChatState {
  stage: ChatStage;
  messages: ChatMessage[];
  pinnedIcon: ConverseDesign | null;
  pinnedLockup: ConverseDesign | null;
  status: "idle" | "designing" | "reviewing";
  done: boolean;
}

export const initialChatState: ChatState = {
  stage: "icon",
  messages: [],
  pinnedIcon: null,
  pinnedLockup: null,
  status: "idle",
  done: false,
};

export type ChatEvent =
  | { type: "user_message"; text: string }
  | { type: "draft_received" }
  | { type: "final_received"; message: string; designs: ConverseDesign[] }
  | { type: "turn_failed"; notice: string }
  | { type: "pin"; design: ConverseDesign }
  | { type: "skip_tagline" }
  | { type: "back"; stage: ChatStage };

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "user_message":
      return {
        ...state,
        status: "designing",
        messages: [...state.messages, { role: "user", text: event.text }],
      };
    case "draft_received":
      return { ...state, status: "reviewing" };
    case "final_received":
      return {
        ...state,
        status: "idle",
        messages: [
          ...state.messages,
          { role: "assistant", text: event.message, designs: event.designs },
        ],
      };
    case "turn_failed":
      return {
        ...state,
        status: "idle",
        messages: [
          ...state.messages,
          { role: "assistant", text: event.notice },
        ],
      };
    case "pin":
      if (state.stage === "icon")
        return { ...state, stage: "name", pinnedIcon: event.design };
      if (state.stage === "name")
        return { ...state, stage: "tagline", pinnedLockup: event.design };
      return { ...state, pinnedLockup: event.design, done: true };
    case "skip_tagline":
      return { ...state, done: true };
    case "back":
      if (event.stage === "icon")
        return {
          ...state,
          stage: "icon",
          pinnedIcon: null,
          pinnedLockup: null,
          done: false,
        };
      if (event.stage === "name")
        return { ...state, stage: "name", pinnedLockup: null, done: false };
      return { ...state, stage: "tagline", done: false };
  }
}
