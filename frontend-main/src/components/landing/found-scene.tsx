"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Globe,
  MessageCircle,
  MousePointer2,
  Pause,
  Play,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** The story's beats on one clock, in ms. Everything on screen is a pure
 * function of `t`, so the finished frame (FINAL) is also the server render,
 * the reduced-motion still and the paused state's fallback. */
const T = {
  type: 500,
  results: 2500,
  pick: 3400,
  click: 4200,
  chat: 5000,
  ask: 5400,
  think: 7400,
  reply: 8000,
  source: 10400,
  student: 11300,
  fade: 15000,
  end: 15500,
};
const FINAL = 12500;
const TICK = 50;

// Mara Lindqvist is the landing's demo coach (seed_footage_coach); the
// article is hers. No search engine has seen her: this is an illustration.
const QUERY = "why are my hips so tight after sitting";
const QUESTION = "Where can I find online yoga for stiff office workers?";
const ANSWER =
  "Try Mara Lindqvist. She runs slow vinyasa and yin classes for people who sit at a desk all day, with live classes and a gentle course for tight backs.".split(
    " ",
  );
const NAME_WORDS = [1, 2]; // "Mara Lindqvist." in bold

/** `text` typed out by `t`; the untyped rest keeps its place, so nothing reflows. */
function Typed({
  text,
  at,
  ms,
  t,
}: {
  text: string;
  at: number;
  ms: number;
  t: number;
}) {
  const n = Math.max(0, Math.min(text.length, Math.floor((t - at) / ms)));
  return (
    <>
      {text.slice(0, n)}
      {t >= at - 400 && n < text.length && (
        <span className="-mr-px inline-block h-[1.1em] w-px translate-y-[0.2em] bg-foreground" />
      )}
      <span className="invisible">{text.slice(n)}</span>
    </>
  );
}

function Where({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: string;
}) {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.8em] font-medium text-muted-foreground">
      <Icon className="size-[1.1em]" />
      {children}
    </p>
  );
}

function OtherResult({
  shown,
  className,
}: {
  shown: string;
  className: string;
}) {
  return (
    <li className={cn("space-y-2 py-2", shown, className)}>
      <span className="flex items-center gap-2">
        <span className="size-[1.9em] rounded-full bg-muted" />
        <span className="h-[0.6em] w-1/4 rounded-full bg-muted" />
      </span>
      <span className="block h-[0.8em] w-2/3 rounded-full bg-muted" />
      <span className="block h-[0.6em] w-11/12 rounded-full bg-muted" />
    </li>
  );
}

/** "Get found": a student asks a search engine, then an AI assistant, and
 * both land on the coach's site; then she joins. A live scene rather than
 * footage so the type stays sharp and follows the colour scheme. */
export function FoundScene({ label }: { label: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(FINAL);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (still: boolean) => {
      setReduced(still);
      setT(still ? FINAL : 0);
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
  }, []);

  const running = inView && !paused && !reduced;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => setT((v) => (v + TICK >= T.end ? 0 : v + TICK)),
      TICK,
    );
    return () => clearInterval(id);
  }, [running]);

  const on = (ms: number) => t >= ms;
  // Right after the loop restarts, beats snap back instead of fading out.
  const move = t < 2 * TICK ? "" : "transition duration-500 ease-expo";
  const rise = (ms: number) =>
    cn(move, on(ms) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0");
  const picked = on(T.pick);
  const words = Math.max(
    0,
    Math.min(ANSWER.length, Math.floor((t - T.reply) / 70) + 1),
  );

  return (
    <div className="relative">
      <div
        ref={stage}
        role="img"
        aria-label={label}
        className="rounded-tile bg-muted bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[length:22px_22px] px-4 pb-14 pt-10 text-[13px] md:px-8 md:pb-12 md:pt-10 md:text-sm"
      >
        <div
          className={cn(
            "transition-opacity duration-500",
            on(T.fade) && "opacity-0",
          )}
        >
          <div className="rounded-2xl bg-card p-4 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.35)] ring-1 ring-border md:w-[86%] md:p-5">
            <Where icon={Search}>Asked on Google</Where>
            <p className="mt-3 flex items-start gap-2.5 rounded-2xl border border-border bg-background px-4 py-2.5 text-foreground">
              <Search className="mt-[0.2em] size-[1.1em] shrink-0 text-muted-foreground" />
              <span>
                <Typed text={QUERY} at={T.type} ms={45} t={t} />
              </span>
            </p>
            <ol className="mt-3">
              <li
                className={cn(
                  "relative -mx-2.5 rounded-xl px-2.5 py-2",
                  rise(T.results),
                  picked &&
                    "bg-marketing-accent/10 ring-1 ring-marketing-accent/40",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="grid size-[1.9em] place-items-center rounded-full bg-foreground text-[0.8em] font-semibold text-background">
                    M
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[0.85em] font-medium text-foreground">
                      Mara Lindqvist
                    </span>
                    <span className="block text-[0.8em] text-muted-foreground">
                      maralindqvist.com › articles
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-1.5 block text-[1.08em] font-semibold text-foreground underline-offset-4",
                    on(T.click) && "underline decoration-marketing-accent",
                  )}
                >
                  Why your hips feel tight after a day at the desk
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  Sitting shortens the front of the hips. Here is what that
                  means, and the two-minute fix.
                </span>
                <MousePointer2
                  aria-hidden
                  className={cn(
                    "absolute right-[12%] top-[52%] size-[1.6em] fill-foreground text-background drop-shadow transition duration-500 ease-expo",
                    picked && !on(T.chat)
                      ? "opacity-100"
                      : "translate-x-10 translate-y-8 opacity-0",
                    on(T.click) && !on(T.click + 250) && "scale-75",
                  )}
                />
              </li>
              <OtherResult shown={rise(T.results + 150)} className="" />
            </ol>
          </div>

          <div
            className={cn(
              "relative z-10 -mt-[4.5em] ml-auto md:-mt-[7em] w-[94%] rounded-2xl bg-card p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] ring-1 ring-border md:w-[74%] md:p-5",
              move,
              on(T.chat)
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0",
            )}
          >
            <Where icon={MessageCircle}>Asked on ChatGPT</Where>
            <p
              className={cn(
                "ml-auto mt-3 w-fit max-w-[88%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-foreground",
                rise(T.ask - 300),
              )}
            >
              <Typed text={QUESTION} at={T.ask} ms={32} t={t} />
            </p>
            <div className={cn("mt-3 flex gap-2.5", rise(T.think))}>
              <span className="grid size-[1.9em] shrink-0 place-items-center rounded-full bg-foreground text-background">
                <Sparkles className="size-[1em]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="relative text-foreground">
                  {ANSWER.map((w, i) => (
                    <span
                      key={i}
                      className={cn(!(on(T.reply) && i < words) && "invisible")}
                    >
                      {NAME_WORDS.includes(i) ? (
                        <strong className="font-semibold">{w}</strong>
                      ) : (
                        w
                      )}{" "}
                    </span>
                  ))}
                  {on(T.think) && !on(T.reply) && (
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
                </p>
                <span
                  className={cn(
                    "mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-[0.85em] font-medium text-foreground ring-1",
                    move,
                    on(T.source)
                      ? "scale-100 opacity-100 ring-marketing-accent"
                      : "scale-90 opacity-0 ring-border",
                  )}
                >
                  <Globe className="size-[1em] text-marketing-accent" />
                  maralindqvist.com
                </span>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "absolute -top-4 right-4 z-20 flex items-center gap-2.5 rounded-full bg-card py-1.5 pl-1.5 pr-4 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.45)] ring-1 ring-border md:right-8",
              move,
              on(T.student)
                ? "translate-y-0 scale-100 opacity-100"
                : "-translate-y-3 scale-95 opacity-0",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 5 KB face, decorative inside role=img */}
            <img
              src="/media/stills/priya.webp"
              alt=""
              width={36}
              height={36}
              className="size-[2.4em] rounded-full object-cover"
            />
            <span className="leading-tight">
              <span className="block text-[0.8em] text-muted-foreground">
                New student
              </span>
              <span className="block font-medium text-foreground">
                Priya joined Mara&rsquo;s platform
              </span>
            </span>
          </div>
        </div>
      </div>
      {!reduced && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play animation" : "Pause animation"}
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
