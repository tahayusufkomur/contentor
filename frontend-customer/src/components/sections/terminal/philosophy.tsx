import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, Section, WindowChrome, WRAP, str } from "./ui";

function statementSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.2rem,1.3rem+3.8vw,4.8rem)] leading-[1.06] max-w-[18ch]";
  if (len <= 140)
    return "text-[clamp(1.85rem,1.2rem+2.4vw,3.6rem)] leading-[1.12] max-w-[24ch]";
  return "text-[clamp(1.6rem,1.1rem+1.6vw,2.8rem)] leading-[1.18] max-w-[30ch]";
}

/** Core philosophy and guiding principles formatted as an executable docblock. */
export function PhilosophyPrinciples({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="console" label="Philosophy">
      <div className={WRAP}>
        <WindowChrome
          title="~/principles/core.ts"
          tag="DOCS"
          bodyClassName="p-6 sm:p-10 md:p-12 font-mono"
        >
          <div className="text-primary opacity-70 select-none text-lg">{"/**"}</div>

          <div className="my-4 pl-4 sm:pl-6 border-l-2 border-primary/30">
            <Kicker block={block} editable={editable} className="mb-4" />

            <div className="flex items-start gap-3">
              <span
                className="text-primary font-bold select-none text-xl sm:text-2xl"
                aria-hidden="true"
              >
                *
              </span>
              <Txt
                block={block}
                field="statement"
                editable={editable}
                as="p"
                placeholder="Statement"
                className={cn(
                  "block text-balance break-words font-display font-bold tracking-[-0.03em] text-foreground",
                  statementSize(statement.length),
                )}
              />
            </div>
          </div>

          <div className="text-primary opacity-70 select-none text-lg">
            &nbsp;*/
          </div>

          {has(block, "attribution", editable) && (
            <div className="mt-8 flex items-center gap-2 font-mono text-[0.95rem] text-accent">
              <span
                className="text-muted-foreground select-none"
                aria-hidden="true"
              >
                {"// @author"}
              </span>
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                placeholder="Attribution"
                className="font-bold"
              />
            </div>
          )}

          {showImage && (
            <div className="mt-10">
              <WindowChrome
                title="environment_shot.raw"
                tag="16:9"
                bodyClassName="p-0 overflow-hidden"
              >
                <Img
                  value={block.image}
                  alt={statement.slice(0, 120)}
                  className="aspect-[16/9] w-full"
                />
              </WindowChrome>
            </div>
          )}
        </WindowChrome>
      </div>
    </Section>
  );
}
