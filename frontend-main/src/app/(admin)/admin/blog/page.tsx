"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { BlogComposer } from "@/components/admin/blog-composer";
import {
  listPlatformPosts,
  type PlatformBlogPostAdmin,
} from "@/lib/platform-blog-admin";

export const dynamic = "force-dynamic";

export default function PlatformBlogAdminPage() {
  const [posts, setPosts] = useState<PlatformBlogPostAdmin[] | null>(null);
  const [lastGenerated, setLastGenerated] =
    useState<PlatformBlogPostAdmin | null>(null);

  useEffect(() => {
    listPlatformPosts()
      .then((r) => setPosts(r.results))
      .catch(() => setPosts([]));
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Blog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          contentor.app marketing blog. Generate a draft here, then edit and
          publish it from the Data section.
        </p>
      </div>

      <BlogComposer onGenerated={setLastGenerated} />

      {lastGenerated && (
        <div className="rounded-lg border border-dashed p-4 text-sm">
          Draft “{lastGenerated.title}” created.{" "}
          <Link
            href="/admin/m/platform-blog-posts"
            className="font-medium underline"
          >
            Edit it in Data → Platform Blog Posts
          </Link>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Published posts
        </h2>
        {posts === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No published posts yet.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {posts.map((post) => (
              <div
                key={post.id}
                className="flex items-center gap-3 p-3 text-sm"
              >
                <span className="flex-1 font-medium">{post.title}</span>
                <a
                  href={`https://contentor.app/blog/${post.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/admin/m/platform-blog-posts"
        className="inline-block text-sm font-medium underline"
      >
        See all posts (including drafts) in Data →
      </Link>
    </div>
  );
}
