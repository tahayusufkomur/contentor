import type { ReactNode } from "react";
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

/** One landing chapter: eyebrow, title and lead, then its content. No
 * scroll-linked motion: scrolling stays native, so it stays smooth. */
export function Chapter({
  id,
  eyebrow,
  title,
  lead,
  dark,
  className,
  children,
}: ChapterProps) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 py-16 md:py-24",
        dark && "dark bg-background text-foreground",
        className,
      )}
    >
      <header className="mx-auto max-w-text px-6 text-center">
        {eyebrow && (
          <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
        )}
        <h2 className="mt-3 text-display-2 text-foreground text-balance">
          {title}
        </h2>
        {lead && (
          <p className="mx-auto mt-4 max-w-[640px] text-body-lg text-muted-foreground text-balance">
            {lead}
          </p>
        )}
      </header>
      <div className="mt-10 md:mt-14">{children}</div>
    </section>
  );
}
