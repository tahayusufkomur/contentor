"use client";

import { useEffect, useState } from "react";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createKnowledge,
  deleteKnowledge,
  listKnowledge,
  updateKnowledge,
  type KnowledgeEntry,
} from "@/lib/assistant";

// Mirrors AssistantKnowledgeEntry.MAX_ENTRIES / MAX_CONTENT_CHARS on the
// backend (apps/tenant_config/models.py) — enforced here only as a UX
// nicety; the server is the real gate (400 past the cap/length).
const MAX_ENTRIES = 50;
const MAX_CONTENT = 1500;

export interface KnowledgePrefill {
  title: string;
  content: string;
}

/** "Teach your assistant" — a small knowledge base the assistant draws
 * answers from. CRUD list + an inline add/edit form; delete goes through the
 * house's window.confirm() pattern (see blog/page.tsx, announcement lists). */
export function KnowledgeCard({
  prefill,
  onPrefillConsumed,
}: {
  prefill: KnowledgePrefill | null;
  onPrefillConsumed: () => void;
}) {
  const t = useTranslations("admin");
  const [entries, setEntries] = useState<KnowledgeEntry[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    listKnowledge()
      .then(setEntries)
      .catch(() => {
        setEntries([]);
        toast.error(t("assistant.loadFailed"));
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!prefill) return;
    setFormOpen(true);
    setTitle(prefill.title);
    setContent(prefill.content);
    onPrefillConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const atCap = (entries?.length ?? 0) >= MAX_ENTRIES;

  const openForm = () => {
    setTitle("");
    setContent("");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setTitle("");
    setContent("");
  };

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await createKnowledge({ title: title.trim(), content: content.trim() });
      closeForm();
      await load();
    } catch {
      toast.error(t("assistant.knowledgeSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (entry: KnowledgeEntry) => {
    if (!entries) return;
    const prev = entries;
    setEntries(
      entries.map((e) =>
        e.id === entry.id ? { ...e, enabled: !e.enabled } : e,
      ),
    );
    try {
      await updateKnowledge(entry.id, { enabled: !entry.enabled });
    } catch {
      setEntries(prev);
      toast.error(t("assistant.knowledgeSaveFailed"));
    }
  };

  const handleDelete = async (id: number) => {
    if (!entries) return;
    if (!window.confirm(t("assistant.deleteConfirm"))) return;
    const prev = entries;
    setEntries(entries.filter((e) => e.id !== id));
    try {
      await deleteKnowledge(id);
    } catch {
      setEntries(prev);
      toast.error(t("assistant.knowledgeDeleteFailed"));
    }
  };

  return (
    <Card id="assistant-knowledge">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("assistant.knowledgeTitle")}</CardTitle>
          <CardDescription>{t("assistant.knowledgeHint")}</CardDescription>
        </div>
        {!formOpen && (
          <Button
            size="sm"
            variant="outline"
            onClick={openForm}
            disabled={atCap}
            title={
              atCap
                ? t("assistant.knowledgeLimit", { max: MAX_ENTRIES })
                : undefined
            }
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            {t("assistant.knowledgeAdd")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {atCap && (
          <p className="text-xs text-muted-foreground">
            {t("assistant.knowledgeLimit", { max: MAX_ENTRIES })}
          </p>
        )}
        {formOpen && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="space-y-2">
              <Label htmlFor="entry-title">{t("assistant.entryTitle")}</Label>
              <Input
                id="entry-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder={t("assistant.entryTitlePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-content">
                {t("assistant.entryContent")}
              </Label>
              <Textarea
                id="entry-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={MAX_CONTENT}
                rows={4}
                placeholder={t("assistant.entryContentPlaceholder")}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void handleCreate()}
                loading={saving}
                disabled={!title.trim() || !content.trim()}
              >
                {t("assistant.knowledgeSave")}
              </Button>
              <Button size="sm" variant="outline" onClick={closeForm}>
                {t("assistant.knowledgeCancel")}
              </Button>
            </div>
          </div>
        )}

        {entries === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : entries.length === 0 ? (
          !formOpen && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("assistant.knowledgeEmpty")}
            </p>
          )
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{entry.title}</div>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                    {entry.content}
                  </p>
                </div>
                <Switch
                  checked={entry.enabled}
                  onCheckedChange={() => void toggleEnabled(entry)}
                  aria-label={t("assistant.entryEnabled")}
                />
                <button
                  type="button"
                  onClick={() => void handleDelete(entry.id)}
                  aria-label={t("assistant.delete")}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
