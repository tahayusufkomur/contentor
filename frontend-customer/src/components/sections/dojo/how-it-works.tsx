import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  H2,
  H3,
  Kicker,
  LABEL,
  Opener,
  Section,
  WRAP,
  beltColor,
  beltRank,
  str,
} from "./ui";

type Step = { title?: string; text?: string };

/** Step-by-step path laid out with belt-coloured nodes (horizontal on desktop, vertical on mobile). */
export function HowItWorksPath({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label={alt || "The Path"}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-12">
            <div className="lg:col-span-8">
              <Kicker block={block} editable={editable} />
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(H2, "mt-3.5 block max-w-[20ch]")}
              />
              <Txt
                block={block}
                field="intro"
                editable={editable}
                as="p"
                placeholder="Intro"
                className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.68] text-muted-foreground"
              />
            </div>
            <figure className="lg:col-span-4">
              <div className="dojo-photo border border-border bg-background p-2 max-w-[14rem] lg:ml-auto">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </div>
            </figure>
          </div>
        ) : (
          <Opener block={block} editable={editable} />
        )}

        {/* Path / Progression Steps */}
        <div className="mt-16">
          {/* Desktop horizontal path */}
          <div className="hidden lg:block relative">
            <div
              aria-hidden="true"
              className="absolute top-4 inset-x-6 h-0.5 bg-border -z-0"
            />
            <ol
              className="grid gap-8"
              style={{
                gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))`,
              }}
            >
              {steps.map((s, i) => (
                <li key={i} className="relative z-10 flex flex-col pt-1">
                  <div className="flex items-center">
                    <span
                      aria-hidden="true"
                      className="size-7 rounded-full border-2 border-background flex items-center justify-center font-bold text-[0.72rem] text-primary-foreground shadow-sm select-none"
                      style={{
                        backgroundColor: beltColor(i),
                        color: i === 0 ? "#18181b" : "#ffffff",
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <p className={cn(LABEL, "mt-5 text-accent")}>
                    {beltRank(i).split(" ")[0]} · Step {i + 1}
                  </p>
                  <h3
                    className={cn(
                      H3,
                      "mt-2 text-[1.2rem] leading-snug text-foreground",
                    )}
                  >
                    <span className="sr-only">{`Step ${i + 1}: `}</span>
                    {s.title}
                  </h3>
                  {s.text && (
                    <p className="mt-2 text-[0.95rem] leading-[1.65] text-muted-foreground">
                      {s.text}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Mobile vertical path */}
          <ol className="lg:hidden relative border-l-2 border-border pl-6 ml-3 space-y-10">
            {steps.map((s, i) => (
              <li key={i} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[2.15rem] top-0 size-7 rounded-full border-2 border-background flex items-center justify-center font-bold text-[0.72rem] shadow-sm select-none"
                  style={{
                    backgroundColor: beltColor(i),
                    color: i === 0 ? "#18181b" : "#ffffff",
                  }}
                >
                  {i + 1}
                </span>
                <p className={cn(LABEL, "text-accent")}>
                  {beltRank(i).split(" ")[0]} · Step {i + 1}
                </p>
                <h3
                  className={cn(
                    H3,
                    "mt-1.5 text-[1.2rem] leading-snug text-foreground",
                  )}
                >
                  <span className="sr-only">{`Step ${i + 1}: `}</span>
                  {s.title}
                </h3>
                {s.text && (
                  <p className="mt-2 text-[0.95rem] leading-[1.65] text-muted-foreground">
                    {s.text}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}
