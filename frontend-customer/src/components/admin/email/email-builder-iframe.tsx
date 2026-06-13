"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { createEmailSession } from "@/lib/email-api";

const EMAILCRAFT_BASE =
  process.env.NEXT_PUBLIC_EMAILCRAFT_URL || "https://mailcraft.contentor.app";

function resolvedColorToHex(cssVar: string): string {
  if (typeof window === "undefined") return "";
  // Resolve the CSS variable via a temporary element
  const el = document.createElement("div");
  el.style.setProperty("background-color", `var(${cssVar})`);
  document.body.appendChild(el);
  const raw = getComputedStyle(el).backgroundColor;
  document.body.removeChild(el);
  if (!raw || raw === "rgba(0, 0, 0, 0)") return "";
  // Draw a 1x1 pixel to convert any color format (oklch, hsl, etc.) to RGB
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  const r = data[0];
  const g = data[1];
  const b = data[2];
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

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
  chromeColor?: string;
  canvasColor?: string;
  onSave?: (payload: SavePayload) => void;
  onTemplateSaved?: (payload: TemplateSavedPayload) => void;
  onReady?: () => void;
}

export interface EmailBuilderIframeHandle {
  requestSave: () => Promise<TemplateSavedPayload | null>;
}

function detectTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export const EmailBuilderIframe = forwardRef<EmailBuilderIframeHandle, EmailBuilderIframeProps>(function EmailBuilderIframe({
  templateJson,
  templateId,
  chromeColor,
  canvasColor,
  onSave,
  onTemplateSaved,
  onReady,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderReady, setBuilderReady] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">(detectTheme);

  const [resolvedChromeColor, setResolvedChromeColor] = useState(chromeColor || "");
  const [resolvedCanvasColor, setResolvedCanvasColor] = useState(canvasColor || "");

  // Observe dark mode class changes on <html>
  useEffect(() => {
    const resolve = () => {
      setThemeMode(detectTheme());
      setResolvedChromeColor(chromeColor || resolvedColorToHex("--card"));
      setResolvedCanvasColor(canvasColor || resolvedColorToHex("--background"));
    };
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [chromeColor, canvasColor]);

  const emailcraftOrigin = useMemo(() => {
    try {
      return new URL(EMAILCRAFT_BASE).origin;
    } catch {
      return "https://mailcraft.contentor.app";
    }
  }, []);

  // Resolve for pending requestSave calls
  const saveResolverRef = useRef<((payload: TemplateSavedPayload | null) => void) | null>(null);

  const requestSave = useCallback((): Promise<TemplateSavedPayload | null> => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return Promise.resolve(null);

    return new Promise((resolve) => {
      saveResolverRef.current = resolve;
      iframe.contentWindow!.postMessage(
        { source: "mailcraft-host", type: "MAILCRAFT_REQUEST_SAVE" },
        emailcraftOrigin,
      );
      // Timeout after 5s
      setTimeout(() => {
        if (saveResolverRef.current === resolve) {
          saveResolverRef.current = null;
          resolve(null);
        }
      }, 5000);
    });
  }, [emailcraftOrigin]);

  useImperativeHandle(ref, () => ({ requestSave }), [requestSave]);

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
          const payload = { templateId: String(tid), templateName: String(tname) };
          onTemplateSaved?.(payload);
          // Resolve pending requestSave promise
          if (saveResolverRef.current) {
            saveResolverRef.current(payload);
            saveResolverRef.current = null;
          }
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

  // Send updated theme/colors to the builder when they change
  useEffect(() => {
    if (!builderReady || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        source: "mailcraft-host",
        type: "MAILCRAFT_INIT",
        payload: {
          context: {
            themeMode,
            chromeColor: resolvedChromeColor || undefined,
            canvasColor: resolvedCanvasColor || undefined,
          },
        },
      },
      emailcraftOrigin,
    );
  }, [builderReady, emailcraftOrigin, themeMode, resolvedChromeColor, resolvedCanvasColor]);

  const iframeSrc = useMemo(() => {
    if (!sessionToken) return "";
    const params = new URLSearchParams({ sessionToken });
    params.set("themeMode", themeMode);
    if (resolvedChromeColor) params.set("chromeColor", resolvedChromeColor);
    if (resolvedCanvasColor) params.set("canvasColor", resolvedCanvasColor);
    return `${EMAILCRAFT_BASE}/builder/?${params.toString()}`;
  }, [sessionToken, themeMode, resolvedChromeColor, resolvedCanvasColor]);

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

  if (!sessionToken || !iframeSrc) return null;

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      className="w-full rounded-lg border"
      style={{ height: "800px" }}
      allow="clipboard-write"
    />
  );
});
