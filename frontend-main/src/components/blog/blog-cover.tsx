import type { PlatformBlogPost } from "@/lib/platform-blog";
import { cn } from "@/lib/utils";

interface BlogCoverProps {
  post: Pick<PlatformBlogPost, "title" | "tags" | "cover_photo_url">;
  /** The index hero and the post cover load eagerly; grid tiles lazily. */
  priority?: boolean;
  className?: string;
}

/** 16:9 cover tile (spec 5.5). With a cover URL it is the picture; without
 * one — every platform post today — a tokenised tile: second paper, the
 * title's initial in hairline ink, the first tag as an eyebrow. Never a
 * broken image: the <img> is only rendered when there is a URL, and its
 * alt is empty, so a failed load paints nothing over the paper. */
export function BlogCover({
  post,
  priority = false,
  className,
}: BlogCoverProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-tile bg-muted",
        className,
      )}
      style={{ aspectRatio: "16 / 9" }}
    >
      {post.cover_photo_url ? (
        <img
          src={post.cover_photo_url}
          alt=""
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 p-6 md:p-8">
          <span className="select-none text-display text-border">
            {post.title.trim().charAt(0).toUpperCase() || "C"}
          </span>
          <span className="absolute bottom-6 left-6 text-eyebrow text-muted-foreground md:bottom-8 md:left-8">
            {post.tags[0] ?? "Blog"}
          </span>
        </div>
      )}
    </div>
  );
}
