"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAssistantDock } from "@/lib/assistant-dock";
import { fetchOpenRuns } from "@/lib/copilot/api";
import {
  isActive,
  isWatched,
  onRunFinished,
  trackRun,
} from "@/lib/copilot/runs";
import { saveUiState } from "@/lib/copilot/storage";
import type { SpecialistKey } from "@/lib/copilot/team";
import type { RunStatus } from "@/lib/copilot/types";

const TOASTED = "copilot:toasted-runs";

/** Runs already announced in this visit, so a reload does not repeat them. */
function toasted(): Set<number> {
  try {
    const raw = window.sessionStorage.getItem(TOASTED);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function markToasted(id: number) {
  try {
    const ids = [...toasted(), id].slice(-50);
    window.sessionStorage.setItem(TOASTED, JSON.stringify(ids));
  } catch {
    // Storage blocked: at worst a reload repeats the toast.
  }
}

/** Asks the docked chat to show one thread (the panel listens). */
export const OPEN_CHAT_EVENT = "contentor:open-chat";

/** Opens the panel on the chat a run answered in. A closed panel boots on
 *  the saved chat; an open one switches when it hears the event. */
export function openRunChat(chat: number, open: () => void) {
  saveUiState({ open: true, chatId: chat });
  open();
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { chat } }));
}

/** Mounted once in the studio: follows her runs still going (a reload or a
 *  closed panel loses nothing) and says when one finishes out of sight. Her
 *  screen never moves on its own; the toast offers the way there. */
export function RunsWatcher() {
  const t = useTranslations("admin");
  const dock = useAssistantDock();
  const tRef = useRef(t);
  tRef.current = t;
  const openRef = useRef(() => dock.open("assistant"));
  openRef.current = () => dock.open("assistant");
  const dockOpenRef = useRef(dock.isOpen);
  dockOpenRef.current = dock.isOpen;

  useEffect(() => {
    /** Done work says it is ready; failed work says so; a stopped run was
     *  her own doing and says nothing. */
    const announce = (run: {
      id: number;
      status: RunStatus;
      specialist: SpecialistKey;
      chat: number | null;
      summary?: string;
    }) => {
      if (run.status !== "done" && run.status !== "failed") return;
      markToasted(run.id);
      const tr = tRef.current;
      const name = tr(`team.specialists.${run.specialist}.name`);
      const chat = run.chat;
      toast(
        run.status === "done"
          ? tr("team.readyToast", { name })
          : tr("team.failedToast", { name }),
        {
          description: run.status === "done" ? run.summary : undefined,
          // Long enough to read and reach Open; the reply also waits in its
          // chat, and the panel lists it as ready for you.
          duration: 12_000,
          action:
            chat === null
              ? undefined
              : {
                  label: tr("team.open"),
                  onClick: () => openRunChat(chat, openRef.current),
                },
        },
      );
    };

    fetchOpenRuns()
      .then(({ runs }) => {
        runs
          .filter((run) => isActive(run.status))
          .forEach((run) => trackRun(run.id, run.specialist, run.chat));
        // Work that finished while she was away. With the panel open, the
        // panel itself shows it.
        if (dockOpenRef.current) return;
        const seen = toasted();
        runs
          .filter((run) => run.status === "done" && !seen.has(run.id))
          .slice(0, 3)
          .forEach(announce);
      })
      .catch(() => {});
    return onRunFinished((run) => {
      if (isWatched(run.id)) return;
      announce({ ...run, summary: run.reply?.text?.slice(0, 140) });
    });
  }, []);

  return null;
}
