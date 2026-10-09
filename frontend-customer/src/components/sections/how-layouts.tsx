import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Img, imageUrl, itemsOf } from "./kit";
import type { SectionComponent } from "./types";

type Step = { title?: string; text?: string };

/** What a style supplies so its "how it works" can be a vertical timeline or
 *  a row of columns: its own section shell, opener and marker styling. The
 *  structure is shared; the look is the style's. */
export interface HowKit {
  Section: ComponentType<{ label?: string; children: ReactNode }>;
  /** Optional sheet around the content (a paper page). */
  Frame?: ComponentType<{ children: ReactNode }>;
  wrap: string;
  /** The style's kicker + heading + intro block. */
  Opener: ComponentType<{ block: Block; editable?: EditableContext }>;
  /** Step title classes (font, weight; the size is set here). */
  h3: string;
  /** Step text classes. */
  text: string;
  /** Timeline: the numbered marker, and the colour classes of the rail. */
  dot?: string;
  rail?: string;
  /** Row: the numeral, and the rule above each column. */
  num?: string;
  rule?: string;
  /** Classes on the optional photo. */
  photo?: string;
}

const pad2 = (i: number) => String(i + 1).padStart(2, "0");
const Plain = ({ children }: { children: ReactNode }) => <>{children}</>;

/** Steps down a vertical rail, a numbered marker on each, the photo (when
 *  there is one) beside them. */
export function makeHowTimeline(k: HowKit): SectionComponent {
  return function HowTimeline({ block, editable }) {
    const steps = itemsOf<Step>(block, "steps");
    const alt = String(block.heading ?? "");
    const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
    const Frame = k.Frame ?? Plain;
    return (
      <k.Section label={alt}>
        <div className={k.wrap}>
          <Frame>
            <k.Opener block={block} editable={editable} />
            <div
              className={cn(
                "mt-14 grid items-start gap-y-12",
                showImage && "lg:grid-cols-12 lg:gap-x-12",
              )}
            >
              {showImage && (
                <Img
                  value={block.image}
                  alt={alt}
                  className={cn(
                    "aspect-[4/5] w-full max-w-xs lg:col-span-4 lg:max-w-none",
                    k.photo,
                  )}
                />
              )}
              <ol
                className={cn(
                  "relative space-y-10 before:absolute before:bottom-5 before:left-[1.1rem] before:top-5 before:w-px",
                  k.rail,
                  showImage && "lg:col-span-7 lg:col-start-6",
                )}
              >
                {steps.map((s, i) => (
                  <li key={i} className="relative flex items-start gap-6">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-[0.85rem]",
                        k.dot,
                      )}
                    >
                      {pad2(i)}
                    </span>
                    <div className="min-w-0 pt-1">
                      <h3
                        className={cn(
                          k.h3,
                          "text-[1.3rem] leading-snug md:text-[1.45rem]",
                        )}
                      >
                        <span className="sr-only">{`Step ${i + 1}: `}</span>
                        {s.title}
                      </h3>
                      {s.text && (
                        <p className={cn("mt-2 max-w-[48ch]", k.text)}>
                          {s.text}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Frame>
        </div>
      </k.Section>
    );
  };
}

/** Steps side by side as ruled columns, a large numeral over each; the photo
 *  (when there is one) as a wide band between the opener and the steps. */
export function makeHowRow(k: HowKit): SectionComponent {
  return function HowRow({ block, editable }) {
    const steps = itemsOf<Step>(block, "steps");
    const alt = String(block.heading ?? "");
    const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
    const Frame = k.Frame ?? Plain;
    return (
      <k.Section label={alt}>
        <div className={k.wrap}>
          <Frame>
            <k.Opener block={block} editable={editable} />
            {showImage && (
              <Img
                value={block.image}
                alt={alt}
                className={cn("mt-12 aspect-[21/9] w-full", k.photo)}
              />
            )}
            <ol
              className={cn(
                "mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2",
                steps.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
              )}
            >
              {steps.map((s, i) => (
                <li key={i} className={cn("border-t pt-6", k.rule)}>
                  <span aria-hidden="true" className={cn("block", k.num)}>
                    {pad2(i)}
                  </span>
                  <h3
                    className={cn(
                      k.h3,
                      "mt-5 text-[1.3rem] leading-snug md:text-[1.45rem]",
                    )}
                  >
                    <span className="sr-only">{`Step ${i + 1}: `}</span>
                    {s.title}
                  </h3>
                  {s.text && (
                    <p className={cn("mt-3 max-w-[40ch]", k.text)}>{s.text}</p>
                  )}
                </li>
              ))}
            </ol>
          </Frame>
        </div>
      </k.Section>
    );
  };
}
