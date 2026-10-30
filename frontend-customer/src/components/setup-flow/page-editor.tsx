"use client";

import { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { embedSrc } from "@/lib/setup-flow";
import { EMBEDDED_EDITOR, type EmbeddedEditorApi } from "@/lib/site-events";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "./browser-frame";
import { SHELL_TOKENS } from "./tokens";

/** The page under review in the site's own editor, full screen: the same
 * canvas and sidebar as the live site (the layout mounts them for
 * ?embed=edit), with a bar on top that is always there to go back. Edits
 * save as she makes them; "Done editing" waits for the last one to land
 * before it closes, so the preview she returns to has it. */
export function PageEditor({
  path,
  page,
  onDone,
}: {
  path: string;
  /** The page's key ("home", "about"): its name is said in each message. */
  page: string;
  /** Closed, with the path of the page the editor ended on. */
  onDone: (path: string) => void;
}) {
  const t = useTranslations("admin.setupFlow");
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { run: finish, loading } = useAsyncAction(
    async () => {
      const win = frameRef.current?.contentWindow as
        | (Window & Record<string, EmbeddedEditorApi | undefined>)
        | null
        | undefined;
      // No editor yet (still loading): nothing was edited.
      const done = (await win?.[EMBEDDED_EDITOR]?.finish()) ?? {
        ok: true,
        path,
      };
      if (!done.ok) throw new Error("not saved");
      onDone(done.path);
    },
    { errorToast: t("editor.saveError") },
  );
  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal
        aria-label={t("editor.aria", { page })}
        style={SHELL_TOKENS}
        className="sf-shell fixed inset-0 z-50 flex flex-col motion-safe:animate-fade-in"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--sf-line)] bg-[var(--sf-paper)] px-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">
              {t("editor.title", { page })}
            </p>
            <p className="hidden text-[13px] text-[var(--sf-graphite)] sm:block">
              {t("editor.hint")}
            </p>
          </div>
          <Button
            onClick={() => void finish()}
            loading={loading}
            loadingText={t("editor.saving")}
            className="shrink-0 rounded-full px-5"
          >
            <ArrowLeft aria-hidden />
            {t("editor.done")}
          </Button>
        </div>
        <div className="relative min-h-0 flex-1 bg-white">
          {!loaded && <PageSkeleton />}
          <iframe
            ref={frameRef}
            src={embedSrc(path, "edit")}
            title={t("editor.aria", { page })}
            onLoad={() => setLoaded(true)}
            className={cn(
              "absolute inset-0 size-full border-0 bg-white transition-opacity duration-300 motion-reduce:transition-none",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </div>
    </ModalPortal>
  );
}
