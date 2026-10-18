import { Image as ImageIcon } from "lucide-react";
import { CoverArt } from "@/components/covers/cover-art";
import { cn } from "@/lib/utils";
import type { CoverDesign, CoverItem } from "@/types/design";

/** What a course or event series wears, in a 16:9 box: its kept design drawn live, else its plain photo,
 *  else an empty tile. CoverArt picks its own size from the box (a box under 180 px shows the photo
 *  alone). Decorative: the title is always printed beside it. */
export function CoverThumb({
  design,
  photoUrl,
  item,
  className,
}: {
  design?: CoverDesign | null;
  photoUrl?: string | null;
  item: CoverItem;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative aspect-video overflow-hidden rounded-md border bg-muted",
        className,
      )}
    >
      {design ? (
        <CoverArt design={design} item={item} />
      ) : photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
        </div>
      )}
    </div>
  );
}
