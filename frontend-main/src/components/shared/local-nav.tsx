"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { cn } from "@/lib/utils";

export interface LocalNavProps {
  title: string;
  items: { id: string; label: string }[];
  cta: { href: string; label: string };
}

/** Apple-style product nav under the header (spec 5.4): the page's name on
 * the left, chapter anchors and the CTA on the right. The active anchor
 * follows the chapter in view. On phones only the title and the CTA show. */
export function LocalNav({ title, items, cta }: LocalNavProps) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav
      aria-label={title}
      className="sticky top-12 z-40 border-b bg-background backdrop-blur-md"
    >
      <div className="mx-auto flex h-11 max-w-media items-center justify-between px-6">
        <span className="text-caption font-semibold text-foreground">
          {title}
        </span>
        <div className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 md:flex">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active === item.id ? "location" : undefined}
                  className={cn(
                    "text-[12px] transition-colors",
                    active === item.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Button
            asChild
            size="sm"
            className="h-7 rounded-full px-3 text-[12px]"
          >
            <NavLink href={cta.href}>{cta.label}</NavLink>
          </Button>
        </div>
      </div>
    </nav>
  );
}
