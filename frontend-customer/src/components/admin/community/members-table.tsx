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

function stateBadge(m: ModerationMember) {
  if (m.is_banned) return <Badge variant="destructive">Banned</Badge>;
  if (m.muted_until && new Date(m.muted_until) > new Date())
    return (
      <Badge variant="outline">
        Muted until {new Date(m.muted_until).toLocaleDateString()}
      </Badge>
    );
  if (m.requires_approval)
    return <Badge variant="outline">Posts need approval</Badge>;
  return <Badge variant="secondary">Active</Badge>;
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
  const { run: act, loading: busy } = useAsyncAction(
    async (action: () => Promise<void>, message: string) => {
      await action();
      toast.success(message);
      onAction();
    },
    { errorToast: "Action failed." },
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
      <TableCell>{stateBadge(member)}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Member actions"
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
                    `${member.display_name} can access the community again.`,
                  )
                }
              >
                Unban
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      `Ban ${member.display_name}? They lose all access to the community.`,
                    )
                  )
                    void act(
                      () => banMember(member.id),
                      `${member.display_name} is banned.`,
                    );
                }}
              >
                Ban
              </DropdownMenuItem>
            )}
            {isMuted ? (
              <DropdownMenuItem
                onClick={() =>
                  void act(() => muteMember(member.id, 0), "Mute lifted.")
                }
              >
                Unmute
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() =>
                  void act(
                    () => muteMember(member.id, 7),
                    `${member.display_name} muted for 7 days.`,
                  )
                }
              >
                Mute for 7 days
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                void act(
                  () =>
                    setRequiresApproval(member.id, !member.requires_approval),
                  member.requires_approval
                    ? "Their posts publish instantly again."
                    : "Their next posts will wait for your approval.",
                )
              }
            >
              {member.requires_approval
                ? "Stop reviewing their posts"
                : "Review their posts first"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export function MembersTable() {
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
          toast.error("Couldn't load members.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Live search — silent refresh, doesn't touch the loading/error state so
  // typing never re-triggers the full-page skeleton.
  const search = useCallback((query: string) => {
    setQ(query);
    getMembers(query)
      .then((r) => setMembers(r.results))
      .catch(() => toast.error("Couldn't load members."));
  }, []);

  // Refresh after a row action resolves — reapplies the current search.
  const refresh = useCallback(() => {
    getMembers(q)
      .then((r) => setMembers(r.results))
      .catch(() => toast.error("Couldn't load members."));
  }, [q]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search members…"
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
              <TableHead>Member</TableHead>
              <TableHead>Posts</TableHead>
              <TableHead>Status</TableHead>
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
