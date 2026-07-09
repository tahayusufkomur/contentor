import { notFound } from "next/navigation";

import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { fetchPublishedPost } from "@/lib/blog-public";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await fetchPublishedPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.meta_description || post.excerpt,
    openGraph: {
      title: post.title,
      description: post.meta_description || post.excerpt,
      type: "article",
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenantSlug = await getTenantSlug();
  const [post, config] = await Promise.all([
    fetchPublishedPost(slug),
    fetchTenantConfig(tenantSlug),
  ]);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    datePublished: post.published_at,
    author: { "@type": "Organization", name: config?.brand_name ?? "" },
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="text-3xl font-bold">{post.title}</h1>
      <time
        className="mt-2 block text-sm text-muted-foreground"
        dateTime={post.published_at}
      >
        {new Date(post.published_at).toLocaleDateString()}
      </time>
      <div
        className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
        // Server-sanitized (nh3) before persisting — see apps/blog/ai.py
        // render_body(). This is the only place body_html is trusted.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: post.body_html ?? "" }}
      />
    </article>
  );
}
