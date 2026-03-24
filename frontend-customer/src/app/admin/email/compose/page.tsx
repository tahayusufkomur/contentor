"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EmailBuilderIframe } from "@/components/admin/email/email-builder-iframe";
import { RecipientSelector } from "@/components/admin/email/recipient-selector";
import {
  getTemplate,
  sendCampaign,
  type RecipientFilter,
} from "@/lib/email-api";

type Step = "design" | "send";

interface SavePayload {
  html: string;
  json: Record<string, unknown>;
  templateId?: string;
  templateName?: string;
}

export const dynamic = "force-dynamic";

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTemplateId = searchParams.get("template") || "";

  const [step, setStep] = useState<Step>("design");
  const [templateJson, setTemplateJson] = useState<Record<string, unknown> | undefined>(undefined);
  const [savedTemplateId, setSavedTemplateId] = useState(initialTemplateId);
  const [savedTemplateName, setSavedTemplateName] = useState("");
  const [hasSaved, setHasSaved] = useState(false);

  const [subject, setSubject] = useState("");
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>({ type: "all" });
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialTemplateId) return;

    getTemplate(initialTemplateId)
      .then((data) => {
        if (data.json_data && typeof data.json_data === "object") {
          setTemplateJson(data.json_data as Record<string, unknown>);
        }
        if (data.name) {
          setSavedTemplateName(String(data.name));
        }
      })
      .catch(() => {
        // ignore
      });
  }, [initialTemplateId]);

  const handleSave = useCallback(
    (payload: SavePayload) => {
      setHasSaved(true);

      if (payload.templateId) {
        setSavedTemplateId(payload.templateId);
      } else {
        const jsonId = payload.json?.id;
        if (typeof jsonId === "string" && jsonId.length > 0) {
          setSavedTemplateId(jsonId);
        }
      }

      if (payload.templateName) {
        setSavedTemplateName(payload.templateName);
      }
    },
    [],
  );

  const canGoToSend = useMemo(
    () => hasSaved || Boolean(initialTemplateId) || Boolean(savedTemplateId),
    [hasSaved, initialTemplateId, savedTemplateId],
  );

  async function handleSend() {
    if (!savedTemplateId) {
      setError("Please save a template in the editor first.");
      return;
    }

    if (!subject.trim()) {
      setError("Please enter a subject line.");
      return;
    }

    if (recipientFilter.type === "course" && recipientFilter.course_ids.length === 0) {
      setError("Please select at least one course.");
      return;
    }

    if (recipientFilter.type === "individual" && recipientFilter.user_ids.length === 0) {
      setError("Please select at least one student.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      await sendCampaign({
        template_id: savedTemplateId,
        template_name: savedTemplateName,
        subject,
        recipient_filter: recipientFilter,
      });
      router.push("/admin/email");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send campaign.";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {step === "design" ? "Design Email" : "Send Email"}
        </h1>
        {step === "send" && (
          <button
            onClick={() => setStep("design")}
            className="text-sm text-muted-foreground hover:underline"
          >
            Back to editor
          </button>
        )}
      </div>

      <div className="flex gap-4 text-sm">
        <span className={step === "design" ? "font-bold text-primary" : "text-muted-foreground"}>
          1. Design
        </span>
        <span className="text-muted-foreground">/</span>
        <span className={step === "send" ? "font-bold text-primary" : "text-muted-foreground"}>
          2. Send
        </span>
      </div>

      {step === "design" && (
        <div className="space-y-4">
          <EmailBuilderIframe
            templateJson={templateJson}
            templateId={initialTemplateId}
            onSave={handleSave}
          />

          <div className="flex justify-end">
            <button
              onClick={() => setStep("send")}
              disabled={!canGoToSend}
              className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next: Send
            </button>
          </div>

          {!canGoToSend && (
            <p className="text-right text-xs text-muted-foreground">
              Save your template in the editor first, then click Next.
            </p>
          )}
        </div>
      )}

      {step === "send" && (
        <div className="max-w-xl space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. Welcome to our new course!"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <RecipientSelector
            value={recipientFilter}
            onChange={setRecipientFilter}
            recipientCount={recipientCount}
            onCountChange={setRecipientCount}
          />

          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send Campaign"}
          </button>
        </div>
      )}
    </div>
  );
}
