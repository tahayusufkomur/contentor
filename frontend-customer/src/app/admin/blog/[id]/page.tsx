"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";

import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { refreshSetupStatus } from "@/lib/setup-assistant";
import { ApiError } from "@/types/api";
import { PageState } from "@/components/ui/page-state";
import { SkeletonForm } from "@/components/ui/skeletons";
import { CoverPicker } from "@/components/admin/blog/cover-picker";
import { InlineImages } from "@/components/admin/blog/inline-images";
import { PostEditor } from "@/components/admin/blog/post-editor";
import { CoverStep } from "@/components/focus/cover-step";
import { WorkingTag } from "@/components/focus/working-tag";
import {
  type BlogPostAdmin,
  deletePost,
  generatePost,
  getPost,
  updatePost,
} from "@/lib/blog-api";
import { useLiveRecord, wholeHtml } from "@/lib/copilot/live";
import { startActiveTime } from "@/lib/focus/active-time";
import { fetchCreation } from "@/lib/focus/api";
import { focusTimeKey } from "@/lib/focus/kinds";
import { ownership } from "@/lib/focus/own-fields";
import {
  activeCreation,
  openCreationFor,
  setActiveCreation,
  setFocusSave,
  useActiveCreation,
  useFocusOverview,
} from "@/lib/focus/store";

/** Visible text of the post's HTML: an empty paragraph or an image alone has none. */
const hasText = (html: string) =>
  !!new DOMParser().parseFromString(html, "text/html").body.textContent?.trim();

/** The fields she and the post job both write in focus mode (the slug only
 *  she does), as the server keeps each; the tags as she types them. */
const OWN_TIDY = {
  title: (value: string) => value.trim(),
  excerpt: (value: string) => value.trim(),
  body_html: (value: string) => value,
  meta_description: (value: string) => value.trim(),
  tags: (value: string) => value,
  slug: (value: string) => value.trim(),
};
type OwnName = keyof typeof OWN_TIDY;
type Own = Record<OwnName, string>;
const OWN = Object.keys(OWN_TIDY) as OwnName[];
// The post job's whole post types in within this, however long (a body runs to ~9k characters).
const REPLAY_SECONDS = 5;
const { isHers, isWriting, layOver } = ownership(OWN_TIDY);
const splitTags = (value: string) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const ownOf = (post: BlogPostAdmin): Own => ({
  title: post.title,
  excerpt: post.excerpt,
  body_html: post.body_html,
  meta_description: post.meta_description,
  tags: post.tags.join(", "),
  slug: post.slug,
});
const fromOwn = (own: Own): Partial<BlogPostAdmin> => ({
  ...own,
  tags: splitTags(own.tags),
});

export default function BlogEditorPage() {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const postId = Number(params.id);

  const [post, setPost] = useState<BlogPostAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // `base` is the post as the server last had it; `placed` the copy each of
  // her fields was last GIVEN (one that differs is hers, saved or not, and no
  // reload or replay ever replaces it); `mine` the form now.
  const base = useRef<Own | null>(null);
  const placed = useRef<Own | null>(null);
  const mine = useRef<Own | null>(null);
  mine.current = post && ownOf(post);
  const lay = (next: Own) => {
    const was = mine.current;
    if (!was || !placed.current) return;
    const laid = layOver(was, placed.current, next);
    placed.current = laid.placed;
    if (OWN.every((name) => laid.form[name] === was[name])) return;
    mine.current = laid.form;
    setPost((now) => now && { ...now, ...fromOwn(laid.form) });
  };
  /** A fresh copy from the server: every field she has not changed takes it. */
  const receive = (fresh: BlogPostAdmin) => {
    base.current = ownOf(fresh);
    if (!mine.current || !placed.current) {
      placed.current = base.current;
      setPost(fresh);
      return;
    }
    const laid = layOver(mine.current, placed.current, base.current);
    placed.current = laid.placed;
    mine.current = laid.form;
    setPost({ ...fresh, ...fromOwn(laid.form) });
  };
  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  const reload = useCallback(() => {
    getPost(postId)
      .then((fresh) => receiveRef.current(fresh))
      .catch(() => {});
  }, [postId]);

  useEffect(() => {
    let cancelled = false;
    getPost(postId)
      .then((data) => {
        if (!cancelled) {
          receiveRef.current(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t("blog.errGeneric"));
          navigate("/admin/blog");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const patch = (fields: Partial<BlogPostAdmin>) =>
    setPost((prev) => (prev ? { ...prev, ...fields } : prev));

  // Focus mode: a post she is still making in it reopens there, where she
  // stopped; the guide and the page follow the creation from here.
  const overview = useFocusOverview();
  const creation = useActiveCreation();
  const ours =
    !!creation && creation.kind === "post" && creation.record?.id === postId;
  const creationId =
    openCreationFor(overview, "post", postId) ?? (ours ? creation.id : null);
  useEffect(() => {
    if (!creationId) return;
    startActiveTime(focusTimeKey("post"));
    // Just made on the new-post page: the guide already holds it.
    if (activeCreation()?.id === creationId) return;
    let cancelled = false;
    fetchCreation(creationId)
      .then((state) => {
        if (!cancelled && state.status === "active") setActiveCreation(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creationId]);
  const focusing = ours && creation.id !== 0;
  const copy = focusing ? creation.copy : null;
  // A failed or stopped run is not replayed: the page keeps what is saved.
  const runId =
    copy?.status === "building" || copy?.status === "ready" ? copy.run : null;

  // Each answer writes the post on the server (its title, its cover, published):
  // the page loads it again, and once more when focus mode ends.
  const answeredKey = focusing
    ? [
        "focus",
        creation.question?.field,
        ...creation.answered.map((line) => `${line.field}:${line.label}`),
      ].join("|")
    : "";
  const answeredSeen = useRef(answeredKey);
  useEffect(() => {
    const was = answeredSeen.current;
    answeredSeen.current = answeredKey;
    // Focus mode taking the page up is no answer: the post was just loaded.
    if (was && was !== answeredKey) reload();
  }, [answeredKey, reload]);

  // The post job's title, summary, text, description and tags type in; only
  // the field being written is read-only, and a written value lands unless
  // the field is hers. It is on the server already: the replay is over within
  // REPLAY_SECONDS, however long the post.
  const live = useLiveRecord(
    focusing ? `post:${postId}` : "",
    runId,
    undefined,
    REPLAY_SECONDS,
  );
  const taken = useRef<Record<string, string>>({});
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    taken.current = {};
  }, [runId]);
  useEffect(() => {
    if (!live || !base.current || !placed.current) return;
    const next = { ...placed.current };
    let took = false;
    for (const name of OWN) {
      const field = live.fields[name];
      if (!field || field.typing || taken.current[name] === field.value)
        continue;
      taken.current[name] = field.value;
      // The server has it now, hers or not.
      base.current = { ...base.current, [name]: OWN_TIDY[name](field.value) };
      next[name] = OWN_TIDY[name](field.value);
      took = true;
    }
    if (took) lay(next);
    // Once it has all been shown, the saved post takes over.
    if (live.settled && runId && loadedFor.current !== runId) {
      loadedFor.current = runId;
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lay` only reads refs
  }, [live, runId]);
  const writing = (name: OwnName) =>
    !!mine.current &&
    !!placed.current &&
    isWriting(
      name,
      live?.fields[name]?.typing ?? false,
      mine.current[name],
      placed.current[name],
    );
  const shown = (name: OwnName, value: string) =>
    writing(name) ? (live?.fields[name]?.value ?? "") : value;
  // The text as it types in, whole tags only: never a half "<h2" on screen.
  const shownBody = (value: string) =>
    writing("body_html") ? wholeHtml(shown("body_html", value)) : value;

  // "Save & leave", and before her finish taps: what she changed on the page,
  // and nothing else (the job writes the rest on the server meanwhile, and a
  // stale copy must never go back over it). Publishing stays the finish's tap.
  const saveFocus = async () => {
    if (!mine.current || !base.current) return;
    const now = mine.current;
    const was = base.current;
    const changed = OWN.filter(
      (name) => OWN_TIDY[name](now[name]) !== was[name],
    );
    if (!changed.length) return;
    const changes = Object.fromEntries(
      changed.map((name) => [
        name,
        name === "tags" ? splitTags(now.tags) : now[name],
      ]),
    ) as Partial<BlogPostAdmin>;
    await updatePost(postId, changes);
    base.current = {
      ...was,
      ...Object.fromEntries(
        changed.map((name) => [name, OWN_TIDY[name](now[name])]),
      ),
    };
  };
  const saveFocusRef = useRef(saveFocus);
  saveFocusRef.current = saveFocus;
  useEffect(() => {
    if (!focusing) return;
    setFocusSave(() => saveFocusRef.current());
    return () => setFocusSave(null);
  }, [focusing]);
  // The cover step: the photo row in the cover's place; her tap there is the cover.
  const atCover =
    focusing &&
    (creation.question
      ? creation.question.field === "cover"
      : creation.steps.find((step) => !step.done)?.id === "cover");

  const doSave = async (fields: Partial<BlogPostAdmin> = {}) => {
    if (!post) return;
    const updated = await updatePost(post.id, {
      title: post.title,
      excerpt: post.excerpt,
      meta_description: post.meta_description,
      tags: post.tags,
      slug: post.slug,
      body_html: post.body_html,
      ...fields,
    });
    // Keystrokes she typed during the round trip stay: what she has not changed takes the saved copy.
    receive(updated);
    toast.success("Saved");
    void refreshSetupStatus();
  };

  // Why a draft cannot be published yet; mirrors BlogPost.not_ready on the server.
  let notReady = "";
  if (post && post.status !== "published") {
    const title = post.title.trim();
    if (!title || title === t("blog.untitled"))
      notReady = t("blog.notReadyTitle");
    else if (!hasText(post.body_html)) notReady = t("blog.notReadyBody");
  }

  const { run: save, loading: saving } = useAsyncAction(() => doSave(), {
    errorToast: t("blog.errGeneric"),
  });

  const { run: togglePublish, loading: publishing } = useAsyncAction(
    () =>
      doSave({ status: post?.status === "published" ? "draft" : "published" }),
    {
      onError: (err) =>
        toast.error(
          err instanceof ApiError && err.data.code === "post.not_ready"
            ? err.message
            : t("blog.errGeneric"),
        ),
    },
  );

  const { run: regenerate, loading: regenerating } = useAsyncAction(
    async () => {
      if (!post) return;
      if (!confirm(t("blog.regenerateConfirm"))) return;
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
    },
    { errorToast: t("blog.errGeneric") },
  );

  return (
    <PageState
      loading={loading}
      skeleton={<SkeletonForm fields={6} className="mx-auto max-w-3xl p-6" />}
      className="mx-auto max-w-3xl space-y-4 p-6"
    >
      {post && (
        <>
          {live?.working && (
            <WorkingTag
              specialist={live.working.specialist}
              label={t("focus.writing")}
            />
          )}
          {atCover && creation ? (
            <CoverStep
              creationId={creation.id}
              cover={creation.cover}
              photoOnly
            />
          ) : (
            // Only the cover from its answer: what she typed meanwhile stays.
            <CoverPicker
              post={post}
              onPatched={(fresh) => receive({ ...post, ...fresh })}
            />
          )}

          <input
            value={shown("title", post.title)}
            readOnly={writing("title")}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={t("blog.untitled")}
            className="w-full border-none bg-transparent text-3xl font-semibold outline-none placeholder:text-muted-foreground"
          />

          <Textarea
            value={shown("excerpt", post.excerpt)}
            readOnly={writing("excerpt")}
            onChange={(e) => patch({ excerpt: e.target.value })}
            placeholder={t("blog.editorExcerpt")}
            rows={2}
          />

          <input
            value={shown("tags", post.tags.join(", "))}
            readOnly={writing("tags")}
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
              value={shown("meta_description", post.meta_description)}
              readOnly={writing("meta_description")}
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

          <PostEditor
            value={shownBody(post.body_html)}
            readOnly={writing("body_html")}
            onChange={(html) => patch({ body_html: html })}
          />

          <InlineImages
            post={post}
            onPatched={(fresh) => receive({ ...post, ...fresh })}
          />

          {/* In focus mode: Save & leave in the top bar, and the guide's finish. */}
          {!focusing && (
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
                {notReady && (
                  <p className="text-sm text-muted-foreground">{`${notReady}.`}</p>
                )}
                <Button variant="outline" loading={saving} onClick={save}>
                  {t("blog.editorSave")}
                </Button>
                <Button
                  loading={publishing}
                  loadingText={
                    post.status === "published"
                      ? t("blog.editorUnpublish")
                      : t("blog.editorPublish")
                  }
                  disabled={!!notReady}
                  onClick={togglePublish}
                >
                  {post.status === "published"
                    ? t("blog.editorUnpublish")
                    : t("blog.editorPublish")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </PageState>
  );
}
