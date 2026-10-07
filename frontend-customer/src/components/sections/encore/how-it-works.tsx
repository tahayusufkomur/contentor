import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  BOX,
  H2,
  H3,
  Kicker,
  LABEL,
  Opener,
  RULE,
  Section,
  WRAP,
  pad2,
  str,
} from "./ui";

type Step = { title?: string; text?: string };

/** How it works soundcheck: steps styled as mixer channels with LED indicators, channel labels and boxed borders. */
export function HowItWorksSoundcheck({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label={alt || "How it works"}>
      <div className={WRAP}>
        {showImage ? (
          <div
            className={cn(
              RULE,
              "grid gap-y-8 pt-5 lg:grid-cols-12 lg:items-center lg:gap-x-10",
            )}
          >
            <div className="lg:col-span-8">
              <Kicker block={block} editable={editable} />
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(H2, "mt-4 block max-w-[18ch]")}
              />
              <Txt
                block={block}
                field="intro"
                editable={editable}
                as="p"
                placeholder="Intro"
                className="mt-6 block max-w-[44ch] text-pretty text-[1.02rem] leading-[1.6] text-muted-foreground"
              />
            </div>
            <div className="lg:col-span-3 lg:col-start-10">
              <div
                className={cn(
                  BOX,
                  "encore-halftone relative max-w-[14rem] p-2 lg:ml-auto",
                )}
              >
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </div>
            </div>
          </div>
        ) : (
          <Opener block={block} editable={editable} />
        )}

        <ol
          className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-[repeat(var(--encore-cols),minmax(0,1fr))]"
          style={
            { "--encore-cols": Math.max(steps.length, 1) } as CSSProperties
          }
        >
          {steps.map((s, i) => (
            <li
              key={i}
              className={cn(BOX, "flex min-h-[13rem] flex-col p-5 md:p-6")}
            >
              <div className={cn(LABEL, "flex items-center justify-between")}>
                <span aria-hidden="true">CH {pad2(i)}</span>
                {i === 0 && (
                  <span aria-hidden="true" className="size-2.5 bg-accent" />
                )}
              </div>
              <h3 className={cn(H3, "mt-auto pt-8 text-[1.2rem] uppercase")}>
                <span className="sr-only">{`Step ${i + 1}: `}</span>
                {s.title}
              </h3>
              <p className="mt-2 text-[0.92rem] leading-[1.55] text-muted-foreground">
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
