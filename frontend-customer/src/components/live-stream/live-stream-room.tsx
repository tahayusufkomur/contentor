"use client";

import LiveFrame from "@/components/live/live-frame";

export default function LiveStreamRoom({ streamId }: { streamId: string }) {
  return (
    <LiveFrame basePath={`/api/v1/live-streams/${streamId}`} noun="stream" />
  );
}
