"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  userId: string;
  userName: string;
  userImage?: string;
}

export default function LiveRoomClient({
  liveClassId,
  userId,
  userName,
  userImage,
}: LiveRoomClientProps) {
  const router = useRouter();
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
          setError("Live class not found");
          setLoading(false);
          return;
        }
        const data: LiveClassData = await res.json();
        setLiveClass(data);
        setLoading(false);
      } catch {
        setError("Connection error");
        setLoading(false);
      }
    }
    init();
  }, [liveClassId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-muted-foreground">
            Connecting to live class...
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
            Go back
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
              <p className="text-muted-foreground">
                This class hasn&apos;t started yet. Check back when the
                instructor goes live.
              </p>
            ) : (
              <p className="text-muted-foreground">This class has ended.</p>
            )}
          </div>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-primary underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveClassRoom
      liveClassId={liveClassId}
      userId={userId}
      userName={userName}
      userImage={userImage}
    />
  );
}
