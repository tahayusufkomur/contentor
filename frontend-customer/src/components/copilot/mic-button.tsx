"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// The bits of the Web Speech API we use; TS's DOM lib doesn't ship them.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function recognitionCtor(): (new () => Recognition) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, new () => Recognition>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Dictation via the browser's built-in speech recognition (English).
 * Live (interim) words go to onText(text, false); each finished phrase
 * to onText(text, true). Renders nothing where the browser
 * has no recognizer (Firefox), so typing stays the fallback.
 * ponytail: browser engine only (Chrome sends audio to Google, Safari to
 * Apple); move to server-side transcription if Firefox or privacy matters. */
export function MicButton({
  onText,
  disabled,
  className,
}: {
  onText: (text: string, final: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("student.copilot");
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(!!recognitionCtor());
    return () => recRef.current?.abort();
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          if (text.trim()) onTextRef.current(text.trim(), true);
        } else {
          interim += text;
        }
      }
      // Words still being recognised: shown live, replaced by the final text.
      onTextRef.current(interim.trim(), false);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast.error(t("micBlocked"));
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const label = listening ? t("stopDictation") : t("dictate");
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={listening}
      title={label}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        "rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50",
        listening &&
          "bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 ring-2 ring-red-200",
        className,
      )}
    >
      <Mic className="size-4" aria-hidden />
    </button>
  );
}
