"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createEmailSession } from "@/lib/email-api";

const EMAILCRAFT_BASE =
  process.env.NEXT_PUBLIC_EMAILCRAFT_URL || "https://emailcraft.contentor.app";

interface SavePayload {
  html: string;
  json: Record<string, unknown>;
}

interface TemplateSavedPayload {
  templateId: string;
  templateName: string;
}

interface EmailBuilderIframeProps {
  templateJson?: Record<string, unknown>;
  templateId?: string;
  onSave?: (payload: SavePayload) => void;
  onTemplateSaved?: (payload: TemplateSavedPayload) => void;
  onReady?: () => void;
}

export function EmailBuilderIframe({
  templateJson,
  templateId,
  onSave,
  onTemplateSaved,
  onReady,
}: EmailBuilderIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderReady, setBuilderReady] = useState(false);

  const emailcraftOrigin = useMemo(() => {
    try {
      return new URL(EMAILCRAFT_BASE).origin;
    } catch {
      return "https://emailcraft.contentor.app";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    createEmailSession()
      .then((session) => {
        if (!cancelled) setSessionToken(session.session_token);
      })
      .catch(() => {
        if (!cancelled) setError("Email builder temporarily unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== emailcraftOrigin) return;
      if (!event.data || typeof event.data !== "object") return;

      const data = event.data as {
        source?: string;
        type?: string;
        payload?: {
          html?: string;
          json?: Record<string, unknown>;
          template_id?: string;
          templateId?: string;
          template_name?: string;
          templateName?: string;
        };
      };

      const type = data.type || "";
      if (!type.startsWith("MAILCRAFT_")) return;

      if (type === "MAILCRAFT_READY") {
        setBuilderReady(true);
        onReady?.();
        return;
      }

      if (type === "MAILCRAFT_SAVE") {
        onSave?.({
          html: data.payload?.html ?? "",
          json: data.payload?.json ?? {},
        });
      }

      if (type === "MAILCRAFT_TEMPLATE_SAVED") {
        const tid = data.payload?.template_id || data.payload?.templateId || "";
        const tname = data.payload?.template_name || data.payload?.templateName || "";
        if (tid) {
          onTemplateSaved?.({ templateId: String(tid), templateName: String(tname) });
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [emailcraftOrigin, onReady, onSave, onTemplateSaved]);

  useEffect(() => {
    if (!builderReady || !iframeRef.current?.contentWindow) return;

    if (templateJson) {
      iframeRef.current.contentWindow.postMessage(
        {
          source: "mailcraft-host",
          type: "MAILCRAFT_LOAD_TEMPLATE",
          payload: { json: templateJson },
        },
        emailcraftOrigin,
      );
      return;
    }

    if (templateId) {
      iframeRef.current.contentWindow.postMessage(
        {
          source: "mailcraft-host",
          type: "MAILCRAFT_LOAD_TEMPLATE",
          payload: { template_id: templateId },
        },
        emailcraftOrigin,
      );
    }
  }, [builderReady, emailcraftOrigin, templateId, templateJson]);

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border bg-muted/30">
        <p className="text-muted-foreground">Loading email builder...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border bg-destructive/5">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!sessionToken) return null;

  return (
    <iframe
      ref={iframeRef}
      src={`${EMAILCRAFT_BASE}/builder/?sessionToken=${encodeURIComponent(sessionToken)}`}
      className="w-full rounded-lg border"
      style={{ height: "800px" }}
      allow="clipboard-write"
    />
  );
}
