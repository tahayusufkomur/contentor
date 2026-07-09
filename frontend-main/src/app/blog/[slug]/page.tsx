import { notFound } from "next/navigation";

import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { getAuthUser } from "@/lib/auth";
import { fetchPlatformPost } from "@/lib/platform-blog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await fetchPlatformPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Contentor`,
    description: post.meta_description || post.excerpt,
    openGraph: {
      title: post.title,
      description: post.meta_description || post.excerpt,
      type: "article",
    },
  };
}

export default async function PlatformBlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [user, post] = await Promise.all([getAuthUser(), fetchPlatformPost(slug)]);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    datePublished: post.published_at,
    author: { "@type": "Organization", name: "Contentor" },
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-32">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <article>
          <h1 className="text-3xl font-bold">{post.title}</h1>
          <time
            className="mt-2 block text-sm text-muted-foreground"
            dateTime={post.published_at}
          >
            {new Date(post.published_at).toLocaleDateString()}
          </time>
          <div
            className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
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
