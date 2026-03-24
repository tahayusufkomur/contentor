"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LiveStreamRoom from "@/components/live-stream/live-stream-room";

interface StreamData {
  id: number;
  title: string;
  description: string;
  status: string;
}

interface LiveStreamClientProps {
  streamId: string;
  userId: string;
  userName: string;
  userImage?: string;
}

export default function LiveStreamClient({
  streamId,
  userId,
  userName,
  userImage,
}: LiveStreamClientProps) {
  const router = useRouter();
  const [stream, setStream] = useState<StreamData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/v1/live-streams/${streamId}/`, {
          credentials: "same-origin",
        });
        if (!res.ok) {
          setError("Live stream not found");
          setLoading(false);
          return;
        }
        const data: StreamData = await res.json();
        setStream(data);
        setLoading(false);
      } catch {
        setError("Connection error");
        setLoading(false);
      }
    }
    init();
  }, [streamId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-muted-foreground">
            Connecting to live stream...
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
              <p className="text-muted-foreground">
                This stream hasn&apos;t started yet. Check back when the host
                goes live.
              </p>
            ) : (
              <p className="text-muted-foreground">This stream has ended.</p>
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
    <LiveStreamRoom
      streamId={streamId}
      userId={userId}
      userName={userName}
      userImage={userImage}
    />
  );
}
