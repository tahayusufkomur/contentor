import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Asymmetric training collage with one tall and one wide focal photo. */
export function MomentsTraining({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead =
    has(block, "heading", editable) || has(block, "kicker", editable);
  const showCaption = has(block, "caption", editable);

  return (
    <Section label={alt || "Training Moments"}>
      <div className={WRAP}>
        {(showHead || showCaption) && (
          <Opener
            block={block}
            editable={editable}
            field="caption"
            className="mb-14"
          />
        )}

        {photos.length > 0 && (
          <div className="space-y-8">
            {/* Primary Asymmetric Duo: First photo Tall, Second photo Wide */}
            {photos.length >= 2 ? (
              <div className="grid gap-8 lg:grid-cols-12 lg:items-stretch">
                <figure className="lg:col-span-5 flex flex-col">
                  <div className="dojo-photo border border-border bg-background p-2.5 shadow-sm h-full flex-1">
                    <Img
                      value={photos[0].image}
                      alt={photos[0].caption || alt}
                      className="aspect-[3/4] w-full h-full"
                    />
                  </div>
                  {photos[0].caption && (
                    <figcaption className="mt-3 text-[0.8rem] font-medium tracking-wide text-muted-foreground">
                      {photos[0].caption}
                    </figcaption>
                  )}
                </figure>

                <figure className="lg:col-span-7 flex flex-col">
                  <div className="dojo-photo border border-border bg-background p-2.5 shadow-sm h-full flex-1">
                    <Img
                      value={photos[1].image}
                      alt={photos[1].caption || alt}
                      className="aspect-[16/10] w-full h-full"
                    />
                  </div>
                  {photos[1].caption && (
                    <figcaption className="mt-3 text-[0.8rem] font-medium tracking-wide text-muted-foreground">
                      {photos[1].caption}
                    </figcaption>
                  )}
                </figure>
              </div>
            ) : (
              <figure className="max-w-2xl mx-auto">
                <div className="dojo-photo border border-border bg-background p-2.5 shadow-sm">
                  <Img
                    value={photos[0].image}
                    alt={photos[0].caption || alt}
                    className="aspect-[16/9] w-full"
                  />
                </div>
                {photos[0].caption && (
                  <figcaption className="mt-3 text-center text-[0.8rem] font-medium tracking-wide text-muted-foreground">
                    {photos[0].caption}
                  </figcaption>
                )}
              </figure>
            )}

            {/* Remaining photos in balanced grid */}
            {photos.length > 2 && (
              <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 pt-4 border-t border-border/60">
                {photos.slice(2).map((p, i) => (
                  <li key={i + 2}>
                    <figure>
                      <div className="dojo-photo border border-border bg-background p-2 shadow-sm">
                        <Img
                          value={p.image}
                          alt={p.caption || alt}
                          className="aspect-[4/5] w-full"
                        />
                      </div>
                      {p.caption && (
                        <figcaption className="mt-2.5 text-[0.78rem] text-muted-foreground line-clamp-1">
                          {p.caption}
                        </figcaption>
                      )}
                    </figure>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
