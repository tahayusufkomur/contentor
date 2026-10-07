import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, Opener, Section, WRAP, pad2, str } from "./ui";

type Step = { title?: string; text?: string };

/** The method: numbered recipe steps with tomato numerals and dotted rules. */
export function HowItWorksMethod({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label={alt}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-10">
            <div className="lg:col-span-8">
              <Opener block={block} editable={editable} />
            </div>
            <div className="lg:col-span-3 lg:col-start-10">
              <Img
                value={block.image}
                alt={alt}
                className="tavola-photo aspect-[4/5] w-full max-w-[14rem] rounded-[var(--radius)] lg:ml-auto"
              />
            </div>
          </div>
        ) : (
          <Opener block={block} editable={editable} />
        )}

        <ol className="mt-14 grid gap-x-12 lg:grid-cols-2">
          {steps.map((s, i) => (
            <li
              key={i}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-5 border-b-2 border-dotted border-border py-7"
            >
              <span
                aria-hidden="true"
                className="font-display text-[2.6rem] leading-none text-accent"
              >
                {pad2(i)}
              </span>
              <div className="min-w-0">
                <h3 className={cn(H3, "text-[1.35rem]")}>
                  <span className="sr-only">{`Step ${i + 1}: `}</span>
                  {s.title}
                </h3>
                <p className="mt-2 max-w-[40ch] text-[1rem] leading-[1.65] text-muted-foreground">
                  {s.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
