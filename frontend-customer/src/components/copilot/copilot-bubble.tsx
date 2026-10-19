"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ImagePlus,
  MessageSquare,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { Spinner } from "@/components/ui/spinner";
import { parseAnswer } from "@/components/admin/assistant/format-answer";
import { useAssistantDock } from "@/lib/assistant-dock";
import {
  createCopilotChat,
  deleteCopilotChat,
  fetchCopilotChat,
  fetchCopilotChats,
  fetchOpenRuns,
  markRunSeen,
  patchCopilotChatEntries,
  startRun,
  stopRun,
} from "@/lib/copilot/api";
import {
  isActive,
  isWatched,
  onRunFinished,
  trackRun,
  unwatchRun,
  useRuns,
  watchRun,
} from "@/lib/copilot/runs";
import { usePathname } from "next/navigation";
import { activeSection, buildAdminNav } from "@/lib/admin-nav";
import { starterKey } from "@/lib/copilot/starters";
import {
  asSpecialist,
  specialistFor,
  type SpecialistKey,
} from "@/lib/copilot/team";
import { markLiveCards } from "@/lib/focus/store";
import {
  pendingEntry,
  reduceChat,
  resolveRun,
  toTranscript,
} from "@/lib/copilot/state";
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
  OpenRun,
  SelectionPayload,
} from "@/lib/copilot/types";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { ActionCard, ApplyAllBar, CardBundleProvider } from "./action-card";
import { CopilotComposer } from "./composer";
import { SelectionOverlay } from "./selection-overlay";
import { OPEN_CHAT_EVENT } from "./runs-watcher";
import { SpecialistByline, SpecialistFace } from "./specialist-face";
import { TeamHeader } from "./team-header";

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

/** One attached-photo chip in a coach bubble. Click toggles between the
 * small thumbnail and a large inline preview ("which photo was that?").
 * Degrades to an icon-and-title chip when the 24h presigned URL has
 * expired or the entry predates thumbnails. */
function AttachedPhotoChip({
  photo,
  fallbackLabel,
}: {
  photo: { id: string; title: string; desc?: string; signed_url?: string };
  fallbackLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [broken, setBroken] = useState(false);
  const label = photo.title || fallbackLabel;
  if (!photo.signed_url || broken) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg border bg-background p-1 pr-2 text-xs text-muted-foreground"
        title={photo.desc || label}
      >
        <ImagePlus className="size-3" aria-hidden />
        {label}
      </span>
    );
  }
  if (expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-expanded="true"
        title={photo.desc || label}
        className="block w-full rounded-lg border bg-background p-1 text-left"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.signed_url}
          alt={photo.desc || label}
          className="max-h-64 w-full rounded-md object-contain"
          onError={() => setBroken(true)}
        />
        <span className="mt-1 block truncate px-1 text-xs text-muted-foreground">
          {photo.desc || label}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      aria-expanded="false"
      title={photo.desc || label}
      className="inline-flex items-center gap-1.5 rounded-lg border bg-background p-1 pr-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.signed_url}
        alt={photo.desc || label}
        className="size-10 rounded-md object-cover"
        onError={() => setBroken(true)}
      />
      {label}
    </button>
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
export function CopilotBubble({ docked = false }: { docked?: boolean }) {
  const t = useTranslations("student.copilot");
  const tAdmin = useTranslations("admin");
  const dock = useAssistantDock();
  const pathname = usePathname();
  // Element-picking only makes sense on the live site the coach can see —
  // in /admin the drawer still works, minus the Select affordance.
  const onSite = !pathname?.startsWith("/admin");
  const [open, setOpen] = useState(docked);
  const [view, setView] = useState<"chat" | "list">("chat");
  const [booted, setBooted] = useState(false);
  const [chats, setChats] = useState<CopilotChatRow[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [selections, setSelections] = useState<SelectionPayload[]>([]);
  const [attached, setAttached] = useState<AttachedPhoto[]>([]);
  // send() can fire in the same tick as the last attach (the post-upload
  // auto-reaction) — before React re-renders, closures still see the old
  // list. The ref is the source of truth; state only drives rendering.
  const attachedRef = useRef<AttachedPhoto[]>([]);
  const updateAttached = useCallback(
    (next: AttachedPhoto[] | ((prev: AttachedPhoto[]) => AttachedPhoto[])) => {
      attachedRef.current =
        typeof next === "function" ? next(attachedRef.current) : next;
      setAttached(attachedRef.current);
    },
    [],
  );
  const [selecting, setSelecting] = useState(false);
  // Her own pick of a specialist holds for this conversation; otherwise the
  // section she is in decides who answers.
  const [picked, setPicked] = useState<SpecialistKey | null>(null);
  const active = picked ?? specialistFor(pathname);
  const sectionLabel = useMemo(
    () =>
      activeSection(buildAdminNav(tAdmin), {
        pathname: pathname ?? "",
        pendingHref: null,
      })?.label ?? "",
    [pathname, tAdmin],
  );
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

  // Bumped whenever the thread on screen is replaced (new chat, another
  // chat opened). A first save still in flight then belongs to the thread
  // she left: adopting its id would make the next save overwrite it.
  const threadRef = useRef(0);

  /** Best-effort server save; a failed save never breaks the live chat. */
  const persist = useCallback((next: ChatEntry[]) => {
    dirtyRef.current = true;
    const thread = threadRef.current;
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
          setChats((prev) => [row, ...prev]);
          if (threadRef.current !== thread) return;
          setChatId(row.id);
        }
        dirtyRef.current = false;
      } catch {
        // Offline or expired session — keep chatting; the pagehide flush or
        // the next turn's save retries.
      }
    })();
  }, []);

  const newChat = useCallback(() => {
    threadRef.current += 1;
    bootStaleRef.current = true;
    setChatId(null);
    setEntries([]);
    setSelections([]);
    updateAttached([]);
    setPicked(null);
    setView("chat");
  }, [updateAttached]);

  const openChat = useCallback(
    async (id: number) => {
      threadRef.current += 1;
      bootStaleRef.current = true;
      const detail = await fetchCopilotChat(id);
      setChatId(detail.id);
      setEntries(detail.entries);
      setSelections([]);
      updateAttached([]);
      setPicked(null);
      setView("chat");
    },
    [updateAttached],
  );

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

  // The page she last spoke from: on arriving at another one the panel offers
  // that page's starters again.
  const [askedOn, setAskedOn] = useState<string | null>(null);

  const { run: send, loading: sending } = useAsyncAction(
    // fresh: the words open a new conversation (the search box's ask row),
    // whatever thread is on screen.
    async (message: string, fresh = false) => {
      const attachedNow = attachedRef.current;
      if (!message && attachedNow.length === 0) return;
      const before = fresh ? [] : entries;
      setAskedOn(pathname);
      const withCoach: ChatEntry[] = [
        ...before,
        {
          role: "coach",
          text: message || t("attachedOnly"),
          ...(attachedNow.length > 0
            ? {
                attached: attachedNow.map((p) => ({
                  id: p.id,
                  title: p.title,
                  ...(p.desc ? { desc: p.desc } : {}),
                  ...(p.signed_url ? { signed_url: p.signed_url } : {}),
                })),
              }
            : {}),
        },
      ];
      setEntries(withCoach);
      const thread = threadRef.current;
      // A fresh conversation (the search box's ask) has no pick yet:
      // newChat() cleared it in this same tick.
      const specialist = fresh ? specialistFor(pathname) : active;
      // The run names the chat it answers in, so "ready for you" can open
      // it: a new chat is saved first.
      let chat = chatIdRef.current;
      if (chat === null) {
        try {
          const row = await createCopilotChat(persistableEntries(withCoach));
          setChats((prev) => [row, ...prev]);
          chat = row.id;
          if (threadRef.current === thread) setChatId(row.id);
        } catch {
          // Server chats unavailable: the run still answers here.
        }
      }
      const started = await startRun({
        message: message || t("attachedOnly"),
        transcript: toTranscript(before),
        selections,
        attached_photos: attachedNow.map((p) => p.id),
        ...(pathname ? { context: { path: pathname } } : {}),
        specialist,
        chat,
      });
      setSelections([]);
      updateAttached([]);
      const next =
        "kind" in started
          ? reduceChat(withCoach, { kind: started.kind })
          : [...withCoach, pendingEntry(started.id, specialist)];
      if (!("kind" in started)) trackRun(started.id, specialist, chat);
      else markLiveCards(pathname, next.slice(-1));
      if (threadRef.current === thread) {
        setEntries(next);
        persist(next);
      } else if (chat !== null) {
        // She opened another thread meanwhile: the reply resumes in its own.
        void patchCopilotChatEntries(chat, persistableEntries(next)).catch(
          () => {},
        );
      }
    },
    { errorToast: t("error") },
  );

  // Every reply still being written: follow its run, and tell the store the
  // panel shows it (no "ready for you" toast for what she is looking at).
  const pendingRuns = useMemo(
    () =>
      entries.flatMap((e) =>
        e.kind === "pending" && e.run
          ? [{ id: e.run, specialist: asSpecialist(e.specialist) }]
          : [],
      ),
    [entries],
  );
  const pendingKey = pendingRuns.map((r) => r.id).join(",");
  useEffect(() => {
    for (const r of pendingRuns) {
      trackRun(r.id, r.specialist, chatIdRef.current);
      watchRun(r.id);
    }
    return () => pendingRuns.forEach((r) => unwatchRun(r.id));
    // Keyed on the ids: a new array with the same runs changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  // Finished work from out of sight that she has not seen yet (the ready line).
  const [ready, setReady] = useState<OpenRun[]>([]);

  // A run that ended takes its pending entry's place.
  const allRuns = useRuns();
  useEffect(() => {
    let next = entries;
    const ended: number[] = [];
    for (const r of pendingRuns) {
      const run = allRuns.get(r.id);
      if (!run || isActive(run.status)) continue;
      next = resolveRun(next, run, {
        stopped: t("stopped"),
        failed: t("failed"),
      });
      ended.push(run.id);
    }
    if (next === entries) return;
    markLiveCards(
      pathname,
      next.filter((e) => e.run && ended.includes(e.run)),
    );
    setEntries(next);
    persist(next);
    ended.forEach((id) => void markRunSeen(id).catch(() => {}));
    setReady((prev) => prev.filter((r) => !ended.includes(r.id)));
  }, [allRuns, entries, pendingRuns, persist, t, pathname]);

  const { run: stop, loading: stopping } = useAsyncAction(
    async (id: number) => {
      await stopRun(id);
      trackRun(id, active);
    },
    { errorToast: t("error") },
  );

  // Work finished in her other chats that she has not seen yet.
  useEffect(() => {
    if (!docked || !open) return;
    let cancelled = false;
    fetchOpenRuns()
      .then(({ runs }) => {
        if (cancelled) return;
        setReady(runs.filter((r) => r.status === "done" && r.chat !== null));
        runs
          .filter((r) => isActive(r.status))
          .forEach((r) => trackRun(r.id, r.specialist, r.chat));
      })
      .catch(() => {});
    const off = onRunFinished((run) => {
      // Only finished work she did not watch land.
      if (run.chat === null || run.status !== "done" || isWatched(run.id))
        return;
      setReady((prev) => [
        ...prev.filter((r) => r.id !== run.id),
        {
          id: run.id,
          status: run.status,
          specialist: run.specialist,
          chat: run.chat,
          summary: run.reply?.text?.slice(0, 160) ?? "",
          finished_at: null,
        },
      ]);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [docked, open]);
  const readyHere = ready.filter(
    (r) => r.chat !== chatId && !pendingRuns.some((p) => p.id === r.id),
  );
  const openReady = useCallback(
    (r: OpenRun) => {
      setReady((prev) => prev.filter((x) => x.id !== r.id));
      void markRunSeen(r.id).catch(() => {});
      if (r.chat !== null) void openChatSafe(r.chat);
    },
    [openChatSafe],
  );

  // The studio's "ready for you" toast asks for a chat by id.
  useEffect(() => {
    const onOpenChat = (event: Event) => {
      const chat = (event as CustomEvent<{ chat?: number }>).detail?.chat;
      if (typeof chat === "number" && chat !== chatIdRef.current) {
        void openChatSafe(chat);
      }
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat);
  }, [openChatSafe]);

  const working = pendingRuns.length > 0;

  // Words handed over by the admin's search box: asked as a new conversation,
  // so a thread still loading (or an older one on screen) is left alone.
  const pendingAsk = docked ? dock.pendingAsk : null;
  const clearAsk = dock.clearAsk;
  // Once per question: React's dev double-run of a mount effect would
  // otherwise start a second new chat and abort the request just sent.
  const askedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingAsk) {
      askedRef.current = null;
      return;
    }
    if (sending || askedRef.current === pendingAsk) return;
    askedRef.current = pendingAsk;
    clearAsk();
    newChat();
    void send(pendingAsk, true);
  }, [pendingAsk, sending, clearAsk, newChat, send]);

  const starters =
    docked && pathname && !sending && !working && askedOn !== pathname
      ? ((picked
          ? tAdmin.raw(`team.starters.${active}`)
          : tAdmin.raw(`dock.starters.${starterKey(pathname)}`)) as string[])
      : [];

  if (!open && !docked) {
    return (
      <Button
        data-copilot-ui
        className="fixed right-5 z-[60] gap-2 rounded-full shadow-lg"
        // Sits at bottom-5 normally; the PWA install banner publishes its
        // occupied height so the launcher rides above it instead of on it.
        style={{ bottom: "calc(var(--install-banner-clearance, 12px) + 8px)" }}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden />
        {t("bubble")}
      </Button>
    );
  }
  if (!open) return null;

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
        className={
          docked
            ? "flex min-h-0 flex-1 flex-col"
            : "fixed right-0 z-[60] flex w-[min(26rem,100vw)] flex-col border-l bg-background shadow-xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200"
        }
        // Floating: the drawer fits between the site chrome (navbar and PWA
        // install banner publish their heights). Docked: the panel sizes it.
        style={
          docked
            ? undefined
            : {
                top: "var(--topnav-clearance, 0px)",
                bottom: "var(--install-banner-clearance, 0px)",
              }
        }
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
            {!docked && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
              >
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </span>
        </div>

        {docked && view === "chat" && (
          <TeamHeader
            active={active}
            picked={picked !== null}
            sectionLabel={sectionLabel}
            onPick={setPicked}
          />
        )}

        {docked && view === "chat" && readyHere.length > 0 && (
          <ul className="space-y-1 border-b px-3 py-2">
            {readyHere.slice(-3).map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-xs">
                <SpecialistFace k={asSpecialist(r.specialist)} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">
                    {tAdmin("team.ready")}
                  </span>{" "}
                  <span className="text-muted-foreground">{r.summary}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => openReady(r)}
                >
                  {tAdmin("team.open")}
                </Button>
              </li>
            ))}
          </ul>
        )}

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
              {entries.length === 0 && !docked && (
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
                    {e.role === "assistant" && (
                      <SpecialistByline k={asSpecialist(e.specialist)} />
                    )}
                    {e.kind === "pending" ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Spinner className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          {t("working", {
                            name: tAdmin(
                              `team.specialists.${asSpecialist(e.specialist)}.name`,
                            ),
                          })}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 px-2"
                          loading={stopping}
                          loadingText={t("stopping")}
                          onClick={() => e.run && stop(e.run)}
                        >
                          {t("stop")}
                        </Button>
                      </span>
                    ) : e.text === "__unavailable__" ? (
                      t("resting")
                    ) : e.role === "assistant" ? (
                      <AssistantText text={e.text} />
                    ) : (
                      e.text
                    )}
                    {e.attached && e.attached.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {e.attached.map((p) => (
                          <AttachedPhotoChip
                            key={p.id}
                            photo={p}
                            fallbackLabel={t("attachedOnly")}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  {e.cards && e.cards.length > 0 && (
                    <CardBundleProvider>
                      {e.cards.map((card, j) => (
                        <ActionCard
                          key={`${i}-${j}`}
                          card={card}
                          askedWith={
                            entries[i - 1]?.role === "coach"
                              ? entries[i - 1].text
                              : undefined
                          }
                        />
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
              {starters.length > 0 && (
                <div data-testid="copilot-starters">
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    {tAdmin("dock.startersTitle")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {starters.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void send(prompt)}
                        className="rounded-full border bg-background px-2.5 py-1 text-left text-xs transition-colors hover:bg-accent"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
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
              placeholder={
                docked
                  ? tAdmin("team.ask", {
                      name: tAdmin(`team.specialists.${active}.name`),
                    })
                  : undefined
              }
              onSend={send}
              sending={sending}
              waiting={working}
              attached={attached}
              onAttach={(p) => updateAttached((prev) => [...prev, p])}
              onRemoveAttachment={(id) =>
                updateAttached((prev) => prev.filter((p) => p.id !== id))
              }
            />
          </>
        )}
      </div>
    </>
  );
}
