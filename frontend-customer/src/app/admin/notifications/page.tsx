"use client";

import { useState } from "react";

import AnnouncementCompose from "@/components/admin/announcement-compose";
import AnnouncementHistory from "@/components/admin/announcement-history";
import AnnouncementRecurringList from "@/components/admin/announcement-recurring-list";
import AnnouncementTemplatesList from "@/components/admin/announcement-templates-list";
import { RichEditorProvider } from "@/components/owner/rich-editor";

type Tab = "history" | "recurring" | "templates";

const TABS: { id: Tab; label: string }[] = [
  { id: "history", label: "History" },
  { id: "recurring", label: "Recurring" },
  { id: "templates", label: "Templates" },
];

export default function NotificationsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("history");
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <RichEditorProvider>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-lg font-semibold">Announcements</h1>
        <AnnouncementCompose onSent={bump} />

        <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1 ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "history" && <AnnouncementHistory refreshKey={refreshKey} />}
        {tab === "recurring" && (
          <AnnouncementRecurringList refreshKey={refreshKey} />
        )}
        {tab === "templates" && (
          <AnnouncementTemplatesList refreshKey={refreshKey} />
        )}
      </div>
    </RichEditorProvider>
  );
}
