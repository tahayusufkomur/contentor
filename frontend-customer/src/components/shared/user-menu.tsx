"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@/types/auth";

export function UserMenu({
  user,
  collapsed,
}: {
  user: User;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const initials = (user.name || user.email)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login?toast=You've+been+logged+out&toast_type=info");
    router.refresh();
  }

  if (collapsed) {
    return (
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        title={`${user.name || user.email} — Sign out`}
        className="flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-full"
      >
        <Avatar className="h-7 w-7">
          <AvatarImage src={user.avatar_url} />
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent"
      >
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={user.avatar_url} />
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium truncate leading-tight">
            {user.name || user.email}
          </p>
          <p className="text-[11px] text-muted-foreground truncate leading-tight">
            {user.role === "owner" ? "Owner" : "Coach"}
          </p>
        </div>
        <ChevronUp
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform",
            !open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border bg-popover p-1 shadow-md">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
