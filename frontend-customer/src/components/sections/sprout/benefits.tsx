import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  BlobImage,
  GrowthPlantDoodle,
  GrowthSproutDoodle,
  GrowthTreeDoodle,
  H3,
  Opener,
  Section,
  WRAP,
  getSproutTint,
  str,
} from "./ui";

type Item = { title?: string; text?: string };

function GrowthIcon({ index }: { index: number }) {
  const stage = index % 3;
  if (stage === 0) return <GrowthSproutDoodle />;
  if (stage === 1) return <GrowthPlantDoodle />;
  return <GrowthTreeDoodle />;
}

/** Benefits framed as growth stages from seedling to blossoming tree. */
export function BenefitsGrowth({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="paper" label={alt || "Benefits"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} align="left" />

        <div
          className={cn(
            "mt-12 grid gap-6 md:gap-8",
            showImage
              ? "lg:grid-cols-12 lg:items-start"
              : items.length === 4
                ? "sm:grid-cols-2 lg:grid-cols-4"
                : "sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {showImage && (
            <div className="lg:col-span-4 lg:sticky lg:top-24">
              <BlobImage
                value={block.image}
                alt={alt}
                variant={3}
                offsetColor="accent"
              />
            </div>
          )}

          <div
            className={cn(
              showImage
                ? "grid gap-6 sm:grid-cols-2 lg:col-span-8"
                : "contents",
            )}
          >
            {items.map((it, i) => (
              <div
                key={i}
                className={cn(
                  "relative flex flex-col justify-between rounded-[2rem] border border-[color-mix(in_oklch,var(--border)_70%,transparent)] p-7 transition-all duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-md",
                  getSproutTint(i),
                )}
              >
                <div>
                  <GrowthIcon index={i} />
                  <h3
                    className={cn(
                      H3,
                      "mt-5 text-[1.25rem] font-bold leading-snug text-foreground md:text-[1.35rem]",
                    )}
                  >
                    {it.title}
                  </h3>
                  {it.text && (
                    <p className="mt-2.5 max-w-[42ch] text-[0.98rem] leading-[1.65] text-muted-foreground">
                      {it.text}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
