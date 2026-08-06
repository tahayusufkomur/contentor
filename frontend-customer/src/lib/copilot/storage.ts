import type { ChatEntry } from "./types";

/** localStorage is origin-scoped, and every tenant lives on its own
 * subdomain — so one constant key is already per-tenant. */
const KEY = "copilot:transcript:v1";

export const PERSIST_MAX = 30;

/** What survives a reload: the last PERSIST_MAX prose entries. Action cards
 * are dropped — their Confirm buttons hold single-use short-TTL tokens that
 * would 403 after a reload, and a dead Apply button reads as a bug. */
export function persistableEntries(entries: ChatEntry[]): ChatEntry[] {
  return entries
    .slice(-PERSIST_MAX)
    .map(({ role, text, kind }) =>
      kind ? { role, text, kind } : { role, text },
    );
}

function isEntry(e: unknown): e is ChatEntry {
  if (typeof e !== "object" || e === null) return false;
  const entry = e as Record<string, unknown>;
  return (
    (entry.role === "coach" || entry.role === "assistant") &&
    typeof entry.text === "string"
  );
}

export function loadEntries(): ChatEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function saveEntries(entries: ChatEntry[]): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(persistableEntries(entries)),
    );
  } catch {
    // Storage full or blocked — the chat still works, it just won't persist.
  }
}

export function clearEntries(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Same: never let storage break the widget.
  }
}

/** One-time migration to server-side chats: hand over whatever the old
 * localStorage transcript held and clear it, so the pre-drawer history
 * becomes the coach's first server chat instead of silently vanishing. */
export function takeLegacyEntries(): ChatEntry[] {
  const entries = loadEntries();
  if (entries.length > 0) clearEntries();
  return entries;
}

/** Drawer UI state that survives navigation (site ↔ admin cross layouts, so
 * the component remounts): whether the coach left the panel open, and which
 * chat they were in. Chat CONTENT lives server-side; this is just position. */
const UI_KEY = "copilot:ui:v1";

export interface CopilotUiState {
  open: boolean;
  chatId: number | null;
}

export function loadUiState(): CopilotUiState {
  try {
    const raw = window.localStorage.getItem(UI_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== "object" || parsed === null) {
      return { open: false, chatId: null };
    }
    const state = parsed as Record<string, unknown>;
    return {
      open: state.open === true,
      chatId: typeof state.chatId === "number" ? state.chatId : null,
    };
  } catch {
    return { open: false, chatId: null };
  }
}

export function saveUiState(state: CopilotUiState): void {
  try {
    window.localStorage.setItem(UI_KEY, JSON.stringify(state));
  } catch {
    // Never let storage break the widget.
  }
}
