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
import { PaidFeatureBadge } from "@/components/admin/feature-badges";
import { useAsyncAction } from "@shared/hooks/use-async-action";

export default function BlogListPage() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPostAdmin[] | null>(null);
  const [status, setStatus] = useState<BlogAiStatus | null>(null);
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

  const { run: handleNewPost, loading: creating } = useAsyncAction(
    async () => {
      const post = await createPost({ title: t("blog.untitled") });
      router.push(`/admin/blog/${post.id}`);
    },
    { errorToast: t("blog.errGeneric") },
  );

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
          <PaidFeatureBadge feature="ai_blog" />
          <Button
            variant="outline"
            onClick={() => setShowGenerate(true)}
            disabled={showUpsell}
            title={showUpsell ? t("blog.upgradeTitle") : undefined}
          >
            <Sparkles className="h-4 w-4" />
            {t("blog.writeWithAi")}
          </Button>
          <Button onClick={() => void handleNewPost()} loading={creating}>
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
                  <Badge
                    variant={
                      post.status === "published" ? "success" : "outline"
                    }
                  >
                    {post.status === "published"
                      ? t("blog.published")
                      : t("blog.draft")}
                  </Badge>
                  {post.source !== "manual" && (
                    <Badge variant="brand">{t("blog.aiBadge")}</Badge>
                  )}
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <DeletePostButton postId={post.id} onDeleted={load} />
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

// Per-row: each post's delete action needs its own in-flight guard so a
// double-click can't fire two DELETEs and one row's delete doesn't block
// every other row's button (see DeleteModuleButton in course-form.tsx for
// the same pattern).
function DeletePostButton({
  postId,
  onDeleted,
}: {
  postId: number;
  onDeleted: () => void;
}) {
  const t = useTranslations("admin");
  const { run: handleDelete, loading } = useAsyncAction(
    async () => {
      if (!confirm(t("blog.deleteConfirm"))) return;
      await deletePost(postId);
      toast.success("Deleted");
      onDeleted();
    },
    { errorToast: t("blog.errGeneric") },
  );

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-destructive"
      loading={loading}
      onClick={() => void handleDelete()}
    >
      Delete
    </Button>
  );
}
