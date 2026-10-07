import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, LABEL, Section, WRAP, str } from "./ui";

function statementSize(len: number) {
  if (len <= 60)
    return "text-[clamp(1.9rem,1.3rem+2.4vw,3.6rem)] leading-[1.2]";
  if (len <= 140)
    return "text-[clamp(1.5rem,1.15rem+1.5vw,2.6rem)] leading-[1.3]";
  return "text-[clamp(1.25rem,1.05rem+0.9vw,1.9rem)] leading-[1.45]";
}

/** Philosophy wall text on a neutral gallery surface with optional atmosphere photo above. */
export function PhilosophyWallText({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="surface" label="Philosophy">
      <div className={WRAP}>
        {showImage && (
          <Img
            value={block.image}
            alt={statement.slice(0, 120)}
            className="mb-14 aspect-[16/9] w-full md:mb-20 lg:aspect-[21/9]"
          />
        )}

        <div className="grid gap-y-8 border-t border-foreground pt-4 lg:grid-cols-12 lg:gap-x-10">
          <div className="lg:col-span-3">
            <Kicker block={block} editable={editable} />
            {has(block, "attribution", editable) && (
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                as="p"
                placeholder="Attribution"
                className={cn(LABEL, "mt-3 block text-muted-foreground")}
              />
            )}
          </div>
          <div className="lg:col-span-8 lg:col-start-5">
            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className={cn(
                "block max-w-[40ch] text-balance break-words font-normal text-foreground",
                statementSize(statement.length),
              )}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
