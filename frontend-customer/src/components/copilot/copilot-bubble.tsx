"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  MessageSquare,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { parseAnswer } from "@/components/admin/assistant/format-answer";
import { isAbortError } from "@/lib/ai-stream";
import {
  converseCopilot,
  createCopilotChat,
  deleteCopilotChat,
  fetchCopilotChat,
  fetchCopilotChats,
  patchCopilotChatEntries,
} from "@/lib/copilot/api";
import { usePathname } from "next/navigation";
import { reduceChat, toTranscript } from "@/lib/copilot/state";
import {
  loadUiState,
  persistableEntries,
  saveUiState,
  takeLegacyEntries,
} from "@/lib/copilot/storage";
import type {
  AttachedPhoto,
  ChatEntry,
  CopilotChatRow,
  SelectionPayload,
} from "@/lib/copilot/types";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { ActionCard, ApplyAllBar, CardBundleProvider } from "./action-card";
import { CopilotComposer } from "./composer";
import { SelectionOverlay } from "./selection-overlay";

/** Assistant text with the markdown-lite link contract: `[label](/path)`
 * links are stripped from the prose and rendered as tappable chips, so a
 * coach never sees a raw path (same contract as help-chat's AnswerBody). */
function AssistantText({ text }: { text: string }) {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const { text: prose, links } = parseAnswer(text, origin);
  return (
    <>
      {prose}
      {links.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1">
          {links.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              className="rounded-full border px-2 py-0.5 text-xs font-medium text-primary"
            >
              {l.label}
            </NavLink>
          ))}
        </span>
      )}
    </>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** The coach's AI side panel. Mounted (public layout) only for the coach;
 * the backend re-verifies on every call. `?copilot=1` opens it. Chats live
 * server-side (CopilotChat); the old localStorage transcript is imported as
 * the first chat on first open. */
export function CopilotBubble() {
  const t = useTranslations("student.copilot");
  const pathname = usePathname();
  // Element-picking only makes sense on the live site the coach can see —
  // in /admin the drawer still works, minus the Select affordance.
  const onSite = !pathname?.startsWith("/admin");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "list">("chat");
  const [booted, setBooted] = useState(false);
  const [chats, setChats] = useState<CopilotChatRow[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [selections, setSelections] = useState<SelectionPayload[]>([]);
  const [attached, setAttached] = useState<AttachedPhoto[]>([]);
  const [selecting, setSelecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chatIdRef = useRef<number | null>(null);
  chatIdRef.current = chatId;

  useEffect(() => {
    // window.location, NOT useSearchParams — avoids the Next 14 client-side
    // Suspense bailout (same pattern as owner/edit-sidebar.tsx).
    const params = new URLSearchParams(window.location.search);
    // The drawer reopens where the coach left it — crossing site ↔ admin
    // remounts this component under the other layout, so position rides
    // localStorage, content rides the server.
    if (params.get("copilot") === "1" || loadUiState().open) setOpen(true);
  }, []);

  // Remember open/collapsed + active chat across navigations.
  useEffect(() => {
    saveUiState({ open, chatId });
  }, [open, chatId]);

  // Boot on first open, not at mount: no chat API traffic for coaches who
  // never touch the copilot on this page view. If the coach acts before the
  // fetches land (clicks New chat / opens a thread), boot must NOT apply its
  // late result over their choice — bootStaleRef guards the clobber.
  const bootStaleRef = useRef(false);
  useEffect(() => {
    if (!open || booted) return;
    setBooted(true);
    void (async () => {
      try {
        const legacy = takeLegacyEntries();
        if (legacy.length > 0) await createCopilotChat(legacy);
        const { chats: rows } = await fetchCopilotChats();
        setChats(rows);
        const storedId = loadUiState().chatId;
        const target =
          rows.find((c) => c.id === storedId) ??
          (rows.length > 0 ? rows[0] : null);
        if (target && !bootStaleRef.current) {
          const detail = await fetchCopilotChat(target.id);
          if (!bootStaleRef.current) {
            setChatId(detail.id);
            setEntries(detail.entries);
          }
        }
      } catch {
        // Server chats unavailable — the drawer still works as a fresh chat.
      }
    })();
  }, [open, booted]);

  // A hard unload (tab close, full navigation) can race the fire-and-forget
  // save — flush any unsaved turn with a keepalive request that outlives the
  // page. PATCH-only: a create here would race persist()'s own POST and
  // duplicate the thread; an existing chat's PATCH is idempotent. (The one
  // uncovered edge — closing the tab mid-first-turn of a brand-new chat —
  // loses that single turn, which beats duplicate chats.)
  const entriesRef = useRef<ChatEntry[]>([]);
  entriesRef.current = entries;
  const dirtyRef = useRef(false);
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current || chatIdRef.current === null) return;
      const persistable = persistableEntries(entriesRef.current);
      if (persistable.length === 0) return;
      void fetch(`/api/v1/admin/copilot/chats/${chatIdRef.current}/`, {
        method: "PATCH",
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: persistable }),
      });
      dirtyRef.current = false;
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  /** Best-effort server save; a failed save never breaks the live chat. */
  const persist = useCallback((next: ChatEntry[]) => {
    dirtyRef.current = true;
    void (async () => {
      try {
        const persistable = persistableEntries(next);
        if (chatIdRef.current !== null) {
          const row = await patchCopilotChatEntries(
            chatIdRef.current,
            persistable,
          );
          setChats((prev) => [row, ...prev.filter((c) => c.id !== row.id)]);
        } else if (persistable.length > 0) {
          const row = await createCopilotChat(persistable);
          setChatId(row.id);
          setChats((prev) => [row, ...prev]);
        }
        dirtyRef.current = false;
      } catch {
        // Offline or expired session — keep chatting; the pagehide flush or
        // the next turn's save retries.
      }
    })();
  }, []);

  const newChat = useCallback(() => {
    bootStaleRef.current = true;
    abortRef.current?.abort();
    setChatId(null);
    setEntries([]);
    setSelections([]);
    setAttached([]);
    setView("chat");
  }, []);

  const openChat = useCallback(async (id: number) => {
    bootStaleRef.current = true;
    abortRef.current?.abort();
    const detail = await fetchCopilotChat(id);
    setChatId(detail.id);
    setEntries(detail.entries);
    setSelections([]);
    setAttached([]);
    setView("chat");
  }, []);

  const { run: openChatSafe } = useAsyncAction(openChat, {
    errorToast: t("error"),
  });

  const showList = useCallback(async () => {
    setView("list");
    try {
      const { chats: rows } = await fetchCopilotChats();
      setChats(rows);
    } catch {
      // Stale local list still renders.
    }
  }, []);

  const { run: removeChat } = useAsyncAction(
    async (id: number) => {
      await deleteCopilotChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (chatIdRef.current === id) {
        setChatId(null);
        setEntries([]);
      }
    },
    { errorToast: t("error") },
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries, view]);

  const addSelection = useCallback((p: SelectionPayload) => {
    setSelections((prev) => [...prev, p].slice(-5));
    setOpen(true);
    setView("chat");
  }, []);

  const { run: send, loading: sending } = useAsyncAction(
    async (message: string) => {
      if (!message && attached.length === 0) return;
      const withCoach: ChatEntry[] = [
        ...entries,
        { role: "coach", text: message || t("attachedOnly") },
      ];
      setEntries(withCoach);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const done = await converseCopilot(
          {
            message: message || t("attachedOnly"),
            transcript: toTranscript(entries),
            selections,
            attached_photos: attached.map((p) => p.id),
          },
          { onPhase: () => {} },
          controller.signal,
        );
        const next = reduceChat(withCoach, done);
        setEntries(next);
        setSelections([]);
        setAttached([]);
        persist(next);
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    { errorToast: t("error") },
  );

  if (!open) {
    return (
      <Button
        data-copilot-ui
        className="fixed bottom-5 right-5 z-[60] gap-2 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden />
        {t("bubble")}
      </Button>
    );
  }

  return (
    <>
      {selecting && onSite && (
        <SelectionOverlay
          onSelect={addSelection}
          onExit={() => setSelecting(false)}
        />
      )}
      <div
        data-copilot-ui
        className="fixed inset-y-0 right-0 z-[60] flex w-[min(26rem,100vw)] flex-col border-l bg-background shadow-xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200"
      >
        <div className="flex items-center justify-between border-b p-3">
          <span className="flex min-w-0 items-center gap-1">
            {view === "chat" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={showList}
                aria-label={t("chats")}
                title={t("chats")}
              >
                <ChevronLeft className="size-4" aria-hidden />
                <MessageSquare className="size-4" aria-hidden />
              </Button>
            ) : (
              <p className="px-1 text-sm font-semibold">{t("chats")}</p>
            )}
            {view === "chat" && (
              <p className="truncate text-sm font-semibold">
                {chats.find((c) => c.id === chatId)?.title || t("title")}
              </p>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={newChat}
              aria-label={t("newChat")}
              title={t("newChat")}
            >
              <SquarePen className="size-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </span>
        </div>

        {view === "list" ? (
          <div className="flex-1 overflow-y-auto p-2">
            {chats.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">
                {t("noChats")}
              </p>
            )}
            {chats.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-lg p-2 hover:bg-accent ${
                  c.id === chatId ? "bg-accent/60" : ""
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col text-left"
                  onClick={() => openChatSafe(c.id)}
                >
                  <span className="truncate text-sm">
                    {c.title || t("untitledChat")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(c.updated_at)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("deleteChat")}
                  title={t("deleteChat")}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                  onClick={() => removeChat(c.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto p-3 text-sm"
            >
              {entries.length === 0 && (
                <p className="text-muted-foreground">{t("empty")}</p>
              )}
              {entries.map((e, i) => (
                <div key={i}>
                  <div
                    className={
                      e.role === "coach"
                        ? "ml-8 whitespace-pre-wrap rounded-lg bg-primary/10 p-2"
                        : "mr-8 rounded-lg bg-muted p-2"
                    }
                  >
                    {e.text === "__unavailable__" ? (
                      t("resting")
                    ) : e.role === "assistant" ? (
                      <AssistantText text={e.text} />
                    ) : (
                      e.text
                    )}
                  </div>
                  {e.cards && e.cards.length > 0 && (
                    <CardBundleProvider>
                      {e.cards.map((card, j) => (
                        <ActionCard key={`${i}-${j}`} card={card} />
                      ))}
                      {e.cards.length > 1 && (
                        <div className="mt-2">
                          <ApplyAllBar />
                        </div>
                      )}
                    </CardBundleProvider>
                  )}
                </div>
              ))}
              {sending && (
                <p className="text-muted-foreground">{t("thinking")}</p>
              )}
            </div>
            {selections.length > 0 && (
              <div className="flex flex-wrap gap-1 border-t p-2">
                {selections.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                    onClick={() =>
                      setSelections((prev) => prev.filter((_, j) => j !== i))
                    }
                    title={t("removeSelection")}
                  >
                    {s.block_id ?? s.tag}: {s.text.slice(0, 24)} ✕
                  </button>
                ))}
              </div>
            )}
            {onSite && (
              <div className="flex items-center gap-2 px-3 pt-2">
                <Button
                  size="sm"
                  variant={selecting ? "brand" : "outline"}
                  onClick={() => setSelecting((v) => !v)}
                >
                  {t("select")}
                </Button>
              </div>
            )}
            <CopilotComposer
              onSend={send}
              sending={sending}
              attached={attached}
              onAttach={(p) => setAttached((prev) => [...prev, p])}
              onRemoveAttachment={(id) =>
                setAttached((prev) => prev.filter((p) => p.id !== id))
              }
            />
          </>
        )}
      </div>
    </>
  );
}
