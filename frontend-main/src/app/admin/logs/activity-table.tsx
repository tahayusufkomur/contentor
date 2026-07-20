"use client";

import type { ActivityRow } from "@/lib/platform-logs-api";

export function ActivityTable(_props: {
  rows: ActivityRow[];
  onUserClick: (user: string) => void;
  onIpClick: (ip: string) => void;
  onSessionClick: (session: string) => void;
  onViewLogs: (user: string) => void;
}) {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      Activity view lands in the next task.
    </p>
  );
}
