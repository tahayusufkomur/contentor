"use client";

import { useState } from "react";

import AnnouncementCompose from "@/components/admin/announcement-compose";
import AnnouncementHistory from "@/components/admin/announcement-history";
import { RichEditorProvider } from "@/components/owner/rich-editor";

export default function NotificationsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <RichEditorProvider>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-lg font-semibold">Announcements</h1>
        <AnnouncementCompose onSent={() => setRefreshKey((k) => k + 1)} />
        <AnnouncementHistory refreshKey={refreshKey} />
      </div>
    </RichEditorProvider>
  );
}
