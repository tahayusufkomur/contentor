"use client";

import { useEffect, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
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

export function MembersTable() {
  const [members, setMembers] = useState<ModerationMember[] | null>(null);
  const [q, setQ] = useState("");

  const load = (query = q) =>
    getMembers(query)
      .then((r) => setMembers(r.results))
      .catch(() => toast.error("Couldn't load members."));

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<void>, message: string) => {
    try {
      await fn();
      toast.success(message);
      void load();
    } catch {
      toast.error("Action failed.");
    }
  };

  const stateBadge = (m: ModerationMember) => {
    if (m.is_banned) return <Badge variant="destructive">Banned</Badge>;
    if (m.muted_until && new Date(m.muted_until) > new Date())
      return <Badge variant="outline">Muted until {new Date(m.muted_until).toLocaleDateString()}</Badge>;
    if (m.requires_approval) return <Badge variant="outline">Posts need approval</Badge>;
    return <Badge variant="secondary">Active</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search members…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void load(e.target.value);
          }}
        />
      </div>
      {members === null ? (
        <Skeleton className="h-48 w-full" />
      ) : (
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
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-medium">{m.display_name}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </TableCell>
                <TableCell>{m.post_count}</TableCell>
                <TableCell>{stateBadge(m)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Member actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {m.is_banned ? (
                        <DropdownMenuItem
                          onClick={() =>
                            void run(() => unbanMember(m.id), `${m.display_name} can access the community again.`)
                          }
                        >
                          Unban
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm(`Ban ${m.display_name}? They lose all access to the community.`))
                              void run(() => banMember(m.id), `${m.display_name} is banned.`);
                          }}
                        >
                          Ban
                        </DropdownMenuItem>
                      )}
                      {m.muted_until && new Date(m.muted_until) > new Date() ? (
                        <DropdownMenuItem
                          onClick={() => void run(() => muteMember(m.id, 0), "Mute lifted.")}
                        >
                          Unmute
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            void run(() => muteMember(m.id, 7), `${m.display_name} muted for 7 days.`)
                          }
                        >
                          Mute for 7 days
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() =>
                          void run(
                            () => setRequiresApproval(m.id, !m.requires_approval),
                            m.requires_approval
                              ? "Their posts publish instantly again."
                              : "Their next posts will wait for your approval.",
                          )
                        }
                      >
                        {m.requires_approval ? "Stop reviewing their posts" : "Review their posts first"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
