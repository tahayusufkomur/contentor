import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, Opener, Section, WRAP, Waypoint, str } from "./ui";

type Step = { title?: string; text?: string };

/** Steps as trail waypoints: numbered discs along a dashed route line. */
export function HowItWorksWaypoints({ block, editable }: SectionProps) {
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
                className="trail-postcard aspect-[4/5] w-full max-w-[14rem] rotate-[2deg] lg:ml-auto"
              />
            </div>
          </div>
        ) : (
          <Opener block={block} editable={editable} />
        )}

        <ol className="mt-14 max-w-[44rem]">
          {steps.map((s, i) => (
            <li key={i} className="relative flex gap-5 pb-10 last:pb-0">
              <div className="flex flex-col items-center">
                <Waypoint n={i + 1} />
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="mt-2 w-0 flex-1 trail-route"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={cn(H3, "text-[1.3rem]")}>
                  <span className="sr-only">{`${i + 1}. `}</span>
                  {s.title}
                </h3>
                <p className="mt-2 max-w-[40ch] text-pretty text-[1rem] leading-[1.65] text-muted-foreground">
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
