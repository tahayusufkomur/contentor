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

  useEffect(() => {
    fetchOpenRuns()
      .then(({ runs }) =>
        runs
          .filter((run) => isActive(run.status))
          .forEach((run) => trackRun(run.id, run.specialist, run.chat)),
      )
      .catch(() => {});
    return onRunFinished((run) => {
      if (isWatched(run.id)) return;
      const tr = tRef.current;
      const chat = run.chat;
      toast(
        tr("team.readyToast", {
          name: tr(`team.specialists.${run.specialist}.name`),
        }),
        {
          description: run.reply?.text?.slice(0, 140),
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
    });
  }, []);

  return null;
}
