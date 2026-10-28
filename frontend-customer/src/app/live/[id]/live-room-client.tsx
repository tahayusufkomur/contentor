"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import LiveClassRoom from "@/components/live/live-class-room";

interface LiveClassData {
  id: number;
  title: string;
  description: string;
  status: string;
  room_name: string;
}

interface LiveRoomClientProps {
  liveClassId: string;
}

export default function LiveRoomClient({ liveClassId }: LiveRoomClientProps) {
  const router = useRouter();
  const t = useTranslations("student.live");
  const [liveClass, setLiveClass] = useState<LiveClassData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/v1/live/${liveClassId}/`, {
          credentials: "same-origin",
        });
        if (!res.ok) {
          setError(t("session.notFound"));
          setLoading(false);
          return;
        }
        const data: LiveClassData = await res.json();
        setLiveClass(data);
        setLoading(false);
      } catch {
        setError(t("connectionError"));
        setLoading(false);
      }
    }
    init();
  }, [liveClassId, t]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" label={t("session.connecting")} />
          <p className="mt-4 text-muted-foreground">
            {t("session.connectingDots")}
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

  if (!liveClass) return null;

  if (liveClass.status !== "live") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold">{liveClass.title}</h1>
          {liveClass.description && (
            <p className="mt-2 text-muted-foreground">
              {liveClass.description}
            </p>
          )}
          <div className="mt-6 rounded-lg border border-dashed p-8">
            {liveClass.status === "draft" ||
            liveClass.status === "scheduled" ? (
              <p className="text-muted-foreground">{t("session.notStarted")}</p>
            ) : (
              <p className="text-muted-foreground">{t("session.ended")}</p>
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

  return <LiveClassRoom liveClassId={liveClassId} />;
}
