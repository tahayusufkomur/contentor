"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { FocusStart } from "@/components/focus/focus-start";
import { Card, CardContent } from "@/components/ui/card";
import { PageState } from "@/components/ui/page-state";
import { SkeletonForm } from "@/components/ui/skeletons";
import { createPost } from "@/lib/blog-api";
import { clearActiveCreation, useFocusOverview } from "@/lib/focus/store";

/** With focus mode on for posts, New asks one question at a time; her first
 *  answer makes the hidden draft and moves to its page. Otherwise, or with
 *  `?form=1` ("Write it myself"), it is today's untitled draft in the editor. */
export default function NewPostPage() {
  const overview = useFocusOverview();
  const plain = useSearchParams().get("form") === "1";
  const first = overview?.first.post;
  const focus = !!overview?.enabled && !!first && !plain;
  return (
    <>
      {/* The skeleton stays while the untitled draft is made. */}
      <PageState
        loading={!focus}
        skeleton={<SkeletonForm fields={4} className="mx-auto max-w-3xl p-6" />}
        className="mx-auto max-w-3xl p-6"
      >
        {first && (
          <FocusStart kind="post" question={first}>
            <PostSlots />
          </FocusStart>
        )}
      </PageState>
      {overview !== null && !focus && <UntitledDraft />}
    </>
  );
}

/** Today's New post: an untitled draft, made once, and the editor on it in
 *  this page's place (Back is the blog list, never a second draft). */
function UntitledDraft() {
  const t = useTranslations("admin.blog");
  const router = useRouter();
  const made = useRef(false);
  useEffect(() => {
    if (made.current) return;
    made.current = true;
    clearActiveCreation(0); // from the focus screen's "Write it myself"
    createPost({ title: t("untitled") })
      .then((post) => router.replace(`/admin/blog/${post.id}`))
      .catch(() => {
        toast.error(t("errGeneric"));
        router.replace("/admin/blog");
      });
  }, [router, t]);
  return null;
}

/** The post page, still empty, before her first answer makes the draft. */
function PostSlots() {
  const t = useTranslations("admin.blog");
  const slot = "rounded-md border border-dashed border-border bg-muted/30";
  return (
    <Card aria-hidden>
      <CardContent className="space-y-4 pt-6">
        <p className="text-xs font-medium text-muted-foreground">
          {t("coverLabel")}
        </p>
        <div className={`aspect-[3/1] w-full ${slot}`} />
        <div className={`h-10 ${slot}`} />
        <div className={`h-14 ${slot}`} />
        <div className={`h-64 ${slot}`} />
      </CardContent>
    </Card>
  );
}
