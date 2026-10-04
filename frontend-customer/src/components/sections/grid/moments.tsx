import { cn } from "@/lib/utils";
import { Img, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, pad } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Strict equal tiles, each with a numbered mono caption. */
export function MomentsTiles({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = String(block.heading ?? block.caption ?? "");
  return (
    <Sheet>
      <Head block={block} editable={editable} intro="caption" />
      <ul
        className={cn(
          "mt-14 grid grid-cols-2 gap-x-4 gap-y-8 md:mt-20 md:gap-x-6 md:gap-y-12",
          photos.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        {photos.map((p, i) => (
          <li key={i}>
            <figure>
              <Img value={p.image} alt={p.caption || alt} className="swiss-photo aspect-[4/5] w-full" />
              <figcaption className="swiss-mono mt-3 flex gap-3 border-t border-foreground pt-2">
                <span>({pad(i + 1)})</span>
                {p.caption ? <span className="text-muted-foreground">{p.caption}</span> : null}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
