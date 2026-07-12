// Refresh-safe Logo Studio session: brief, chosen AI pack, and the editor
// draft survive a reload/tab-close. Follows the lib/cart.ts localStorage
// pattern (per-origin key, typeof window guard, try/catch everywhere), but
// stricter: writes are guarded too, since a corrupted or full localStorage
// must never break the studio. See
// docs/superpowers/plans/2026-07-10-logo-studio-session-undo-refine.md.
import type {
  BrandPackElement,
  Brief,
  ConverseDesign,
} from "@/lib/logo/composer";
import type { ChatMessage } from "@/lib/logo/chat-state";
import type { ChatStage } from "@/lib/logo/converse-api";
import type { LogoRecipe } from "@/types/logo";

const STORAGE_KEY = "contentor_logo_studio";
const SCHEMA_VERSION = 3;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type StudioStep = "brief" | "ideas" | "editor";

/** The Design-with-AI chat's persisted slice — the staged transcript plus the
 * pinned icon / lockup the coach has converged on so a reload lands back in
 * mid-conversation. Only present in v2 sessions (null on a restored v1). */
export interface StudioChatSession {
  stage: ChatStage;
  messages: ChatMessage[];
  pinnedIcon: ConverseDesign | null;
  pinnedLockup: ConverseDesign | null;
}

export interface StudioSession {
  v: 1 | 2 | 3;
  savedAt: number;
  step: StudioStep;
  brief: Brief;
  /** The editor's current draft, or null if the coach hasn't reached the
   * editor yet this session. */
  recipe: LogoRecipe | null;
  /** The editor draft's mark's source elements, if it came from an AI pack
   * mark and hasn't since been mark-swapped — fed to logo-refine/ so a
   * refinement redesigns from the same geometry it started with. */
  elements: BrandPackElement[] | null;
  /** The Design-with-AI chat slice (schema v2). Null when the coach hasn't
   * opened the chat, or when a legacy v1 session is restored. */
  chat: StudioChatSession | null;
}

function isStudioStep(value: unknown): value is StudioStep {
  return value === "brief" || value === "ideas" || value === "editor";
}

export function loadStudioSession(): StudioSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioSession>;
    // A v1 payload still loads (its chat slice is simply absent — the coach
    // resumes at the wall/editor, minus any in-progress chat).
    if (parsed.v !== 1 && parsed.v !== 2 && parsed.v !== 3) return null;
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      return null;
    }
    if (!isStudioStep(parsed.step)) return null;
    if (!parsed.brief) return null;
    return {
      v: parsed.v,
      savedAt: parsed.savedAt,
      step: parsed.step,
      brief: parsed.brief,
      recipe: parsed.recipe ?? null,
      elements: parsed.elements ?? null,
      chat: parsed.v >= 2 ? (parsed.chat ?? null) : null,
    };
  } catch {
    return null;
  }
}

export function saveStudioSession(
  session: Omit<StudioSession, "v" | "savedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StudioSession = {
      ...session,
      v: SCHEMA_VERSION,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage disabled, full, or private-mode-restricted — session
    // persistence degrades to "no restore," never breaks the studio.
  }
}

export function clearStudioSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
