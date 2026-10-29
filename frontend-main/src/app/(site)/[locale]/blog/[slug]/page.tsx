import { notFound } from "next/navigation";

import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { BlogCover } from "@/components/blog/blog-cover";
import { ReadingProgress } from "@/components/blog/reading-progress";
import { getAuthUser } from "@/lib/auth";
import { fetchPlatformPost, postLanguage, postPath } from "@/lib/platform-blog";
import { getLocale, getTranslations } from "next-intl/server";
import { ogLocale } from "@shared/i18n/locales";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const post = await fetchPlatformPost(slug);
  if (!post) return {};
  const t = await getTranslations({ locale, namespace: "common.meta" });
  return {
    title: t("postTitle", { title: post.title }),
    description: post.meta_description || post.excerpt,
    // A post is written in one language and lives at that language's address:
    // the same article under another prefix is a copy, so it points there too.
    alternates: { canonical: postPath(post) },
    openGraph: {
      locale: ogLocale(postLanguage(post)),
      title: post.title,
      description: post.meta_description || post.excerpt,
      type: "article",
      // A post without a cover shares the site card instead of no image.
      images: [post.cover_photo_url || "/og.jpg"],
    },
  };
}

export default async function PlatformBlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = await getLocale();
  const { slug } = await params;
  const [user, post] = await Promise.all([
    getAuthUser(),
    fetchPlatformPost(slug),
  ]);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    inLanguage: postLanguage(post),
    datePublished: post.published_at,
    author: { "@type": "Organization", name: "Contentor" },
    ...(post.cover_photo_url ? { image: post.cover_photo_url } : {}),
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <ReadingProgress targetId="post-body" />
      <main className="flex-1 pb-20 pt-10 md:pt-14">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <article>
          <header className="mx-auto max-w-text px-6 text-center">
            <time
              className="text-caption text-muted-foreground"
              dateTime={post.published_at}
            >
              {new Date(post.published_at).toLocaleDateString(locale)}
            </time>
            <h1 className="mt-3 text-display-2 text-balance text-foreground">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mx-auto mt-4 max-w-[640px] text-body-lg text-balance text-muted-foreground">
                {post.excerpt}
              </p>
            )}
          </header>
          <div className="mx-auto mt-10 max-w-text px-6 md:mt-14">
            <BlogCover post={post} priority />
          </div>
          {/* 680 px measure: 680 of text + 24 px gutters (spec 5.5). */}
          <div
            id="post-body"
            className="prose prose-tokens mx-auto mt-12 max-w-[728px] px-6 text-body md:mt-16"
            // Server-sanitized (nh3) before persisting — see
            // apps/blog/ai.py render_body(). Only place body_html is trusted.
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: post.body_html ?? "" }}
          />
        </article>
      </main>
      <PlatformFooter />
    </div>
  );
}
