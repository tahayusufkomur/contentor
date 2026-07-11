"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PhotoPicker } from "@/components/admin/photo-picker";
import { PostEditor } from "@/components/admin/blog/post-editor";
import {
  type BlogPostAdmin,
  deletePost,
  generatePost,
  getPost,
  updatePost,
} from "@/lib/blog-api";
import { extractHeadings, upsertPlacement } from "@/lib/blog-images";
import type { Photo } from "@/types/photo";

export default function BlogEditorPage() {
  const t = useTranslations("admin");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = Number(params.id);

  const [post, setPost] = useState<BlogPostAdmin | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    getPost(postId)
      .then(setPost)
      .catch(() => {
        toast.error(t("blog.errGeneric"));
        router.push("/admin/blog");
      });
  }, [postId]);

  if (!post) return null;

  const patch = (fields: Partial<BlogPostAdmin>) =>
    setPost((prev) => (prev ? { ...prev, ...fields } : prev));

  const save = async (fields: Partial<BlogPostAdmin> = {}) => {
    setSaving(true);
    try {
      const updated = await updatePost(post.id, {
        title: post.title,
        excerpt: post.excerpt,
        meta_description: post.meta_description,
        tags: post.tags,
        slug: post.slug,
        body_html: post.body_html,
        cover_photo: post.cover_photo,
        // Drop any placement the coach added but never finished (empty
        // photo_id) so we never persist a dangling reference the public
        // page's resolve_inline_photos() can't resolve.
        image_placements: post.image_placements.filter((p) => p.photo_id),
        ...fields,
      });
      setPost(updated);
      toast.success("Saved");
    } catch {
      toast.error(t("blog.errGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = () =>
    save({ status: post.status === "published" ? "draft" : "published" });

  const regenerate = async () => {
    if (!confirm(t("blog.regenerateConfirm"))) return;
    setRegenerating(true);
    try {
      const res = await generatePost({ custom_topic: post.title });
      if (res.source === "ai" && res.post) {
        const fresh = res.post;
        await updatePost(post.id, {
          title: fresh.title,
          body_html: fresh.body_html,
          excerpt: fresh.excerpt,
          meta_description: fresh.meta_description,
          tags: fresh.tags,
        });
        await deletePost(fresh.id);
        setPost({ ...post, ...fresh, id: post.id, slug: post.slug });
        toast.success("Regenerated");
      } else {
        const errKey =
          res.source === "quota_exhausted"
            ? "blog.errQuota"
            : res.source === "budget" || res.source === "disabled"
              ? "blog.errBudget"
              : "blog.errGeneric";
        toast.error(t(errKey));
      }
    } catch {
      toast.error(t("blog.errGeneric"));
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <input
        value={post.title}
        onChange={(e) => patch({ title: e.target.value })}
        placeholder={t("blog.untitled")}
        className="w-full border-none bg-transparent text-3xl font-semibold outline-none placeholder:text-muted-foreground/50"
      />

      <Textarea
        value={post.excerpt}
        onChange={(e) => patch({ excerpt: e.target.value })}
        placeholder={t("blog.editorExcerpt")}
        rows={2}
      />

      <input
        value={post.tags.join(", ")}
        onChange={(e) =>
          patch({
            tags: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        placeholder={t("blog.editorTags")}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />

      <div>
        <Textarea
          value={post.meta_description}
          onChange={(e) => patch({ meta_description: e.target.value })}
          placeholder={t("blog.editorMeta")}
          rows={2}
        />
        <p
          className={`mt-1 text-xs ${
            post.meta_description.length > 155
              ? "text-destructive"
              : "text-muted-foreground"
          }`}
        >
          {post.meta_description.length}/155
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showAdvanced ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {t("blog.editorAdvanced")}
        </button>
        {showAdvanced && (
          <div className="mt-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("blog.editorSlug")}
            </label>
            <input
              value={post.slug}
              onChange={(e) => patch({ slug: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
        )}
      </div>

      <PhotoPicker
        label={t("blog.coverPhoto")}
        value={post.cover_photo}
        previewUrl={post.cover_photo_signed_url}
        onSelect={(photo: Photo) =>
          patch({ cover_photo: photo.id, cover_photo_signed_url: photo.signed_url })
        }
        onClear={() => patch({ cover_photo: null, cover_photo_signed_url: null })}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("blog.inlinePhotos")}</p>
        {post.image_placements.map((placement, idx) => (
          <div key={`${placement.heading}-${idx}`} className="flex items-center gap-2">
            <select
              value={placement.heading}
              onChange={(e) =>
                patch({
                  image_placements: upsertPlacement(
                    post.image_placements.filter((p) => p.heading !== placement.heading),
                    { heading: e.target.value, photo_id: placement.photo_id },
                  ),
                })
              }
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {extractHeadings(post.body_html).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            {/* No previewUrl here: image_placements only carries {heading,
                photo_id} — the API doesn't resolve a signed preview per
                placement (only the cover photo gets that treatment, since
                it's the one shown before any picker interaction). Reopening
                an existing placement shows the generic photo icon rather
                than a thumbnail until the coach picks again; swap/remove
                still works correctly. Add a resolved-preview field here if
                that gap turns out to matter in practice. */}
            <PhotoPicker
              value={placement.photo_id}
              onSelect={(photo: Photo) =>
                patch({
                  image_placements: upsertPlacement(post.image_placements, {
                    heading: placement.heading,
                    photo_id: photo.id,
                  }),
                })
              }
              onClear={() =>
                patch({
                  image_placements: post.image_placements.filter((p) => p.heading !== placement.heading),
                })
              }
            />
          </div>
        ))}
        {post.image_placements.length < 2 && extractHeadings(post.body_html).length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                image_placements: upsertPlacement(post.image_placements, {
                  heading: extractHeadings(post.body_html)[0],
                  photo_id: "",
                }),
              })
            }
          >
            {t("blog.addInlinePhoto")}
          </Button>
        )}
      </div>

      <PostEditor
        value={post.body_html}
        onChange={(html) => patch({ body_html: html })}
      />

      <div className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-2">
          {post.status === "published" && (
            <a
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("blog.viewOnSite")}
            </a>
          )}
          {post.source !== "manual" && (
            <Button
              variant="outline"
              size="sm"
              loading={regenerating}
              onClick={regenerate}
            >
              <Sparkles className="h-4 w-4" />
              {t("blog.regenerate")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={saving} onClick={() => save()}>
            {t("blog.editorSave")}
          </Button>
          <Button onClick={togglePublish}>
            {post.status === "published"
              ? t("blog.editorUnpublish")
              : t("blog.editorPublish")}
          </Button>
        </div>
      </div>
    </div>
  );
}
