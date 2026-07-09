import Link from "next/link";

import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { fetchPublishedPosts } from "@/lib/blog-public";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const brand = config?.brand_name ?? "";
  return {
    title: brand ? `Blog — ${brand}` : "Blog",
    description: config?.meta_description ?? "",
  };
}

export default async function BlogIndexPage() {
  const posts = await fetchPublishedPosts();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold mb-8">Blog</h1>
      {posts.length === 0 && (
        <p className="text-muted-foreground">No posts yet.</p>
      )}
      <ul className="space-y-8">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="group block">
              <h2 className="text-xl font-semibold group-hover:underline">
                {post.title}
              </h2>
              <p className="mt-1 text-muted-foreground">{post.excerpt}</p>
              <time
                className="text-sm text-muted-foreground"
                dateTime={post.published_at}
              >
                {new Date(post.published_at).toLocaleDateString()}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
