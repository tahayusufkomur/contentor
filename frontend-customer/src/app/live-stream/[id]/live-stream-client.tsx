"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import LiveStreamRoom from "@/components/live-stream/live-stream-room";

interface StreamData {
  id: number;
  title: string;
  description: string;
  status: string;
}

interface LiveStreamClientProps {
  streamId: string;
}

export default function LiveStreamClient({ streamId }: LiveStreamClientProps) {
  const router = useRouter();
  const t = useTranslations("student.live");
  const [stream, setStream] = useState<StreamData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // A new `t` (messages refreshed) must not refetch.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    async function init() {
      const t = tRef.current;
      try {
        const res = await fetch(`/api/v1/live-streams/${streamId}/`, {
          credentials: "same-origin",
        });
        if (!res.ok) {
          setError(t("stream.notFound"));
          setLoading(false);
          return;
        }
        const data: StreamData = await res.json();
        setStream(data);
        setLoading(false);
      } catch {
        setError(t("connectionError"));
        setLoading(false);
      }
    }
    init();
  }, [streamId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" label={t("stream.connecting")} />
          <p className="mt-4 text-muted-foreground">
            {t("stream.connectingDots")}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg font-medium">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-primary underline"
          >
            {t("goBack")}
          </button>
        </div>
      </div>
    );
  }

  if (!stream) return null;

  if (stream.status !== "live") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold">{stream.title}</h1>
          {stream.description && (
            <p className="mt-2 text-muted-foreground">{stream.description}</p>
          )}
          <div className="mt-6 rounded-lg border border-dashed p-8">
            {stream.status === "draft" || stream.status === "scheduled" ? (
              <p className="text-muted-foreground">{t("stream.notStarted")}</p>
            ) : (
              <p className="text-muted-foreground">{t("stream.ended")}</p>
            )}
          </div>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-primary underline"
          >
            {t("goBack")}
          </button>
        </div>
      </div>
    );
  }

  return <LiveStreamRoom streamId={streamId} />;
}
