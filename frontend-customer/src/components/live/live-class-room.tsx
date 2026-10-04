"use client";

import LiveFrame from "./live-frame";

export default function LiveClassRoom({
  liveClassId,
}: {
  liveClassId: string;
}) {
  return <LiveFrame basePath={`/api/v1/live/${liveClassId}`} noun="class" />;
}
