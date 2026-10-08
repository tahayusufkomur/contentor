import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Section, WindowChrome, WRAP, pad2, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Behind-the-scenes classroom moments framed as captured terminal viewports. */
export function MomentsScreens({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead =
    has(block, "heading", editable) || has(block, "kicker", editable);
  const showCaption = has(block, "caption", editable);

  return (
    <Section tone="console" label={alt || "Moments"}>
      <div className={WRAP}>
        {(showHead || showCaption) && (
          <Opener
            block={block}
            editable={editable}
            field="caption"
            className="mb-14"
          />
        )}

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 md:gap-8">
          {photos.map((p, i) => (
            <li
              key={i}
              className={cn(
                photos.length % 3 === 1 &&
                  i === photos.length - 1 &&
                  "sm:col-span-2 lg:col-span-1",
              )}
            >
              <WindowChrome
                title={`buffer_${pad2(i)}.png`}
                tag="FRAME"
                bodyClassName="p-0 overflow-hidden flex flex-col"
              >
                <Img
                  value={p.image}
                  alt={p.caption || alt}
                  className="aspect-[4/5] w-full"
                />
                {p.caption && (
                  <div className="border-t border-border bg-[color-mix(in_oklch,var(--background)_95%,var(--surface))] p-3 font-mono text-[0.8rem] text-muted-foreground">
                    <span
                      className="text-accent font-bold mr-1.5 select-none"
                      aria-hidden="true"
                    >
                      {"//"}
                    </span>
                    {p.caption}
                  </div>
                )}
              </WindowChrome>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
