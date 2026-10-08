import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { NavLink } from "@/components/ui/nav-link";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import {
  fetchOwnerPreviewPost,
  fetchPublishedPost,
  fetchPublishedPosts,
} from "@/lib/blog-public";

export const dynamic = "force-dynamic";

const MORE_POSTS = 4;
const WORDS_PER_MINUTE = 225;

const PROSE =
  "prose prose-neutral dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-headings:scroll-mt-24 prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:leading-8 prose-p:mb-6 prose-strong:font-bold prose-strong:text-foreground prose-li:mb-2 prose-li:leading-7 prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-2 prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground prose-img:rounded-xl [&_figure.blog-inline-image]:my-10 [&_figure.blog-inline-image]:overflow-hidden [&_figure.blog-inline-image]:rounded-xl [&_figure.blog-inline-image]:border [&_figure.blog-inline-image_img]:my-0 [&_figure.blog-inline-image_img]:w-full [&_figure.blog-inline-image_img]:rounded-none [&_table]:w-full [&_th]:border-b [&_th]:bg-muted [&_th]:px-3 [&_th]:py-3 [&_th]:text-left [&_th]:text-sm [&_td]:border-b [&_td]:px-3 [&_td]:py-3 [&_td]:text-sm [&_a[href^='http']]:after:content-['_↗'] [&_a[href^='http']]:after:text-xs [&_a[href^='http']]:after:opacity-60";

const CHIP =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground";

type Heading = { id: string; text: string; level: 2 | 3 };

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Gives every h2/h3 an anchor id and lists them for the contents box. */
function withAnchors(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();
  const out = html.replace(
    /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi,
    (_m, level: string, attrs: string | undefined, inner: string) => {
      const text = plain(inner);
      const base =
        text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "section";
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      headings.push({ id, text, level: level === "2" ? 2 : 3 });
      const rest = (attrs ?? "").replace(/\sid="[^"]*"/i, "");
      return `<h${level} id="${id}"${rest}>${inner}</h${level}>`;
    },
  );
  return { html: out, headings };
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post =
    (await fetchPublishedPost(slug)) ?? (await fetchOwnerPreviewPost(slug));
  if (!post) return {};
  return {
    title: post.title,
    description: post.meta_description || post.excerpt,
    robots: post.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: post.title,
      description: post.meta_description || post.excerpt,
      type: "article",
    },
  };
}

function Contents({ headings }: { headings: Heading[] }) {
  const links = (
    <ul className="flex flex-col gap-0.5 text-sm">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            className={`-mx-2 flex min-h-10 items-start gap-1.5 rounded-md px-2 py-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary ${h.level === 3 ? "pl-5" : ""}`}
          >
            <span aria-hidden className="mt-0.5">
              {h.level === 3 ? "↳" : "▸"}
            </span>
            <span>{h.text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
  const label = (
    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      📖 Contents
    </span>
  );
  return (
    <nav
      aria-label="Table of contents"
      className="mb-8 rounded-lg border bg-muted/20 lg:sticky lg:top-24 lg:order-1 lg:mb-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:p-5"
    >
      <details className="lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
          {label}
          <span aria-hidden className="text-muted-foreground">
            ▾
          </span>
        </summary>
        <div className="border-t px-4 pb-4 pt-2">{links}</div>
      </details>
      <div className="hidden lg:block">
        <p className="mb-3">{label}</p>
        {links}
      </div>
    </nav>
  );
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenantSlug = await getTenantSlug();
  const [published, config, posts, hdrs] = await Promise.all([
    fetchPublishedPost(slug),
    fetchTenantConfig(tenantSlug),
    fetchPublishedPosts(),
    headers(),
  ]);
  // Drafts are visible to the coach only (guided setup preview).
  const post = published ?? (await fetchOwnerPreviewPost(slug));
  if (!post) notFound();

  const brand = config?.brand_name || "Blog";
  // Server-sanitized (nh3) before persisting — see apps/blog/ai.py
  // render_body(). This is the only place body_html is trusted.
  const { html, headings } = withAnchors(post.body_html ?? "");
  const minutes = Math.max(
    1,
    Math.ceil(plain(html).split(" ").length / WORDS_PER_MINUTE),
  );
  const tag = post.tags?.[0];
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const url = encodeURIComponent(`${proto}://${host}/blog/${post.slug}`);
  const title = encodeURIComponent(post.title);
  const shares = [
    [
      "🐦 Share on X",
      `https://twitter.com/intent/tweet?text=${title}&url=${url}`,
    ],
    [
      "💼 LinkedIn",
      `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    ],
    ["📘 Facebook", `https://www.facebook.com/sharer/sharer.php?u=${url}`],
    ["💬 WhatsApp", `https://wa.me/?text=${title}%20${url}`],
  ];
  const more = posts.filter((p) => p.slug !== post.slug).slice(0, MORE_POSTS);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    datePublished: post.published_at,
    author: { "@type": "Organization", name: config?.brand_name ?? "" },
    ...(post.cover_photo_url ? { image: post.cover_photo_url } : {}),
  };

  return (
    <article className="mx-auto max-w-6xl sm:py-6">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-3xl">
        <NavLink
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {brand}
        </NavLink>
        {post.cover_photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_photo_url}
            alt=""
            className="mt-6 aspect-[1200/627] w-full rounded-xl border object-cover shadow-sm"
          />
        )}
        <header className="mb-10 mt-8 border-b pb-10">
          {tag && (
            <div className="mb-4 flex items-center gap-2">
              <span className={CHIP}>🏷️ {tag}</span>
            </div>
          )}
          <h1 className="mb-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mb-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {post.excerpt}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <NavLink
              href="/blog"
              className="font-medium text-foreground transition-colors hover:text-primary"
            >
              {brand}
            </NavLink>
            {post.published_at && (
              <time dateTime={post.published_at}>
                📅 {longDate(post.published_at)}
              </time>
            )}
            <span>⏱️ {minutes} min read</span>
          </div>
        </header>
      </div>

      <div
        className={
          headings.length
            ? "lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-12"
            : ""
        }
      >
        {headings.length > 0 && <Contents headings={headings} />}
        <div className="mx-auto w-full max-w-3xl lg:order-2">
          <div
            className={PROSE}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <div className="mt-16 rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground ring-2 ring-primary/20">
                {config?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={config.logo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  brand.slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm">
                  <span className="text-muted-foreground">✍️ Written by </span>
                  <NavLink
                    href="/"
                    className="font-semibold transition-colors hover:text-primary"
                  >
                    {brand}
                  </NavLink>
                </p>
                {config?.meta_description && (
                  <p className="text-sm text-muted-foreground">
                    {config.meta_description}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-10">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              📢 Share this article
            </p>
            <div className="flex flex-wrap gap-2">
              {shares.map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          {more.length > 0 && (
            <div className="mt-16 border-t pt-10">
              <h2 className="mb-6 text-base font-semibold">📚 More articles</h2>
              <div className="flex flex-col gap-5">
                {more.map((p) => (
                  <div key={p.slug} className="group flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {p.tags?.[0] && <span className={CHIP}>{p.tags[0]}</span>}
                      {p.published_at && (
                        <span className="text-xs text-muted-foreground">
                          {longDate(p.published_at)}
                        </span>
                      )}
                    </div>
                    <NavLink
                      href={`/blog/${p.slug}`}
                      className="text-sm font-semibold leading-snug transition-colors group-hover:text-primary"
                    >
                      {p.title}
                    </NavLink>
                    {p.excerpt && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {p.excerpt}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
