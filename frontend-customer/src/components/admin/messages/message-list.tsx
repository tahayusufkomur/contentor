"use client";

import { dyn } from "@/i18n/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bell, Mail, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { SkeletonList } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { deleteAnnouncement, listAnnouncements } from "@/lib/announcements";
import { cancelCampaign, listCampaigns } from "@/lib/email-api";
import { mergeMessages, type MessageRow } from "@/lib/messages";
import { useAsyncAction } from "@shared/hooks/use-async-action";

const STATUS_VARIANT: Record<
  MessageRow["status"],
  "success" | "secondary" | "warning" | "outline" | "brand"
> = {
  draft: "outline",
  scheduled: "brand",
  sending: "secondary",
  sent: "success",
  partial: "warning",
  failed: "warning",
};

const when = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

/** Everything she sent or scheduled, announcements and designed emails in
 *  one list. The two come from two APIs and are merged here. */
export function MessageList() {
  const t = useTranslations("admin.messages");
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [emailDown, setEmailDown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    // ponytail: the newest 100 designed emails. Page both lists on the server
    // when a coach has more than that.
    const [announcements, campaigns] = await Promise.allSettled([
      listAnnouncements(),
      listCampaigns(100, 0),
    ]);
    // Announcements are the page; without them there is nothing to show.
    if (announcements.status === "rejected") {
      setError(announcements.reason);
    } else {
      setRows(
        mergeMessages(
          announcements.value,
          campaigns.status === "fulfilled" ? campaigns.value.results : [],
        ),
      );
      setEmailDown(campaigns.status === "rejected");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => {
        setLoading(true);
        load();
      }}
      skeleton={<SkeletonList count={4} />}
    >
      {emailDown && (
        <p className="mb-3 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          {t("emailDown")}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={t("empty")}
          description={t("emptyHint")}
          action={{ label: t("new"), href: "/admin/messages/new" }}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((row) => (
            <Row key={row.key} row={row} onChanged={load} />
          ))}
        </ul>
      )}
    </PageState>
  );
}

function Row({ row, onChanged }: { row: MessageRow; onChanged: () => void }) {
  const locale = useLocale();
  const t = useTranslations("admin.messages");
  const Icon = row.kind === "email" ? Mail : Bell;
  // A scheduled message is cancelled; a sent announcement is deleted, which
  // also takes it out of her students' feed; an email draft is thrown away.
  // A sent email is a record.
  const removal =
    row.status === "scheduled"
      ? "cancel"
      : row.kind === "announcement"
        ? "delete"
        : row.status === "draft"
          ? "discard"
          : null;

  const { run: remove, loading: removing } = useAsyncAction(
    async () => {
      if (
        !window.confirm(t(dyn(t, `confirm.${removal}`), { title: row.title }))
      )
        return;
      await (row.kind === "email"
        ? cancelCampaign(row.id)
        : deleteAnnouncement(row.id));
      toast.success(t(dyn(t, `done.${removal}`)));
      onChanged();
    },
    { errorToast: t("removeError") },
  );

  const detail =
    row.status === "draft"
      ? t("detail.draft")
      : row.status === "scheduled"
        ? t("detail.scheduled", { when: when(row.at, locale) })
        : row.status === "sending"
          ? t("detail.sending")
          : row.kind === "email"
            ? t("detail.email", {
                reached: row.reached,
                recipients: row.recipients,
                failed: row.failed,
              })
            : t("detail.announcement", {
                recipients: row.recipients,
                reached: row.reached,
              });

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-[7rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <NavLink
            href={row.href}
            className="truncate font-medium hover:underline"
          >
            {row.title || t("untitled")}
          </NavLink>
          <Badge variant={STATUS_VARIANT[row.status]}>
            {t(`status.${row.status}`)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(`channel.${row.channel}`)} · {detail}
          {row.status !== "scheduled" && row.status !== "draft" && (
            <> · {when(row.at, locale)}</>
          )}
        </p>
      </div>
      {/* A longer language wraps these under the text instead of squeezing
          the title; English fits on one line as before. */}
      <div
        className={`ml-auto items-center gap-1 ${removal ? "flex" : "hidden"}`}
      >
        {row.status === "draft" && (
          <Button asChild variant="outline" size="sm">
            <NavLink href={row.href}>{t("review")}</NavLink>
          </Button>
        )}
        {removal && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            loading={removing}
            onClick={remove}
          >
            {t(`action.${removal}`)}
          </Button>
        )}
      </div>
    </li>
  );
}
