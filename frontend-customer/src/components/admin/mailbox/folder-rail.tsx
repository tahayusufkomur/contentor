"use client";

import { Archive, Flag, Inbox, PenSquare } from "lucide-react";

import { Button } from "@/components/ui/button";

export type Folder = "inbox" | "archived" | "spam";

const FOLDERS: { key: Folder; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "archived", label: "Archived", icon: Archive },
  { key: "spam", label: "Spam", icon: Flag },
];

export default function FolderRail({
  folder,
  onSelect,
  onCompose,
}: {
  folder: Folder;
  onSelect: (f: Folder) => void;
  onCompose: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-row gap-1 border-b px-2 py-2 md:w-44 md:flex-col md:border-b-0 md:border-r md:py-3">
      <Button size="sm" className="md:mb-2 md:w-full" onClick={onCompose}>
        <PenSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Compose</span>
      </Button>
      {FOLDERS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors md:w-full ${
            folder === key
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
