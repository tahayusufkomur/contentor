"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import type { EmailDesign } from "./types";

/** The email exactly as it is sent: the server's HTML in a sandboxed frame. */
export function PreviewPane({
  design,
  device,
  renderPreview,
}: {
  design: EmailDesign;
  device: "desktop" | "mobile";
  renderPreview: (design: EmailDesign) => Promise<string>;
}) {
  const t = useTranslations("studio.emailEditor.preview");
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The page may pass a fresh function each render; only the design (or a retry) re-renders.
  const render = useRef(renderPreview);
  render.current = renderPreview;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    render
      .current(design)
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [design, attempt]);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("failed")}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAttempt((n) => n + 1)}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label={t("loading")} />
      </div>
    );
  }
  return (
    <div className="flex h-full justify-center overflow-auto bg-muted/40 p-4">
      <iframe
        title={t("title")}
        sandbox=""
        srcDoc={html}
        className={cn(
          "h-full min-h-[560px] rounded-lg border bg-white shadow-sm",
          device === "mobile" ? "w-[375px] max-w-full" : "w-full max-w-[760px]",
        )}
      />
    </div>
  );
}
