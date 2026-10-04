import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { DISPLAY, Kicker, LABEL, WRAP } from "./ui";

/** The manifesto: one statement in giant caps on black, angled top edge. */
export function PhilosophyStatement({ block, editable }: SectionProps) {
  const statement = typeof block.statement === "string" ? block.statement : "";
  const size =
    statement.length <= 40
      ? "text-[clamp(3.5rem,1rem+11vw,12rem)]"
      : statement.length <= 120
        ? "text-[clamp(2.6rem,1rem+6vw,8rem)]"
        : "text-[clamp(2.4rem,1rem+5vw,7rem)]";

  return (
    <section className="kinetic-ink relative isolate">
      <div aria-hidden="true" className="kinetic-wedge" />
      {imageUrl(block.image) && (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <Img
            value={block.image}
            alt=""
            className="absolute inset-0 bg-[var(--inverse)]"
            imgClassName="grayscale contrast-[1.25] opacity-50"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(to_right,var(--inverse)_25%,color-mix(in_oklch,var(--inverse)_40%,transparent))]"
          />
        </div>
      )}
      <div className={cn(WRAP, "py-24 md:py-40")}>
        <Kicker block={block} editable={editable} />
        <blockquote className="mt-8">
          <Txt
            block={block}
            field="statement"
            editable={editable}
            as="p"
            className={cn(DISPLAY, size, "max-w-[24ch]")}
          />
        </blockquote>
        {has(block, "attribution", editable) && (
          <div className="mt-12 flex items-center gap-4">
            <span aria-hidden="true" className="h-1 w-14 bg-primary" />
            <Txt
              block={block}
              field="attribution"
              editable={editable}
              as="p"
              className={cn(LABEL, "text-[0.8rem] text-accent")}
            />
          </div>
        )}
      </div>
    </section>
  );
}
