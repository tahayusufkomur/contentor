import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  H2,
  H3,
  Kicker,
  Opener,
  Section,
  WindowChrome,
  WRAP,
  pad2,
  str,
} from "./ui";

type Step = { title?: string; text?: string };

/** Step-by-step methodology structured as a vertical Git commit pipeline. */
export function HowItWorksPipeline({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const pipeline = (
    <div className="relative border-l-2 border-border pl-6 sm:pl-8 space-y-10">
      {steps.map((s, i) => {
        return (
          <div key={i} className="relative">
            {/* Git commit node dot */}
            <span
              className="absolute -left-[1.95rem] top-1.5 size-3.5 rounded-full border-2 border-primary bg-background ring-4 ring-background sm:-left-[2.45rem]"
              aria-hidden="true"
            />

            {/* Step number */}
            <div
              className="font-mono text-xs font-bold text-accent"
              aria-hidden="true"
            >
              {pad2(i)}
            </div>

            <div className="mt-2">
              <h3
                className={cn(
                  H3,
                  "text-[1.25rem] leading-snug md:text-[1.4rem]",
                )}
              >
                <span className="sr-only">{`Step ${i + 1}: `}</span>
                {s.title}
              </h3>

              {s.text && (
                <p className="mt-2 max-w-[48ch] text-[1rem] leading-[1.7] text-muted-foreground">
                  {s.text}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Section tone="console" label={alt}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <div className="lg:col-span-6">
              <Kicker block={block} editable={editable} />
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(H2, "mt-3 block max-w-[20ch]")}
              />
              <Txt
                block={block}
                field="intro"
                editable={editable}
                as="p"
                placeholder="Intro"
                className="mt-6 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
              />

              <div className="mt-12">{pipeline}</div>
            </div>

            <figure className="lg:col-span-6">
              <WindowChrome
                bodyClassName="p-0 overflow-hidden"
                className="lg:sticky lg:top-24"
              >
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </WindowChrome>
            </figure>
          </div>
        ) : (
          <>
            <Opener block={block} editable={editable} />
            <div className="mt-14 max-w-3xl">{pipeline}</div>
          </>
        )}
      </div>
    </Section>
  );
}
