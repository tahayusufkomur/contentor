"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LiveClassesTab } from "@/components/admin/live/classes-tab";
import { LiveStreamsTab } from "@/components/admin/live/streams-tab";
import { ZoomClassesTab } from "@/components/admin/live/zoom-tab";
import { OnsiteEventsTab } from "@/components/admin/live/onsite-tab";

export default function LiveEventsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live Events</h1>
        <p className="text-sm text-muted-foreground">
          Manage live classes, streams, Zoom sessions, and on-site events.
        </p>
      </div>

      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes">Live Classes</TabsTrigger>
          <TabsTrigger value="streams">Live Streams</TabsTrigger>
          <TabsTrigger value="zoom">Zoom Classes</TabsTrigger>
          <TabsTrigger value="onsite">On-site Events</TabsTrigger>
        </TabsList>

        <TabsContent value="classes">
          <p className="mb-4 text-sm text-muted-foreground">
            Host interactive live sessions on the platform with video, audio,
            and screen sharing.
          </p>
          <LiveClassesTab />
        </TabsContent>
        <TabsContent value="streams">
          <p className="mb-4 text-sm text-muted-foreground">
            Broadcast one-to-many streams to your audience with live chat.
          </p>
          <LiveStreamsTab />
        </TabsContent>
        <TabsContent value="zoom">
          <p className="mb-4 text-sm text-muted-foreground">
            Schedule and share Zoom meeting links with your students.
          </p>
          <ZoomClassesTab />
        </TabsContent>
        <TabsContent value="onsite">
          <p className="mb-4 text-sm text-muted-foreground">
            Organize in-person events, workshops, and meetups at a physical
            location.
          </p>
          <OnsiteEventsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
