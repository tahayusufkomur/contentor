"use client";

import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import { SkeletonTable } from "@/components/ui/skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  banMember,
  getMembers,
  type ModerationMember,
  muteMember,
  setRequiresApproval,
  unbanMember,
} from "@/lib/community-admin";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useLocale, useTranslations } from "next-intl";

type MembersT = ReturnType<typeof useTranslations<"admin.community.members">>;

function stateBadge(m: ModerationMember, locale: string, t: MembersT) {
  if (m.is_banned) return <Badge variant="destructive">{t("banned")}</Badge>;
  if (m.muted_until && new Date(m.muted_until) > new Date())
    return (
      <Badge variant="outline">
        {t("mutedUntil", {
          date: new Date(m.muted_until).toLocaleDateString(locale),
        })}
      </Badge>
    );
  if (m.requires_approval)
    return <Badge variant="outline">{t("needsApproval")}</Badge>;
  return <Badge variant="secondary">{t("active")}</Badge>;
}

// Per-row: moderation actions need their own in-flight tracking, otherwise a
// single shared flag would freeze every other row's dropdown while one
// member is being banned/muted (see ReportCard in reports-queue.tsx, same
// directory, for the same pattern).
function MemberRow({
  member,
  onAction,
}: {
  member: ModerationMember;
  onAction: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("admin.community.members");
  const { run: act, loading: busy } = useAsyncAction(
    async (action: () => Promise<void>, message: string) => {
      await action();
      toast.success(message);
      onAction();
    },
    { errorToast: t("actionFailed") },
  );

  const isMuted =
    !!member.muted_until && new Date(member.muted_until) > new Date();

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{member.display_name}</div>
        <div className="text-xs text-muted-foreground">{member.email}</div>
      </TableCell>
      <TableCell>{member.post_count}</TableCell>
      <TableCell>{stateBadge(member, locale, t)}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("actions")}
              loading={busy}
              disabled={busy}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {member.is_banned ? (
              <DropdownMenuItem
                onClick={() =>
                  void act(
                    () => unbanMember(member.id),
                    t("unbanned", { name: member.display_name }),
                  )
                }
              >
                {t("unban")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      t("confirmBan", { name: member.display_name }),
                    )
                  )
                    void act(
                      () => banMember(member.id),
                      t("bannedDone", { name: member.display_name }),
                    );
                }}
              >
                {t("ban")}
              </DropdownMenuItem>
            )}
            {isMuted ? (
              <DropdownMenuItem
                onClick={() =>
                  void act(() => muteMember(member.id, 0), t("muteLifted"))
                }
              >
                {t("unmute")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() =>
                  void act(
                    () => muteMember(member.id, 7),
                    t("muted", { name: member.display_name }),
                  )
                }
              >
                {t("mute")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                void act(
                  () =>
                    setRequiresApproval(member.id, !member.requires_approval),
                  member.requires_approval ? t("approvalOff") : t("approvalOn"),
                )
              }
            >
              {member.requires_approval ? t("stopReview") : t("reviewFirst")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export function MembersTable() {
  const t = useTranslations("admin.community.members");
  const [members, setMembers] = useState<ModerationMember[] | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Initial load + retry — drives the PageState skeleton/error card below.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMembers("")
      .then((r) => {
        if (!cancelled) setMembers(r.results);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          toast.error(t("loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, t]);

  // Live search — silent refresh, doesn't touch the loading/error state so
  // typing never re-triggers the full-page skeleton.
  const search = useCallback(
    (query: string) => {
      setQ(query);
      getMembers(query)
        .then((r) => setMembers(r.results))
        .catch(() => toast.error(t("loadError")));
    },
    [t],
  );

  // Refresh after a row action resolves — reapplies the current search.
  const refresh = useCallback(() => {
    getMembers(q)
      .then((r) => setMembers(r.results))
      .catch(() => toast.error(t("loadError")));
  }, [q, t]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={t("search")}
          value={q}
          onChange={(e) => search(e.target.value)}
        />
      </div>
      <PageState
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<SkeletonTable rows={6} cols={4} />}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("member")}</TableHead>
              <TableHead>{t("posts")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(members ?? []).map((m) => (
              <MemberRow key={m.id} member={m} onAction={refresh} />
            ))}
          </TableBody>
        </Table>
      </PageState>
    </div>
  );
}
