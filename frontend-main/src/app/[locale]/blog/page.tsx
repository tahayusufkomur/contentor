import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { LocaleNavLink } from "@/i18n/navigation";
import { BlogCover } from "@/components/blog/blog-cover";
import { getAuthUser } from "@/lib/auth";
import { fetchPlatformPosts } from "@/lib/platform-blog";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog — Contentor",
  description:
    "Guides and ideas for creators building an online business with Contentor.",
};

const formatDate = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale);

export default async function PlatformBlogIndexPage() {
  const locale = await getLocale();
  const [user, posts] = await Promise.all([
    getAuthUser(),
    fetchPlatformPosts(),
  ]);
  // The API orders by -published_at: the first post is the newest.
  const [latest, ...rest] = posts;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <main className="flex-1 pb-20 pt-10 md:pt-14">
        <h1 className="mx-auto max-w-media px-6 text-eyebrow text-muted-foreground">
          Blog
        </h1>

        {!latest && (
          <p className="mx-auto max-w-text px-6 pt-16 text-body text-muted-foreground">
            No posts yet.
          </p>
        )}

        {latest && (
          <LocaleNavLink
            href={`/blog/${latest.slug}`}
            className="group mx-auto mt-6 block max-w-media px-6"
          >
            <BlogCover post={latest} priority />
            <div className="mx-auto mt-8 max-w-text text-center md:mt-10">
              <time
                className="text-caption text-muted-foreground"
                dateTime={latest.published_at}
              >
                {formatDate(latest.published_at, locale)}
              </time>
              <h2 className="mt-3 text-display-2 text-balance text-foreground decoration-1 underline-offset-8 group-hover:underline">
                {latest.title}
              </h2>
              <p className="mx-auto mt-4 max-w-[640px] text-body-lg text-balance text-muted-foreground">
                {latest.excerpt}
              </p>
            </div>
          </LocaleNavLink>
        )}

        {rest.length > 0 && (
          <ul className="mx-auto mt-20 grid max-w-media gap-x-6 gap-y-14 px-6 md:mt-28 md:grid-cols-3">
            {rest.map((post) => (
              <li key={post.slug}>
                <LocaleNavLink
                  href={`/blog/${post.slug}`}
                  className="group block"
                >
                  <BlogCover post={post} />
                  <time
                    className="mt-5 block text-caption text-muted-foreground"
                    dateTime={post.published_at}
                  >
                    {formatDate(post.published_at, locale)}
                  </time>
                  <h3 className="mt-2 text-title-2 text-balance text-foreground decoration-1 underline-offset-4 group-hover:underline">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-body text-muted-foreground">
                    {post.excerpt}
                  </p>
                </LocaleNavLink>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PlatformFooter />
    </div>
  );
}
