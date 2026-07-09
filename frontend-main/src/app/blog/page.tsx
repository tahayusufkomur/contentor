import Link from "next/link";

import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { getAuthUser } from "@/lib/auth";
import { fetchPlatformPosts } from "@/lib/platform-blog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog — Contentor",
  description:
    "Guides and ideas for coaches and creators building an online business with Contentor.",
};

export default async function PlatformBlogIndexPage() {
  const [user, posts] = await Promise.all([getAuthUser(), fetchPlatformPosts()]);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-32">
        <h1 className="text-3xl font-bold">Blog</h1>
        {posts.length === 0 && (
          <p className="mt-8 text-muted-foreground">No posts yet.</p>
        )}
        <ul className="mt-8 space-y-8">
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
      </main>
      <PlatformFooter />
    </div>
  );
}
