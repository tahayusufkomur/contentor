"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  EmailBuilderIframe,
  type EmailBuilderIframeHandle,
} from "@/components/admin/email/email-builder-iframe";
import { RecipientSelector } from "@/components/admin/email/recipient-selector";
import { TemplateGrid } from "@/components/admin/email/template-grid";
import {
  getTemplate,
  listGallery,
  listTemplates,
  previewTemplates,
  sendCampaign,
  type EmailTemplate,
  type RecipientFilter,
} from "@/lib/email-api";

type Step = "choose" | "design" | "send";

export const dynamic = "force-dynamic";

function asArray<T>(data: T[] | { results: T[] } | { data: T[] }): T[] {
  if (Array.isArray(data)) return data;
  if ("results" in data && Array.isArray(data.results)) return data.results;
  if ("data" in data && Array.isArray((data as { data: T[] }).data))
    return (data as { data: T[] }).data;
  return [];
}

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const builderRef = useRef<EmailBuilderIframeHandle>(null);
  const initialTemplateId = searchParams.get("template") || "";
  const initialStep =
    (searchParams.get("step") as Step) ||
    (initialTemplateId ? "design" : "choose");
  const initialSubject = searchParams.get("subject") || "";
  const initialTemplateName = searchParams.get("templateName") || "";

  // Step 1 state
  const [step, setStepRaw] = useState<Step>(initialStep);
  const [allTemplates, setAllTemplates] = useState<EmailTemplate[]>([]);
  const [previewHtmlMap, setPreviewHtmlMap] = useState<Record<string, string>>(
    {},
  );
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [copyingTemplateId, setCopyingTemplateId] = useState<string | null>(
    null,
  );

  // Step 2 state
  const [savedTemplateId, setSavedTemplateIdRaw] = useState(initialTemplateId);
  const [savedTemplateName, setSavedTemplateNameRaw] =
    useState(initialTemplateName);
  const [templateJson, setTemplateJson] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const [hasSaved, setHasSaved] = useState(!!initialTemplateId);

  // Step 3 state
  const [subject, setSubjectRaw] = useState(initialSubject);
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>({
    type: "all",
  });
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync key state to URL so refresh preserves selections
  const syncUrl = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    const next = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState({}, "", next);
  }, []);

  const setStep = useCallback(
    (s: Step) => {
      setStepRaw(s);
      syncUrl({ step: s });
    },
    [syncUrl],
  );

  const setSavedTemplateId = useCallback(
    (id: string) => {
      setSavedTemplateIdRaw(id);
      syncUrl({ template: id });
    },
    [syncUrl],
  );

  const setSavedTemplateName = useCallback(
    (name: string) => {
      setSavedTemplateNameRaw(name);
      syncUrl({ templateName: name });
    },
    [syncUrl],
  );

  const setSubject = useCallback(
    (s: string) => {
      setSubjectRaw(s);
      syncUrl({ subject: s });
    },
    [syncUrl],
  );

  // Load templates for Step 1
  useEffect(() => {
    if (initialTemplateId) return; // Skip if editing existing template
    setLoadingTemplates(true);

    Promise.all([
      listTemplates()
        .then(asArray)
        .catch(() => [] as EmailTemplate[]),
      listGallery()
        .then(asArray)
        .catch(() => [] as EmailTemplate[]),
    ]).then(([mine, gallery]) => {
      const seen = new Set(mine.map((t) => t.id));
      const uniqueGallery = (gallery as EmailTemplate[]).filter(
        (t) => !seen.has(t.id),
      );
      const all = [...mine, ...uniqueGallery];
      setAllTemplates(all);
      setLoadingTemplates(false);

      // Fetch previews in batches
      const ids = all.map((t) => t.id).filter(Boolean);
      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20);
        previewTemplates(batch)
          .then((result) => {
            setPreviewHtmlMap((prev) => ({ ...prev, ...result.previews }));
          })
          .catch(() => {});
      }
    });
  }, [initialTemplateId]);

  // Load template JSON for editing existing template
  useEffect(() => {
    if (!initialTemplateId) return;
    getTemplate(initialTemplateId)
      .then((data) => {
        if (data.json_data && typeof data.json_data === "object") {
          setTemplateJson(data.json_data as Record<string, unknown>);
        }
        if (data.name) setSavedTemplateName(String(data.name));
      })
      .catch(() => {});
  }, [initialTemplateId, setSavedTemplateName]);

  // Step 1: Select a template → load its JSON and go to Step 2
  const handleSelectTemplate = useCallback(async (template: EmailTemplate) => {
    setCopyingTemplateId(template.id);
    try {
      const data = await getTemplate(template.id);
      if (data.json_data && typeof data.json_data === "object") {
        setTemplateJson(data.json_data as Record<string, unknown>);
      }
      setSavedTemplateName(String(data.name || template.name || ""));
      setSavedTemplateId(template.id);
      setHasSaved(true);
      setStep("design");
    } catch {
      setError("Failed to load template. Please try again.");
    } finally {
      setCopyingTemplateId(null);
    }
  }, []);

  // Step 1: Start from scratch → go to Step 2 with no template
  const handleStartFromScratch = useCallback(() => {
    setSavedTemplateId("");
    setSavedTemplateName("");
    setHasSaved(false);
    setStep("design");
  }, []);

  // Step 2: MAILCRAFT_SAVE event
  const handleSave = useCallback(() => {
    setHasSaved(true);
  }, []);

  // Step 2: MAILCRAFT_TEMPLATE_SAVED event
  const handleTemplateSaved = useCallback(
    (payload: { templateId: string; templateName: string }) => {
      setSavedTemplateId(payload.templateId);
      if (payload.templateName) setSavedTemplateName(payload.templateName);
      setHasSaved(true);
    },
    [],
  );

  const canGoToSend = useMemo(
    () => Boolean(savedTemplateId),
    [savedTemplateId],
  );

  // Step 2: Back to Step 1
  const handleBackToChoose = useCallback(() => {
    if (
      hasSaved &&
      !window.confirm(
        "Go back to template selection? Your current edits are saved.",
      )
    )
      return;
    setStep("choose");
  }, [hasSaved]);

  // Step 3: Send campaign
  async function handleSend() {
    if (!savedTemplateId) {
      setError("Please save a template first.");
      return;
    }
    if (!subject.trim()) {
      setError("Please enter a subject line.");
      return;
    }
    if (
      recipientFilter.type === "course" &&
      recipientFilter.course_ids.length === 0
    ) {
      setError("Please select at least one course.");
      return;
    }
    if (
      recipientFilter.type === "individual" &&
      recipientFilter.user_ids.length === 0
    ) {
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
      const message =
        err instanceof Error ? err.message : "Failed to send campaign.";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  const stepLabels = [
    { key: "choose", label: "1. Choose Template" },
    { key: "design", label: "2. Design" },
    { key: "send", label: "3. Send" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {step === "choose" && "Choose Template"}
          {step === "design" && "Design Email"}
          {step === "send" && "Send Email"}
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex gap-4 text-sm">
        {stepLabels.map((s, i) => (
          <span key={s.key}>
            {i > 0 && <span className="mr-4 text-muted-foreground">/</span>}
            <span
              className={
                step === s.key
                  ? "font-bold text-primary"
                  : "text-muted-foreground"
              }
            >
              {s.label}
            </span>
          </span>
        ))}
      </div>

      {/* Step 1: Choose Template */}
      {step === "choose" && (
        <div className="space-y-4">
          {loadingTemplates ? (
            <p className="text-sm text-muted-foreground">
              Loading templates...
            </p>
          ) : (
            <TemplateGrid
              templates={allTemplates}
              previewHtmlMap={previewHtmlMap}
              mode="picker"
              loadingTemplateId={copyingTemplateId}
              onSelect={handleSelectTemplate}
              showStartFromScratch
              onStartFromScratch={handleStartFromScratch}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Step 2: Design */}
      {step === "design" && (
        <div className="space-y-4">
          <EmailBuilderIframe
            ref={builderRef}
            templateJson={templateJson}
            templateId={savedTemplateId || undefined}
            onSave={handleSave}
            onTemplateSaved={handleTemplateSaved}
          />
          <div className="flex justify-between">
            {!initialTemplateId && (
              <button
                onClick={handleBackToChoose}
                className="text-sm text-muted-foreground hover:underline"
              >
                Back to templates
              </button>
            )}
            <div className="ml-auto">
              <button
                onClick={async () => {
                  // Auto-save the template before going to Send
                  if (builderRef.current && savedTemplateId) {
                    setError(null);
                    const result = await builderRef.current.requestSave();
                    if (result?.templateId) {
                      setSavedTemplateId(result.templateId);
                    }
                  }
                  setStep("send");
                }}
                disabled={!canGoToSend}
                className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next: Send
              </button>
            </div>
          </div>
          {!canGoToSend && (
            <p className="text-right text-xs text-muted-foreground">
              Save your template in the editor first, then click Next.
            </p>
          )}
        </div>
      )}

      {/* Step 3: Send */}
      {step === "send" && (
        <div className="max-w-xl space-y-6">
          <button
            onClick={() => setStep("design")}
            className="text-sm text-muted-foreground hover:underline"
          >
            Back to editor
          </button>

          <div className="space-y-2">
            <label className="text-sm font-medium">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
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
