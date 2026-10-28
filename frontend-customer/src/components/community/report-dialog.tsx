"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Textarea } from "@/components/ui/textarea";
import { reportTarget, type TargetKind } from "@/lib/community";
import { REPORT_REASONS, type ReportReason } from "@/types/community";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useTranslations } from "next-intl";

export function ReportDialog({
  open,
  onClose,
  kind,
  id,
}: {
  open: boolean;
  onClose: () => void;
  kind: TargetKind;
  id: number;
}) {
  const t = useTranslations("common");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");

  const { run: submit, loading: busy } = useAsyncAction(
    async () => {
      if (!reason) return;
      await reportTarget(kind, id, reason, detail.trim());
      toast.success(t("community.reportSent"));
      onClose();
    },
    { errorToast: t("community.reportError") },
  );

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-semibold">
            {kind === "posts"
              ? t("community.reportPost")
              : t("community.reportComment")}
          </h3>
          <div className="grid gap-2">
            {REPORT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setReason(r);
                  setDetail("");
                }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm",
                  reason === r
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted",
                )}
              >
                {t(`community.reasons.${r}`)}
              </button>
            ))}
          </div>
          {reason === "other" && (
            <Textarea
              placeholder={t("community.reportDetail")}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={submit}
              disabled={!reason}
              loading={busy}
              loadingText={t("community.reporting")}
            >
              {t("community.report")}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
