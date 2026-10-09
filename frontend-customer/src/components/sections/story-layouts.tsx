import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "./kit";
import type { SectionComponent } from "./types";

type Part = ComponentType<{
  block: Block;
  editable?: EditableContext;
  className?: string;
}>;

/** What a style supplies so its story can be a letter or a pull-quote: its own
 *  section shell, type and link treatment. The structure is shared; the look
 *  is the style's. */
export interface StoryKit {
  /** The style's section shell (tone, rhythm). */
  Section: ComponentType<{ label?: string; children: ReactNode }>;
  /** Optional sheet around the column (a paper page, a card). */
  Frame?: ComponentType<{ className?: string; children: ReactNode }>;
  wrap: string;
  /** The heading classes (size then leading). */
  h2: string;
  Kicker: Part;
  /** Optional ornament under the kicker (moon phases, a rule). */
  Ornament?: ComponentType<{ className?: string }>;
  /** Rich-text classes, without a max width. */
  body: string;
  /** The signature line's classes, and a mark before it. */
  signature: string;
  signatureMark?: ReactNode;
  /** The link's classes and its trailing icon. */
  link: string;
  LinkIcon: ComponentType<{ className?: string }>;
  /** Classes on the photo (frame, radius, tilt). */
  photo?: string;
  /** Mark set above a pull-quote (the opening quotation mark's classes). */
  mark?: string;
  /** Centre the letter. */
  center?: boolean;
}

const Plain = ({ children }: { className?: string; children: ReactNode }) => (
  <>{children}</>
);

function Closing({
  k,
  block,
  editable,
  center,
}: {
  k: StoryKit;
  block: Block;
  editable?: EditableContext;
  center?: boolean;
}) {
  return (
    <>
      {has(block, "signature", editable) && (
        <p
          className={cn(
            "mt-8 flex items-center gap-2.5",
            k.signature,
            center && "justify-center",
          )}
        >
          {k.signatureMark}
          <Txt
            block={block}
            field="signature"
            editable={editable}
            placeholder="Your name"
          />
        </p>
      )}
      {has(block, "ctaLabel", editable) && (
        <div className={cn("mt-8 flex", center && "justify-center")}>
          <SmartLink
            href={block.ctaHref}
            className={cn("group inline-flex items-center gap-2", k.link)}
          >
            <Txt
              block={block}
              field="ctaLabel"
              editable={editable}
              placeholder="Link text"
            />
            <k.LinkIcon />
          </SmartLink>
        </div>
      )}
    </>
  );
}

/** A story as a letter: no photo, one narrow column of the coach's own
 *  words, signed. */
export function makeStoryLetter(k: StoryKit): SectionComponent {
  return function StoryLetter({ block, editable }) {
    const alt = String(block.heading ?? "");
    const Frame = k.Frame ?? Plain;
    return (
      <k.Section label={alt}>
        <div className={k.wrap}>
          <Frame className="mx-auto max-w-[46rem]">
            <div
              className={cn(
                !k.Frame && "mx-auto max-w-[44rem]",
                k.center && "text-center",
              )}
            >
              <k.Kicker
                block={block}
                editable={editable}
                className={k.center ? "justify-center" : undefined}
              />
              {k.Ornament && (
                <k.Ornament
                  className={cn("mt-3.5", k.center && "justify-center")}
                />
              )}
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(k.h2, "mt-4 block", k.center && "mx-auto")}
              />
              <Rich
                block={block}
                field="body"
                editable={editable}
                className={cn("mt-8", k.body)}
              />
              <Closing
                k={k}
                block={block}
                editable={editable}
                center={k.center}
              />
            </div>
          </Frame>
        </div>
      </k.Section>
    );
  };
}

/** A story as a pull-quote: the heading set as one large line across the
 *  page, then the story in two columns beside a small portrait. */
export function makeStoryPull(k: StoryKit): SectionComponent {
  return function StoryPull({ block, editable }) {
    const alt = String(block.heading ?? "");
    const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
    return (
      <k.Section label={alt}>
        <div className={k.wrap}>
          <k.Kicker block={block} editable={editable} />
          <span
            aria-hidden="true"
            className={cn(
              "mt-4 block font-display text-[5rem] leading-[0.6] text-primary",
              k.mark,
            )}
          >
            &ldquo;
          </span>
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(
              k.h2,
              "mt-2 block max-w-[26ch]",
              alt.length <= 44
                ? "text-[clamp(2.2rem,0.9rem+4.4vw,5rem)] leading-[1.04]"
                : "text-[clamp(1.8rem,0.9rem+2.8vw,3.4rem)] leading-[1.1]",
            )}
          />
          <div className="mt-12 grid gap-x-10 gap-y-10 md:mt-16 md:grid-cols-12">
            {showImage && (
              <Img
                value={block.image}
                alt={alt}
                className={cn(
                  "aspect-[4/5] w-full max-w-[16rem] md:col-span-3 md:max-w-none",
                  k.photo,
                )}
              />
            )}
            <div
              className={cn(
                showImage
                  ? "md:col-span-8 md:col-start-5"
                  : "md:col-span-9 md:col-start-3",
              )}
            >
              <Rich
                block={block}
                field="body"
                editable={editable}
                className={cn(
                  k.body,
                  "md:columns-2 md:gap-x-10 [&_p]:break-inside-avoid",
                )}
              />
              <Closing k={k} block={block} editable={editable} />
            </div>
          </div>
        </div>
      </k.Section>
    );
  };
}
