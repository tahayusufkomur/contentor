"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { SpecialistFace } from "@/components/copilot/specialist-face";
import { Button } from "@/components/ui/button";
import type { Slide } from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { SlidePicture } from "./slide-pictures";

/** The deck shown in place of a question: the first due slide, presented by
 *  the specialist who owns the concept. Passing one (Next, "I know this",
 *  Enter or →) hands it to the parent, which drops it from the list. Mount
 *  it with a key that names the deck, so the dots count from its start. */
export function ConceptSlides({
  slides,
  brandName,
  host,
  onPass,
}: {
  slides: Slide[];
  brandName: string;
  host?: string;
  onPass: (key: string, skipped: boolean) => void;
}) {
  const t = useTranslations("admin");
  const slide = slides[0];
  const total = useRef(slides.length);
  total.current = Math.max(total.current, slides.length);
  const title = useRef<HTMLHeadingElement>(null);
  const key = slide?.key;

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [key]);

  useEffect(() => {
    if (!key) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.key !== "Enter" && e.key !== "ArrowRight") ||
        !(e.target instanceof Element) ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.repeat
      )
        return;
      if (e.target.closest("textarea, input, select, [contenteditable]"))
        return;
      // Enter on a focused button or link is that control's own click.
      if (e.key === "Enter" && e.target.closest("button, a")) return;
      e.preventDefault();
      onPass(key, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, onPass]);

  if (!slide) return null;
  const at = total.current - slides.length + 1;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-5 py-8 sm:px-10">
        <section
          key={slide.key}
          aria-roledescription="slide"
          aria-label={slide.title}
          className="flex flex-col rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-paper)] px-5 py-6 sm:px-8 sm:py-7 motion-safe:animate-[sf-rise_.5s_ease-out_both]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 text-[13.5px] text-[var(--sf-graphite)]">
              <SpecialistFace k={slide.by} size="lg" />
              <span className="min-w-0">
                <b className="font-semibold text-[var(--sf-ink)]">
                  {t(`team.specialists.${slide.by}.name`)}
                </b>
                {slide.first && (
                  <span className="block sm:inline">
                    <span className="hidden sm:inline"> · </span>
                    {t(`team.specialists.${slide.by}.job`)}
                  </span>
                )}
              </span>
            </div>
            <div className="shrink-0 text-right text-[12.5px] text-[var(--sf-graphite)]">
              <div>{slide.chapter}</div>
              {total.current > 1 && (
                <div
                  className="mt-1.5 flex justify-end gap-1.5"
                  role="img"
                  aria-label={`Slide ${at} of ${total.current}`}
                >
                  {Array.from({ length: total.current }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1.5 rounded-full",
                        i === at - 1
                          ? "w-4 bg-[var(--sf-ink)]"
                          : "w-1.5 bg-[var(--sf-line-strong)]",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <h2
            ref={title}
            tabIndex={-1}
            className="mb-2 mt-6 max-w-[32ch] text-[28px] font-semibold leading-[1.08] tracking-[-0.03em] outline-none sm:text-[34px]"
          >
            {slide.title}
          </h2>
          <p className="max-w-[60ch] text-[16px] leading-relaxed text-[var(--sf-graphite)]">
            {slide.body}
          </p>
          <div className="mt-6">
            <SlidePicture slide={slide} brandName={brandName} host={host} />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => onPass(slide.key, true)}
              className="rounded-full text-[var(--sf-graphite)]"
            >
              {slide.key === "team" ? "Skip the introductions" : "I know this"}
            </Button>
            <Button
              size="lg"
              onClick={() => onPass(slide.key, false)}
              className="rounded-full px-6"
            >
              {slide.next}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
