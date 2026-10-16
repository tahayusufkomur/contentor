"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ROLE_ICONS } from "@/components/landing/role-icons";
import type { TeamRole } from "@/lib/landing";
import { cn } from "@/lib/utils";

export interface TeamTab {
  key: TeamRole;
  /** How long the stage stays on this role before moving on. */
  ms: number;
  name: string;
  title: string;
  text: string;
  tools: string;
  /** The role at work, rendered on the server; mounted only while active, so
   * each scene starts from its first beat. */
  scene: ReactNode;
}

/** One role at a time: its words beside its scene. From md up, while in view,
 * the stage moves on by itself, the active tab's bar filling over the role's
 * turn (its animationend is the clock), until the visitor picks a role; a
 * hero card's link (#team-<role>) picks one too. Phones and reduced motion
 * never move on by themselves. */
export function TeamTabs({ tabs, label }: { tabs: TeamTab[]; label: string }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // Phones stack each role's words over its scene, so roles differ in
    // height there: moving on by itself would shift the page under the
    // reader. They switch on a tap instead.
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !matchMedia("(min-width: 768px)").matches
    )
      setAuto(false);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold: 0.35,
    });
    if (root.current) io.observe(root.current);
    const fromHash = () => {
      const i = tabs.findIndex(({ key }) => location.hash === `#team-${key}`);
      if (i < 0) return;
      setActive(i);
      setAuto(false);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => {
      io.disconnect();
      window.removeEventListener("hashchange", fromHash);
    };
  }, [tabs]);

  const pick = (i: number) => {
    setActive(i);
    setAuto(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (active + step + tabs.length) % tabs.length;
    pick(i);
    buttons.current[i]?.focus();
  };

  const tab = tabs[active];
  return (
    <div ref={root} className="mx-auto max-w-media px-6">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:justify-center md:overflow-visible md:px-0"
      >
        {tabs.map(({ key, name, ms }, i) => {
          const Icon = ROLE_ICONS[key];
          const on = i === active;
          return (
            <button
              key={key}
              id={`team-${key}`}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="team-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => pick(i)}
              className={cn(
                "relative inline-flex h-11 shrink-0 scroll-mt-28 items-center gap-2 overflow-hidden rounded-full border px-4 text-sm font-medium transition-colors",
                on
                  ? "border-marketing-accent bg-marketing-accent/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                aria-hidden
                className={cn("size-4", on && "text-marketing-accent")}
              />
              {name}
              {on && auto && (
                <span
                  key={active}
                  aria-hidden
                  onAnimationEnd={() => setActive((a) => (a + 1) % tabs.length)}
                  className="team-progress absolute inset-x-0 bottom-0 h-0.5 bg-marketing-accent"
                  style={{
                    animationDuration: `${ms}ms`,
                    animationPlayState: inView ? "running" : "paused",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        id="team-panel"
        role="tabpanel"
        aria-labelledby={`team-${tab.key}`}
        className="mt-8 grid items-center gap-8 rounded-[28px] border border-border bg-card p-6 md:mt-10 md:min-h-[640px] md:grid-cols-[4fr_8fr] md:gap-12 md:p-12"
      >
        <div key={tab.key} className="motion-safe:animate-fade-in-up">
          <p className="text-eyebrow text-marketing-accent">{tab.name}</p>
          <h3 className="mt-3 text-title text-foreground text-balance">
            {tab.title}
          </h3>
          <p className="mt-3 text-body-lg text-muted-foreground">{tab.text}</p>
          <p className="mt-6 border-t border-border pt-5 text-caption text-muted-foreground">
            {tab.tools}
          </p>
        </div>
        <div key={`${tab.key}-scene`} className="motion-safe:animate-fade-in">
          {tab.scene}
        </div>
      </div>
    </div>
  );
}
