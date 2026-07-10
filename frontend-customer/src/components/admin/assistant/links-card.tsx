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
import {
  createLink,
  deleteLink,
  listLinks,
  updateLink,
  type AssistantLinkRow,
} from "@/lib/assistant";

// Mirrors AssistantLink.MAX_LINKS on the backend
// (apps/tenant_config/models.py) — enforced here only as a UX nicety; the
// server is the real gate (400 past the cap).
const MAX_LINKS = 20;

/** The link registry (Task 11): places the assistant is allowed to point
 * people to beyond the site itself — a booking page, Instagram, WhatsApp.
 * CRUD list + inline add form, mirroring KnowledgeCard's shape line for
 * line (optimistic enable toggle, delete-with-confirm, cap handling); no
 * prefill plumbing since links aren't seeded from transcripts. */
export function LinksCard() {
  const t = useTranslations("admin");
  const [links, setLinks] = useState<AssistantLinkRow[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    listLinks()
      .then(setLinks)
      .catch(() => {
        setLinks([]);
        toast.error(t("assistant.loadFailed"));
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atCap = (links?.length ?? 0) >= MAX_LINKS;

  const openForm = () => {
    setLabel("");
    setUrl("");
    setNote("");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setLabel("");
    setUrl("");
    setNote("");
  };

  const handleCreate = async () => {
    if (!label.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await createLink({
        label: label.trim(),
        url: url.trim(),
        note: note.trim(),
      });
      closeForm();
      await load();
    } catch {
      toast.error(t("assistant.knowledgeSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (link: AssistantLinkRow) => {
    if (!links) return;
    const prev = links;
    setLinks(
      links.map((l) => (l.id === link.id ? { ...l, enabled: !l.enabled } : l)),
    );
    try {
      await updateLink(link.id, { enabled: !link.enabled });
    } catch {
      setLinks(prev);
      toast.error(t("assistant.knowledgeSaveFailed"));
    }
  };

  const handleDelete = async (id: number) => {
    if (!links) return;
    if (!window.confirm(t("assistant.deleteConfirm"))) return;
    const prev = links;
    setLinks(links.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch {
      setLinks(prev);
      toast.error(t("assistant.knowledgeDeleteFailed"));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("assistant.linksTitle")}</CardTitle>
          <CardDescription>{t("assistant.linksHint")}</CardDescription>
        </div>
        {!formOpen && (
          <Button
            size="sm"
            variant="outline"
            onClick={openForm}
            disabled={atCap}
            title={atCap ? t("assistant.linkLimit") : undefined}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            {t("assistant.linkAdd")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {atCap && (
          <p className="text-xs text-muted-foreground">
            {t("assistant.linkLimit")}
          </p>
        )}
        {formOpen && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="space-y-2">
              <Label htmlFor="link-label">{t("assistant.linkLabel")}</Label>
              <Input
                id="link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">{t("assistant.linkUrl")}</Label>
              <Input
                id="link-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://instagram.com/you"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-note">{t("assistant.linkNote")}</Label>
              <Input
                id="link-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={160}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void handleCreate()}
                loading={saving}
                disabled={!label.trim() || !url.trim()}
              >
                {t("assistant.knowledgeSave")}
              </Button>
              <Button size="sm" variant="outline" onClick={closeForm}>
                {t("assistant.knowledgeCancel")}
              </Button>
            </div>
          </div>
        )}

        {links === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : links.length === 0 ? (
          !formOpen && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("assistant.linksEmpty")}
            </p>
          )
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {links.map((link) => (
              <div key={link.id} className="flex items-start gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{link.label}</div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {link.url}
                  </p>
                  {link.note && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                      {link.note}
                    </p>
                  )}
                </div>
                <Switch
                  checked={link.enabled}
                  onCheckedChange={() => void toggleEnabled(link)}
                  aria-label={t("assistant.entryEnabled")}
                />
                <button
                  type="button"
                  onClick={() => void handleDelete(link.id)}
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
