"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getModerationQueue } from "@/lib/community-admin";
import { CommunitySettingsTab } from "@/components/admin/community/community-settings";
import { MembersTable } from "@/components/admin/community/members-table";
import { ModFeed } from "@/components/admin/community/mod-feed";
import { ReportsQueue } from "@/components/admin/community/reports-queue";

export default function AdminCommunityPage() {
  const [queueCount, setQueueCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getModerationQueue()
      .then((q) => setQueueCount(q.reports.length + q.pending_posts.length))
      .catch(() => {});
  }, [refreshKey]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-lg font-semibold">Community</h1>
      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="reports">
            Reports
            {queueCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">
                {queueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="feed" className="pt-4">
          <ModFeed />
        </TabsContent>
        <TabsContent value="reports" className="pt-4">
          <ReportsQueue onResolved={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="members" className="pt-4">
          <MembersTable />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <CommunitySettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
