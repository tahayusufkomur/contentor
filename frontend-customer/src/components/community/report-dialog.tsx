"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Textarea } from "@/components/ui/textarea";
import { reportTarget, type TargetKind } from "@/lib/community";
import { REPORT_REASONS, type ReportReason } from "@/types/community";
import { cn } from "@/lib/utils";

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
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await reportTarget(kind, id, reason, detail.trim());
      toast.success("Thanks — a moderator will take a look.");
      onClose();
    } catch {
      toast.error("Couldn't send the report.");
    } finally {
      setBusy(false);
    }
  };

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
          <h3 className="font-semibold">Report this {kind === "posts" ? "post" : "comment"}</h3>
          <div className="grid gap-2">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  setReason(r.value);
                  setDetail("");
                }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm",
                  reason === r.value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {reason === "other" && (
            <Textarea
              placeholder="Tell us more (optional)"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!reason || busy}>
              Report
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
