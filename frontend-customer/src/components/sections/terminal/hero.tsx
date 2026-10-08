import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  BTN_GHOST,
  Cursor,
  H1,
  Kicker,
  Section,
  WindowChrome,
  WRAP,
  str,
} from "./ui";

function Actions({
  block,
  editable,
  className,
}: SectionProps & { className?: string }) {
  const primary = has(block, "ctaLabel", editable);
  const secondary = has(block, "secondaryLabel", editable);
  if (!primary && !secondary) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-4", className)}>
      {primary && (
        <SmartLink href={block.ctaHref} className={BTN}>
          <span
            className="text-primary-foreground opacity-80"
            aria-hidden="true"
          >
            $
          </span>
          <Txt
            block={block}
            field="ctaLabel"
            editable={editable}
            placeholder="Button text"
          />
          <Arrow />
        </SmartLink>
      )}
      {secondary && (
        <SmartLink href={block.secondaryHref} className={BTN_GHOST}>
          <span className="text-accent" aria-hidden="true">
            --
          </span>
          <Txt
            block={block}
            field="secondaryLabel"
            editable={editable}
            placeholder="Second button"
          />
        </SmartLink>
      )}
    </div>
  );
}

/** The signature terminal hero: monospace prompt, blinking block cursor,
 *  window chrome panels, and syntax-colored controls. */
export function HeroPrompt({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const hasImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);

  return (
    <Section tone="console" className="pt-12 md:pt-16 lg:pt-20" label={alt}>
      <div className={WRAP}>
        <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          {/* Main prompt & content */}
          <div
            className={
              hasImage ? "lg:col-span-7" : "lg:col-span-8 lg:col-start-3"
            }
          >
            <Kicker block={block} editable={editable} />

            <div className="mt-5">
              <h1 className={H1}>
                <Txt
                  block={block}
                  field="headline"
                  editable={editable}
                  as="span"
                  placeholder="Headline"
                />
                <Cursor />
              </h1>
            </div>

            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-6 block max-w-[48ch] text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground md:text-[1.2rem]"
            />

            {has(block, "meta", editable) && (
              <p className="mt-6 font-mono text-[0.92rem] text-muted-foreground">
                <span
                  className="text-primary font-bold mr-1.5"
                  aria-hidden="true"
                >
                  {"//"}
                </span>
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </p>
            )}

            <Actions
              block={block}
              editable={editable}
              className="mt-9 md:mt-11"
            />
          </div>

          {/* Right window: Photo preview or Console REPL */}
          {hasImage ? (
            <div className="relative lg:col-span-5">
              <WindowChrome
                title="session.raw"
                tag="LIVE"
                bodyClassName="p-0 overflow-hidden"
              >
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="aspect-[4/5] w-full"
                />
              </WindowChrome>

              {showDetail && (
                <div className="absolute -bottom-8 -left-6 w-[52%] sm:-left-8">
                  <WindowChrome
                    title="inspect.png"
                    tag="200"
                    bodyClassName="p-0 overflow-hidden"
                    className="shadow-xl"
                  >
                    <Img
                      value={block.image2}
                      alt={alt}
                      className="aspect-square w-full"
                    />
                  </WindowChrome>
                </div>
              )}
            </div>
          ) : (
            <div className="lg:col-span-8 lg:col-start-3">
              <WindowChrome
                title="~/workspace/env.sh"
                tag="ACTIVE"
                className="mt-6"
              >
                <pre className="overflow-x-auto font-mono text-sm leading-relaxed text-muted-foreground">
                  <code>
                    <span className="text-accent font-bold">export</span> FOCUS=
                    <span className="text-primary">&quot;deep-work&quot;</span>
                    {"\n"}
                    <span className="text-accent font-bold">export</span> MODE=
                    <span className="text-primary">&quot;mentorship&quot;</span>
                    {"\n"}
                    <span className="text-muted-foreground">
                      {"// system ready: start your journey below"}
                    </span>
                  </code>
                </pre>
              </WindowChrome>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Inner-page compact header: monospace kicker, prompt title with cursor,
 *  dek, and optional side preview window. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section
      tone="console"
      className="border-b border-border pb-14 pt-12 md:pb-20 md:pt-16 lg:pb-24"
      label={alt}
    >
      <div className={WRAP}>
        <div className="grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-10">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Kicker block={block} editable={editable} />
            <h1 className="mt-4 block max-w-[22ch] text-balance break-words font-display text-[clamp(2.2rem,1.4rem+3.2vw,4.5rem)] font-bold leading-[1.06] tracking-[-0.03em]">
              <Txt
                block={block}
                field="headline"
                editable={editable}
                as="span"
                placeholder="Page title"
              />
              <Cursor />
            </h1>
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-6 block max-w-[48ch] text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground"
            />
            {has(block, "meta", editable) && (
              <p className="mt-5 font-mono text-[0.92rem] text-muted-foreground">
                <span
                  className="text-primary font-bold mr-1.5"
                  aria-hidden="true"
                >
                  {"//"}
                </span>
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </p>
            )}
            <Actions block={block} editable={editable} className="mt-8" />
          </div>

          {showImage && (
            <figure className="lg:col-span-4">
              <WindowChrome
                title="header.png"
                bodyClassName="p-0 overflow-hidden"
                className="max-w-[16rem] lg:ml-auto"
              >
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="aspect-[4/5] w-full"
                />
              </WindowChrome>
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
