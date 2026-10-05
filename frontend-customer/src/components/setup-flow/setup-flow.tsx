"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { executeCopilotAction, undoCopilotAction } from "@/lib/copilot/api";
import { isUndoableKind, runBundle } from "@/lib/copilot/state";
import { landedPage, noteEntry, toEntry } from "@/lib/interview";
import {
  setupFlowApi,
  type CopilotPayload,
  type GuideTurn,
  type InterviewEntry,
  type SetupFlowApi,
  type SetupFlowState,
  type TurnRequest,
} from "@/lib/setup-flow";
import { announceSiteUpdated } from "@/lib/site-events";
import { ApiError } from "@/types/api";
import { cn } from "@/lib/utils";
import { BrowserFrame, Composing, type Device } from "./browser-frame";
import { GoLiveCard } from "./go-live-card";
import { InterviewChat } from "./interview-chat";
import { Celebration } from "./launch";
import { mockSetupFlowApi } from "./mock";
import { SetupSkeleton } from "./skeleton";
import { SHELL_CSS, SHELL_TOKENS } from "./tokens";

type Stages = [string, string, string];
const PAGE_STAGES: Stages = [
  "Choosing the layout",
  "Writing your copy",
  "Finding your photos",
];
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

export function SetupFlow({
  brandName,
  host,
  mock,
  fontClassName,
}: {
  brandName: string;
  host: string;
  mock: boolean;
  fontClassName: string;
}) {
  const api = mock ? mockSetupFlowApi : setupFlowApi;
  const [flow, setFlow] = useState<SetupFlowState | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setFlow(await api.get());
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? new Error("Guided setup isn’t available for this site yet.")
          : err,
      );
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      style={SHELL_TOKENS}
      className={cn(
        fontClassName,
        "sf-shell h-dvh overflow-hidden antialiased",
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
      <PageState
        loading={!flow && !loadError}
        error={loadError}
        onRetry={load}
        skeleton={<SetupSkeleton />}
        className="h-full"
      >
        {flow && (
          <Flow
            flow={flow}
            setFlow={setFlow}
            api={api}
            brandName={flow.brand_name || brandName}
            host={host}
          />
        )}
      </PageState>
    </div>
  );
}

function Flow({
  flow,
  setFlow,
  api,
  brandName,
  host,
}: {
  flow: SetupFlowState;
  setFlow: Dispatch<SetStateAction<SetupFlowState | null>>;
  api: SetupFlowApi;
  brandName: string;
  host: string;
}) {
  const navigate = useNavigate();
  const narrow = useNarrow();
  const iv = flow.interview;
  const [entries, setEntries] = useState<InterviewEntry[]>(iv.turns);
  const [guide, setGuide] = useState<GuideTurn>(iv.guide);
  const [tab, setTab] = useState<"chat" | "preview">("chat");
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [path, setPath] = useState("/");
  const [celebrate, setCelebrate] = useState(false);
  const builds = useRef(flow.page_builds);

  const split = iv.phase !== "interview";
  const working =
    Object.values(flow.page_builds).some((b) => b.status === "building") ||
    Object.values(iv.draft_status).some((s) => s === "building");

  const refresh = useCallback(async () => {
    try {
      setFlow(await api.get());
    } catch {
      // A missed poll is harmless; the next one catches up.
    }
  }, [api, setFlow]);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [working, refresh]);

  // A page that just finished composing: show it.
  useEffect(() => {
    const key = landedPage(builds.current, flow.page_builds);
    builds.current = flow.page_builds;
    if (!key) return;
    setPath(flow.steps.find((s) => s.page_key === key)?.preview_path ?? "/");
    setReloadKey((k) => k + 1);
  }, [flow.page_builds, flow.steps]);

  const applyEdit = useCallback(
    async (edit: CopilotPayload) => {
      if (edit.kind !== "actions" || !edit.actions?.length) {
        if (edit.text)
          setEntries((prev) => [...prev, noteEntry(edit.text as string)]);
        return;
      }
      const titles: string[] = [];
      let auditId: number | undefined;
      const { failed } = await runBundle(
        edit.actions.map((card) => async () => {
          const res = await executeCopilotAction(card.token);
          titles.push(card.title);
          if (res.audit_id != null && isUndoableKind(card.kind))
            auditId = res.audit_id;
        }),
      );
      if (titles.length) {
        announceSiteUpdated();
        setReloadKey((k) => k + 1);
        void refresh();
      }
      const text = failed
        ? `Changed: ${titles.join(", ")}. The rest didn’t go through. Ask again to finish.`
        : `Done: ${titles.join(", ")}.`;
      setEntries((prev) => [...prev, noteEntry(text, auditId)]);
    },
    [refresh],
  );

  const [restore, setRestore] = useState<{ text: string; at: number } | null>(
    null,
  );
  const { run: send, loading: sending } = useAsyncAction(
    async (req: TurnRequest) => {
      const before = entries;
      const serverTurns = flow.interview.turns.length;
      setEntries([...before, { role: "coach", text: req.message }]);
      try {
        const res = await api.turn(req);
        const coach: InterviewEntry[] = res.coach_text
          ? [{ role: "coach", text: res.coach_text }]
          : [];
        setEntries([...before, ...coach, toEntry(res.guide)]);
        setGuide(res.guide);
        setFlow(res.state);
        if (res.edit) await applyEdit(res.edit);
      } catch (err) {
        // A slow turn can be cut off by the proxy after the server finished
        // it: adopt the server's transcript instead of losing the answer.
        const fresh = await api.get().catch(() => null);
        if (fresh && fresh.interview.turns.length > serverTurns) {
          setFlow(fresh);
          setEntries(fresh.interview.turns);
          setGuide(fresh.interview.guide);
          return;
        }
        setEntries(before);
        // Typed or dictated text goes back into the box, never lost.
        if (!req.choice) setRestore({ text: req.message, at: Date.now() });
        throw err;
      }
    },
    { errorToast: "That didn’t go through. Your answer is back in the box." },
  );

  const { run: undo } = useAsyncAction(
    async (auditId: number) => {
      await undoCopilotAction(auditId);
      setEntries((prev) =>
        prev.map((e) =>
          e.role === "guide" && e.audit_id === auditId
            ? { ...e, audit_id: undefined, ack: `${e.ack} (undone)` }
            : e,
        ),
      );
      announceSiteUpdated();
      setReloadKey((k) => k + 1);
      toast.success("Change undone");
    },
    { errorToast: "Couldn’t undo that. Try again." },
  );

  const currentPage = flow.steps.find((s) => s.preview_path === path)?.page_key;
  const composing = currentPage
    ? flow.page_builds[currentPage]?.status !== "ready"
    : false;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {split && narrow && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--sf-line)] bg-[var(--sf-paper)] px-4">
          <span className="truncate text-sm font-semibold">{brandName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTab(tab === "chat" ? "preview" : "chat")}
            className="rounded-full"
          >
            {tab === "chat" ? "See your site" : "Back to the chat"}
          </Button>
        </div>
      )}

      {split && (
        <main
          className={cn(
            "relative min-h-0 min-w-0 flex-1 flex-col bg-[var(--sf-wall)] motion-safe:animate-fade-in",
            narrow && tab !== "preview" ? "hidden" : "flex",
          )}
          style={{
            backgroundImage:
              "radial-gradient(90% 60% at 50% 8%, var(--sf-wall-lit), transparent 72%), radial-gradient(140% 110% at 50% 45%, transparent 55%, rgb(72 52 28 / 0.07))",
          }}
        >
          <div className="hidden h-[60px] shrink-0 items-center justify-end px-7 lg:flex">
            <div
              role="radiogroup"
              aria-label="Preview size"
              className="flex rounded-full bg-[rgb(255_255_255/0.6)] p-0.5 ring-1 ring-[var(--sf-line)]"
            >
              {(
                [
                  ["desktop", Monitor, "Desktop"],
                  ["phone", Smartphone, "Phone"],
                ] as const
              ).map(([d, Icon, label]) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={device === d}
                  aria-label={label}
                  title={label}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "rounded-full px-2.5 py-1.5 transition-colors",
                    device === d
                      ? "bg-white text-[var(--sf-ink)] shadow-[0_1px_2px_rgb(48_36_20/0.12)]"
                      : "text-[var(--sf-faint)] hover:text-[var(--sf-ink)]",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 px-3 py-3 lg:px-7 lg:pb-6 lg:pt-0">
            <BrowserFrame
              host={host}
              path={path}
              device={narrow ? "phone" : device}
              reloadKey={reloadKey}
              onReload={
                composing ? undefined : () => setReloadKey((k) => k + 1)
              }
              overlay={
                composing ? (
                  <Composing
                    title="Building your page"
                    stages={PAGE_STAGES}
                    note="Usually ready in under a minute."
                  />
                ) : null
              }
            />
          </div>
          {celebrate && (
            <Celebration
              brandName={brandName}
              host={host}
              onDashboard={() => navigate("/admin")}
            />
          )}
        </main>
      )}

      <InterviewChat
        entries={entries}
        guide={guide}
        sending={sending}
        remaining={iv.remaining}
        wide={!split}
        onSend={(req) => void send(req)}
        onUndo={(id) => void undo(id)}
        onMoreLogos={api.logos}
        restore={restore}
        footer={
          iv.phase === "golive" ? (
            <GoLiveCard api={api} onPublished={() => setCelebrate(true)} />
          ) : null
        }
        className={cn(
          split
            ? "lg:w-[400px] lg:shrink-0 lg:border-l lg:border-[var(--sf-line)]"
            : "flex-1",
          split && narrow && tab !== "chat"
            ? "hidden"
            : "flex flex-1 lg:flex-none",
          !split && "lg:flex-1",
        )}
      />
    </div>
  );
}
