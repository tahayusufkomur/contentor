"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PenLine, Plus } from "lucide-react";

import AnnouncementRecurringList from "@/components/admin/announcement-recurring-list";
import AnnouncementTemplatesList from "@/components/admin/announcement-templates-list";
import { MessageList } from "@/components/admin/messages/message-list";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["sent", "repeating", "templates"];

/** Everything the coach tells her students: one way to write a message, and
 *  one list of what went out, whether it was an announcement or an email. */
export default function MessagesPage() {
  const t = useTranslations("admin");
  const tabParam = useSearchParams().get("tab");
  const tab = tabParam && TABS.includes(tabParam) ? tabParam : "sent";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("nav.items.messages")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("messages.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <NavLink href="/admin/messages/email/new">
              <PenLine className="h-4 w-4" />
              {t("messages.design")}
            </NavLink>
          </Button>
          <Button asChild className="gap-2">
            <NavLink href="/admin/messages/new">
              <Plus className="h-4 w-4" />
              {t("messages.new")}
            </NavLink>
          </Button>
        </div>
      </div>

      {/* key remounts the tabs when ?tab= changes under the same page. */}
      <Tabs defaultValue={tab} key={tab}>
        <TabsList>
          <TabsTrigger value="sent">{t("messages.tabs.sent")}</TabsTrigger>
          <TabsTrigger value="repeating">
            {t("messages.tabs.repeating")}
          </TabsTrigger>
          <TabsTrigger value="templates">
            {t("messages.tabs.templates")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sent">
          <MessageList />
        </TabsContent>
        <TabsContent value="repeating">
          <AnnouncementRecurringList refreshKey={0} />
        </TabsContent>
        <TabsContent value="templates" className="space-y-3">
          <AnnouncementTemplatesList refreshKey={0} />
          <NavLink
            href="/admin/messages/email/templates"
            className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("messages.designedTemplates")}
          </NavLink>
        </TabsContent>
      </Tabs>
    </div>
  );
}
