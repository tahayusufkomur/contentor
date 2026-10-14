"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

export interface ChapterProps {
  /** Anchor id; LocalNav links to it. */
  id: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  /** Cinematic chapter: the dark token set applies beneath this section. */
  dark?: boolean;
  className?: string;
  children: ReactNode;
}

/** One landing chapter (spec 5.2): eyebrow, title and lead hold at the top,
 * then scale to 0.96 and fade as the chapter leaves the viewport. */
export function Chapter({
  id,
  eyebrow,
  title,
  lead,
  dark,
  className,
  children,
}: ChapterProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["end end", "end start"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0]);

  return (
    <section
      id={id}
      ref={ref}
      className={cn(
        "scroll-mt-24 py-[72px] md:py-[120px]",
        dark && "dark bg-background text-foreground",
        className,
      )}
    >
      <motion.header
        style={reduced ? undefined : { scale, opacity }}
        className="mx-auto max-w-text px-6 text-center"
      >
        {eyebrow && (
          <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
        )}
        <h2 className="mt-3 text-display-2 text-foreground text-balance">
          {title}
        </h2>
        {lead && (
          <p className="mx-auto mt-5 max-w-[640px] text-body-lg text-muted-foreground text-balance">
            {lead}
          </p>
        )}
      </motion.header>
      <div className="mt-14 md:mt-20">{children}</div>
    </section>
  );
}
