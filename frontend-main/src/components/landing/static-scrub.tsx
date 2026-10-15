import type { ReactNode } from "react";
import type { ScrubBand } from "@/components/motion/scroll-scrub";
import { cn } from "@/lib/utils";

/** Three caption windows across a scrub: the first is visible at rest, the
 * last stays to the end (Phase 0's bandOpacity treats from=0 / to=1 so). The
 * 0.08 gaps (bandOpacity's fade) keep two pills from crossing on screen. */
export function scrubBands(
  nodes: [ReactNode, ReactNode, ReactNode],
): ScrubBand[] {
  return [
    { from: 0, to: 0.3, node: nodes[0] },
    { from: 0.38, to: 0.62, node: nodes[1] },
    { from: 0.7, to: 1, node: nodes[2] },
  ];
}

/** A caption as the scrub chapters show it: a paper pill with ink text, so it
 * reads over light UI footage in a light or a dark chapter alike. */
export function ScrubCaption({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border bg-background px-5 py-2.5 text-body-lg font-medium text-foreground text-balance">
      {children}
    </span>
  );
}

/** What a phone (or a reader asking for reduced motion) sees instead of the
 * sticky scrub (spec 5.7: ≤ 4 MB on a phone, so the all-keyframe clip never
 * loads there): the poster, then the captions in reading order. Switched by
 * CSS (`stage:motion-safe:hidden` here, `hidden stage:motion-safe:block` on
 * ScrollScrub; `stage` = at least 768 × 600, so a landscape phone stays
 * here) so there is no hydration mismatch and no shift. */
export function StaticScrub({
  poster,
  width,
  height,
  bands,
  className,
}: {
  poster: string;
  width: number;
  height: number;
  bands: ReactNode[];
  className?: string;
}) {
  return (
    <figure className={cn("mx-auto max-w-media px-6", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF poster, no optimisation wanted */}
      <img
        src={poster}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="w-full rounded-tile bg-muted"
      />
      <ol className="mx-auto mt-8 max-w-text space-y-4 text-center">
        {bands.map((node, i) => (
          <li key={i}>{node}</li>
        ))}
      </ol>
    </figure>
  );
}
