"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { Newspaper, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  createPost,
  deletePost,
  fetchAiStatus,
  listPosts,
  type BlogAiStatus,
  type BlogPostAdmin,
} from "@/lib/blog-api";
import { GenerateDialog } from "@/components/admin/blog/generate-dialog";
import { AutopilotCard } from "@/components/admin/blog/autopilot-card";

export default function BlogListPage() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPostAdmin[] | null>(null);
  const [status, setStatus] = useState<BlogAiStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  const load = () => {
    listPosts()
      .then((r) => setPosts(r.results))
      .catch(() => setPosts([]));
    fetchAiStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    load();
  }, []);

  const handleNewPost = async () => {
    setCreating(true);
    try {
      const post = await createPost({ title: t("blog.untitled") });
      router.push(`/admin/blog/${post.id}`);
    } catch {
      toast.error(t("blog.errGeneric"));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("blog.deleteConfirm"))) return;
    try {
      await deletePost(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error(t("blog.errGeneric"));
    }
  };

  const showUpsell = status?.reason === "upgrade_required";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("blog.title")}</h1>
          {status?.eligible && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("blog.creditsLeft", {
                remaining: status.remaining,
                limit: status.limit,
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowGenerate(true)}
            disabled={showUpsell}
            title={showUpsell ? t("blog.upgradeTitle") : undefined}
          >
            <Sparkles className="h-4 w-4" />
            {t("blog.writeWithAi")}
          </Button>
          <Button onClick={handleNewPost} loading={creating}>
            {t("blog.newPost")}
          </Button>
        </div>
      </div>

      {showUpsell && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <p className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("blog.upgradeBody")}
          </p>
          <Button asChild size="sm" variant="outline">
            <a href="/admin/billing/subscription">{t("blog.upgrade")}</a>
          </Button>
        </div>
      )}

      <AutopilotCard eligible={!!status?.eligible} />

      {posts === null ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Newspaper} title={t("blog.empty")} />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {posts.map((post) => (
            <div key={post.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="flex-1">
                <Link
                  href={`/admin/blog/${post.id}`}
                  className="font-medium hover:underline"
                >
                  {post.title || t("blog.untitled")}
                </Link>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={post.status === "published" ? "success" : "outline"}>
                    {post.status === "published" ? t("blog.published") : t("blog.draft")}
                  </Badge>
                  {post.source !== "manual" && (
                    <Badge variant="brand">{t("blog.aiBadge")}</Badge>
                  )}
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(post.id)}
                className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showGenerate && (
        <GenerateDialog
          onClose={() => setShowGenerate(false)}
          onGenerated={(post) => {
            setShowGenerate(false);
            router.push(`/admin/blog/${post.id}`);
          }}
        />
      )}
    </div>
  );
}
