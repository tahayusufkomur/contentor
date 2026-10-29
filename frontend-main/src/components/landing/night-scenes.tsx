"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Moon,
  MousePointer2,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { COACH, STUDENT } from "./demo-people";

// Mara Lindqvist is the landing's demo coach (seed_footage_coach); the course
// and prices are her seeded catalogue, the students are made up.

const TICK = 50;

/** One looping clock per scene, the same way FoundScene runs: everything on
 * screen is a pure function of `t`, so `final` is also the server render, the
 * reduced-motion still and what shows while paused. Runs only in view. */
function useSceneClock(end: number, final: number) {
  const stage = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(final);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (still: boolean) => {
      setReduced(still);
      setT(still ? final : 0);
    };
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", onChange);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold: 0.25,
    });
    if (stage.current) io.observe(stage.current);
    return () => {
      mq.removeEventListener("change", onChange);
      io.disconnect();
    };
  }, [final]);

  const running = inView && !paused && !reduced;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => setT((v) => (v + TICK >= end ? 0 : v + TICK)),
      TICK,
    );
    return () => clearInterval(id);
  }, [running, end]);

  const on = (ms: number) => t >= ms;
  // Right after the loop restarts, beats snap back instead of fading out.
  const move = t < 2 * TICK ? "" : "transition duration-500 ease-expo";
  const rise = (ms: number) =>
    cn(move, on(ms) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0");
  return { stage, t, on, move, rise, reduced, paused, setPaused };
}

type Clock = ReturnType<typeof useSceneClock>;

/** The dotted stage, the scene fading out before it loops, and the pause
 * button every moving scene needs. */
function Stage({
  clock,
  label,
  fade,
  children,
}: {
  clock: Clock;
  label: string;
  fade: number;
  children: ReactNode;
}) {
  const { stage, on, reduced, paused, setPaused } = clock;
  const msg = useTranslations("marketing.scenes");
  return (
    <div className="relative h-full">
      <div
        ref={stage}
        role="img"
        aria-label={label}
        className="h-full rounded-tile bg-muted bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[length:22px_22px] px-4 pb-14 pt-12 text-[13px] md:px-6 md:text-sm"
      >
        <div
          aria-hidden
          className={cn(
            "relative h-full transition-opacity duration-500",
            on(fade) && "opacity-0",
          )}
        >
          {children}
        </div>
      </div>
      {!reduced && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? msg("play") : msg("pause")}
          className="absolute bottom-3 right-3 inline-flex size-8 items-center justify-center rounded-full bg-background text-foreground transition-colors hover:bg-muted"
        >
          {paused ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

/** Where the coach is while it happens: a pill over the top edge. */
function Status({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="absolute -top-8 left-0 inline-flex items-center gap-2 rounded-full bg-card py-1.5 pl-2 pr-3.5 text-[0.9em] font-medium text-foreground shadow-[0_18px_40px_-16px_rgba(0,0,0,0.45)] ring-1 ring-border">
      {icon}
      {children}
    </p>
  );
}

const card =
  "rounded-2xl bg-card p-4 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.35)] ring-1 ring-border";

/** The first `n` units of `parts` shown; the rest keeps its place, so nothing
 * reflows as it types. */
function Partial({
  parts,
  n,
  sep,
}: {
  parts: string[];
  n: number;
  sep: string;
}) {
  return (
    <>
      {parts.slice(0, n).join(sep)}
      <span className="invisible">
        {n > 0 && n < parts.length ? sep : ""}
        {parts.slice(n).join(sep)}
      </span>
    </>
  );
}

const count = (t: number, at: number, ms: number, max: number) =>
  Math.max(0, Math.min(max, Math.floor((t - at) / ms)));

const N = {
  ask: 600,
  think: 2900,
  reply: 3500,
  course: 5200,
  click: 6400,
  paid: 6800,
  ping: 7600,
  fade: 12500,
  end: 13000,
};

/** "A sale while you sleep": at night a student asks the assistant on the
 * coach's site, it suggests a course, the student buys it, and the payment
 * lands silently on the sleeping coach's phone. The assistant is real (the
 * student layout's SiteAssistantBubble); this conversation is illustrative. */
export function NightSale({ label }: { label: string }) {
  const msg = useTranslations("marketing.scenes.night");
  const format = useFormatter();
  const QUESTION = msg("question").split("");
  const REPLY = msg("reply").split(" ");
  const money = (amount: number, digits: number) =>
    format.number(amount, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const clock = useSceneClock(N.end, 10000);
  const { t, on, move, rise } = clock;
  const paid = on(N.paid);
  return (
    <Stage clock={clock} label={label} fade={N.fade}>
      <Status icon={<Moon className="size-[1.1em] text-marketing-accent" />}>
        <span className="tabular-nums">{msg("time")}</span>
        <span className="text-muted-foreground">
          {msg("asleep", { coach: COACH.first })}
        </span>
        <span className="text-muted-foreground">
          {["z", "z", "z"].map((z, i) => (
            <span
              key={i}
              className={cn(
                "inline-block transition-opacity duration-500",
                Math.floor(t / 600) % 4 <= i && "opacity-0",
              )}
            >
              {z}
            </span>
          ))}
        </span>
      </Status>

      <div className={card}>
        <p className="flex items-center gap-2 border-b border-border pb-3 text-[0.9em] font-medium text-muted-foreground">
          <span className="grid size-[1.7em] place-items-center rounded-full bg-foreground text-background">
            <Sparkles className="size-[0.9em]" />
          </span>
          {msg("askAssistant", { coach: COACH.first })}
        </p>
        <p
          className={cn(
            "ml-auto mt-3 w-fit max-w-[88%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-foreground",
            rise(N.ask - 300),
          )}
        >
          <Partial
            parts={QUESTION}
            n={count(t, N.ask, 30, QUESTION.length)}
            sep=""
          />
        </p>
        <div className={cn("relative mt-3 text-foreground", rise(N.think))}>
          <p>
            <Partial
              parts={REPLY}
              n={on(N.reply) ? count(t, N.reply, 70, REPLY.length) + 1 : 0}
              sep=" "
            />
          </p>
          {on(N.think) && !on(N.reply) && (
            <span className="absolute left-0 top-[0.5em] flex gap-1">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className={cn(
                    "size-1.5 rounded-full bg-muted-foreground transition-opacity duration-150",
                    Math.floor(t / 150) % 3 !== d && "opacity-30",
                  )}
                />
              ))}
            </span>
          )}
        </div>

        <div
          className={cn(
            "relative mt-3 flex items-center gap-3 rounded-xl bg-background p-2.5 ring-1",
            rise(N.course),
            paid ? "ring-marketing-accent" : "ring-border",
          )}
        >
          <span className="size-[3em] shrink-0 rounded-lg bg-[linear-gradient(135deg,#e9c9a8,#b07a52)]" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate font-semibold text-foreground">
              {msg("course")}
            </span>
            <span className="block text-[0.85em] text-muted-foreground">
              {msg.rich("courseMeta", {
                price: money(59, 0),
                num: (chunks) => <span className="tabular-nums">{chunks}</span>,
              })}
            </span>
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[0.85em] font-semibold",
              move,
              paid
                ? "bg-marketing-accent text-marketing-accent-foreground"
                : "bg-foreground text-background",
              on(N.click) && !on(N.click + 250) && "scale-90",
            )}
          >
            {paid && <Check className="size-[1em]" />}
            {paid ? msg("paid") : msg("buyNow")}
          </span>
          <MousePointer2
            className={cn(
              "absolute bottom-0 right-6 size-[1.6em] fill-foreground text-background drop-shadow transition duration-500 ease-expo",
              on(N.course + 500) && !on(N.ping)
                ? "opacity-100"
                : "translate-x-8 translate-y-6 opacity-0",
            )}
          />
        </div>
      </div>

      {/* The coach's lock screen: the sale arrives, silenced. */}
      <div
        className={cn(
          "relative z-10 mx-3 -mt-3 flex items-center gap-3 rounded-[18px] bg-card/90 p-3 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)] ring-1 ring-border backdrop-blur md:mx-8",
          move,
          on(N.ping)
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-3 scale-95 opacity-0",
        )}
      >
        <span className="grid size-[2.6em] shrink-0 place-items-center rounded-[10px] bg-[#635bff] font-bold text-white">
          S
        </span>
        <span className="min-w-0 flex-1 leading-snug">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-foreground">
              {msg("paymentReceived")}
            </span>
            <span className="inline-flex items-center gap-1 text-[0.8em] text-muted-foreground">
              <Moon className="size-[1em]" />
              {msg("sleep")}
            </span>
          </span>
          <span className="block truncate text-muted-foreground">
            {msg.rich("paymentFrom", {
              amount: (chunks) => (
                <span className="font-medium tabular-nums text-foreground">
                  {chunks}
                </span>
              ),
              price: money(59, 2),
              student: STUDENT.short,
              course: msg("course"),
            })}
          </span>
        </span>
      </div>
    </Stage>
  );
}
