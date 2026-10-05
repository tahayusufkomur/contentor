import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, pad, row } from "./ui";

type Step = { title?: string; text?: string };

/** Steps as ruled columns: number, a big title, one line of text. */
export function HowItWorksRuled({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const photo = imageUrl(block.image);
  const cols = photo
    ? steps.length === 4
      ? "sm:grid-cols-2"
      : "sm:grid-cols-3"
    : steps.length === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : "sm:grid-cols-3";
  return (
    <Sheet tone="fog">
      <Head block={block} editable={editable} />
      <div className={cn(row, "mt-14 gap-y-10 md:mt-20")}>
        {photo && (
          <Img
            value={block.image}
            alt={String(block.heading ?? "")}
            className="swiss-photo col-span-6 aspect-[4/5] md:col-span-3 md:self-start"
          />
        )}
        <ol
          className={cn(
            "col-span-12 grid gap-x-4 gap-y-12 md:gap-x-6",
            photo && "md:col-span-9 md:col-start-4",
            cols,
          )}
        >
          {steps.map((s, i) => (
            <li key={i} className="border-t border-foreground pt-3">
              <span className="swiss-mono block">({pad(i + 1)})</span>
              <h3 className="swiss-step mt-10 text-balance md:mt-16">
                {s.title}
              </h3>
              <p className="mt-4 max-w-[36ch] leading-[1.5] text-muted-foreground">
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}
