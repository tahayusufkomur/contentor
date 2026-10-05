import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, PopSection, WRAP, str } from "./ui";

/** Plum block; the statement is set on chartreuse highlighter slabs. */
export function PhilosophyHighlight({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const withImage = Boolean(imageUrl(block.image));
  const size =
    statement.length > 140
      ? "text-[clamp(2rem,1rem+3vw,3.75rem)]"
      : statement.length > 60
        ? "text-[clamp(2.25rem,1rem+3.8vw,4.75rem)]"
        : "text-[clamp(3rem,1rem+6vw,7rem)]";
  return (
    <PopSection
      bg="var(--inverse)"
      fg="var(--inverse-foreground)"
      dark
      className="py-24 md:py-36"
    >
      <div
        className={cn(
          WRAP,
          "grid items-center gap-x-16 gap-y-14",
          withImage && "lg:grid-cols-12",
        )}
      >
        <figure className={cn(withImage ? "lg:col-span-7" : "max-w-6xl")}>
          <Kicker
            block={block}
            editable={editable}
            fill="pink"
            className="[--pop-ink:var(--inverse-foreground)]"
          />
          <blockquote
            className={cn("pop-display mt-8 !leading-[1.24] md:mt-10", size)}
          >
            <p>
              <Txt
                block={block}
                field="statement"
                editable={editable}
                className="pop-mark"
                placeholder="Statement"
              />
            </p>
          </blockquote>
          {has(block, "attribution", editable) && (
            <figcaption className="mt-10 flex items-center gap-4">
              <span
                aria-hidden="true"
                className="h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                className="pop-mono text-[0.9375rem]"
              />
            </figcaption>
          )}
        </figure>
        {withImage && (
          <div className="relative mx-auto w-full max-w-xl pr-3 lg:col-span-5">
            <div className="relative rotate-2 overflow-hidden rounded-[var(--pop-r)] border-2 border-[color:var(--inverse-foreground)] shadow-[6px_6px_0_var(--accent)]">
              <Img
                value={block.image}
                alt={statement}
                className="aspect-[4/3] w-full lg:aspect-[4/5]"
              />
            </div>
          </div>
        )}
      </div>
    </PopSection>
  );
}
