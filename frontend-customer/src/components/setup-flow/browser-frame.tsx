"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Lock, RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { embedSrc } from "@/lib/setup-flow";

export type Device = "desktop" | "phone";

// Below this width the coach's site would fall into its tablet/phone
// breakpoints — the desktop preview renders at this width and scales down.
const DESKTOP_W = 1180;

/** The preview "browser": a quiet chrome bar with the real address, and a
 * body holding either the live page (scaled to fit) or a stage overlay. */
export function BrowserFrame({
  host,
  path,
  device,
  reloadKey,
  onReload,
  overlay,
}: {
  host: string;
  path: string | null;
  device: Device;
  reloadKey: number;
  onReload?: () => void;
  /** Rendered instead of the page (composing, retry). */
  overlay?: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Phone renders at the frame's own width — no scaling, crisp text.
  const virtualW = device === "phone" ? box.w : Math.max(box.w, DESKTOP_W);
  const scale = box.w ? Math.min(1, box.w / virtualW) : 1;

  return (
    <div
      className={cn(
        "relative mx-auto h-full w-full transition-[max-width] duration-500 ease-out motion-reduce:transition-none",
        device === "phone" ? "max-w-[390px]" : "max-w-[1400px]",
      )}
    >
      {/* Soft lift: a warm pooled shadow under the frame's lower edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[7%] -bottom-4 h-12 rounded-[50%] bg-[rgb(72_52_28/0.2)] blur-2xl"
      />
      <div
        className={cn(
          "relative flex h-full flex-col overflow-hidden bg-white shadow-[var(--sf-frame-shadow)] ring-1 ring-[rgb(48_36_20/0.08)] transition-[border-radius] duration-500",
          device === "phone" ? "rounded-[26px]" : "rounded-[14px]",
        )}
      >
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[#EDEDEF] bg-[#F7F7F8] px-3.5">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#DCDDE0]" />
            <span className="size-2.5 rounded-full bg-[#DCDDE0]" />
            <span className="size-2.5 rounded-full bg-[#DCDDE0]" />
          </span>
          <span className="mx-auto flex h-6 min-w-0 max-w-[420px] flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-3 text-xs text-[var(--sf-graphite)] ring-1 ring-[#E8E8EB]">
            <Lock
              className="size-3 shrink-0 text-[var(--sf-faint)]"
              aria-hidden
            />
            <span className="truncate">
              {host}
              {path && path !== "/" ? path : ""}
            </span>
          </span>
          {onReload ? (
            <button
              type="button"
              onClick={onReload}
              aria-label="Reload preview"
              title="Reload preview"
              className="rounded-md p-1 text-[var(--sf-faint)] transition-colors hover:bg-white hover:text-[var(--sf-ink)]"
            >
              <RotateCw className="size-3.5" aria-hidden />
            </button>
          ) : (
            <span className="w-[22px]" aria-hidden />
          )}
        </div>
        <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
          {overlay ??
            (path && box.w > 0 && (
              <LivePage
                key={`${path}#${reloadKey}`}
                src={embedSrc(path)}
                width={virtualW}
                height={box.h / scale}
                scale={scale}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function LivePage({
  src,
  width,
  height,
  scale,
}: {
  src: string;
  width: number;
  height: number;
  scale: number;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <PageSkeleton />}
      <iframe
        src={src}
        title="Site preview"
        onLoad={(e) => {
          // The preview is a picture of one page: links and forms inside it
          // stay put (a navigated frame would also lose ?embed=1).
          const doc = e.currentTarget.contentDocument;
          doc?.addEventListener(
            "click",
            (ev) => {
              if ((ev.target as Element | null)?.closest?.("a[href]")) {
                ev.preventDefault();
              }
            },
            true,
          );
          doc?.addEventListener("submit", (ev) => ev.preventDefault(), true);
          setLoaded(true);
        }}
        className={cn(
          "absolute left-0 top-0 origin-top-left border-0 bg-white transition-opacity duration-500 motion-reduce:transition-none",
          loaded ? "opacity-100" : "opacity-0",
        )}
        style={{ width, height, transform: `scale(${scale})` }}
      />
    </>
  );
}

/** A page-shaped skeleton: nav, hero, a row of cards. */
function PageSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-0 flex flex-col gap-6 p-6", className)}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-28" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
      <Skeleton className="min-h-[38%] flex-[1.4] rounded-xl" />
      <div className="grid flex-1 grid-cols-3 gap-4">
        <Skeleton className="rounded-xl" />
        <Skeleton className="rounded-xl" />
        <Skeleton className="rounded-xl" />
      </div>
    </div>
  );
}

const STAGE_AT = [0, 6, 14]; // seconds each stage starts (presentation only)

/** The page being composed: its name, three stages advancing, a faint
 * page skeleton beneath. Stages are paced client-side — the server only
 * says "building" — and the last one holds until the page is ready. */
export function Composing({
  title,
  stages,
  note,
}: {
  title: string;
  stages: [string, string, string];
  note: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const current = STAGE_AT.filter((at) => elapsed >= at).length - 1;

  return (
    <div className="absolute inset-0 bg-[#FBFAF8]">
      <PageSkeleton className="opacity-60" />
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div
          role="status"
          aria-live="polite"
          className="w-full max-w-[440px] rounded-2xl bg-white/90 px-8 py-9 shadow-[0_0_0_1px_rgb(20_22_28/0.06),0_24px_60px_-24px_rgb(20_22_28/0.35)] backdrop-blur-md motion-safe:animate-[sf-rise_.5s_ease-out_both]"
        >
          <p className="text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--sf-ink)] sm:text-[40px]">
            {title}
          </p>
          <p className="mt-2 text-sm text-[var(--sf-graphite)]">{note}</p>
          <ol className="mt-7 space-y-3.5">
            {stages.map((label, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center">
                    {done ? (
                      <span className="flex size-[18px] items-center justify-center rounded-full bg-[var(--sf-ink)] text-white">
                        <Check className="size-3" strokeWidth={3} aria-hidden />
                      </span>
                    ) : active ? (
                      <span className="size-2.5 rounded-full bg-[var(--sf-brass)] shadow-[0_0_0_4px_var(--sf-brass-soft)]" />
                    ) : (
                      <span className="size-2 rounded-full bg-[var(--sf-line-strong)]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[15px] transition-colors duration-500",
                        done && "text-[var(--sf-graphite)]",
                        active && "font-medium text-[var(--sf-ink)]",
                        !done && !active && "text-[var(--sf-faint)]",
                      )}
                    >
                      {label}
                    </span>
                    {active && (
                      <span className="mt-2 block h-px overflow-hidden bg-[var(--sf-line)]">
                        <span className="block h-full w-1/3 bg-[var(--sf-brass)] motion-safe:animate-progress-indeterminate" />
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
