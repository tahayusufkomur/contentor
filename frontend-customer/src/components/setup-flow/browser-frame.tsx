"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Lock, RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { buildSelectionPayload } from "@/lib/copilot/selection";
import type { SelectionPayload } from "@/lib/copilot/types";
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
  onNavigate,
  onPick,
  pickedBlock,
  flashBlock,
  overlay,
}: {
  host: string;
  path: string | null;
  device: Device;
  reloadKey: number;
  onReload?: () => void;
  /** A link inside the preview was followed to this site path. */
  onNavigate?: (path: string) => void;
  /** Set while she reviews a page: a tap on a section picks it (hover
   * outlines it) instead of following links, with a short label for it. */
  onPick?: (selection: SelectionPayload, label: string) => void;
  /** The section picked, outlined until the change is sent. */
  pickedBlock?: string | null;
  /** The section just changed: the page opens scrolled to it, and it flashes. */
  flashBlock?: string | null;
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
                onNavigate={onNavigate}
                onPick={onPick}
                pickedBlock={pickedBlock}
                flashBlock={flashBlock}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

// Styles put into the previewed page while a section can be picked: every
// block outlines on hover, the picked one stays outlined, and a changed one
// flashes once. The page is the coach's own, so plain attribute selectors are
// safe (every block renders in a [data-block-id] wrapper).
const PICK_CSS = `
html[data-sf-pick] [data-block-id] { cursor: pointer; }
html[data-sf-pick] [data-block-id]:hover { outline: 2px solid #9A773A; outline-offset: -2px; }
html[data-sf-pick] [data-block-id][data-sf-picked] { outline: 2px solid #22211F; outline-offset: -2px; }
@keyframes sf-flash { 0%, 60% { outline-color: #9A773A; } 100% { outline-color: transparent; } }
`;
// The changed block flashes by a rule on its id, not an attribute on its
// node: the page's hydration recreates the node right after load.
const flashCss = (id: string) =>
  `[data-block-id="${CSS.escape(id)}"] { outline: 3px solid transparent; outline-offset: -3px; animation: sf-flash 2.4s ease-out both; }`;

/** The clicked section's name for the chip: its first heading, else the
 * tapped words, else just "this section". */
function labelOf(block: Element, target: Element): string {
  const text = (
    block.querySelector("h1, h2, h3")?.textContent ??
    target.textContent ??
    ""
  ).trim();
  return text
    ? text.length > 40
      ? `${text.slice(0, 39)}…`
      : text
    : "this section";
}

function LivePage({
  src,
  width,
  height,
  scale,
  onNavigate,
  onPick,
  pickedBlock,
  flashBlock,
}: {
  src: string;
  width: number;
  height: number;
  scale: number;
  onNavigate?: (path: string) => void;
  onPick?: (selection: SelectionPayload, label: string) => void;
  pickedBlock?: string | null;
  flashBlock?: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // The click handler is set once per load; picking follows the live prop.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!loaded || !doc) return;
    if (onPick) doc.documentElement.setAttribute("data-sf-pick", "");
    else doc.documentElement.removeAttribute("data-sf-pick");
  }, [loaded, !!onPick]); // eslint-disable-line react-hooks/exhaustive-deps
  // The picked outline follows the pick without a reload.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!loaded || !doc) return;
    doc
      .querySelectorAll("[data-sf-picked]")
      .forEach((el) => el.removeAttribute("data-sf-picked"));
    if (pickedBlock)
      doc
        .querySelector(`[data-block-id="${CSS.escape(pickedBlock)}"]`)
        ?.setAttribute("data-sf-picked", "");
  }, [loaded, pickedBlock]);
  return (
    <>
      {!loaded && <PageSkeleton />}
      <iframe
        ref={frameRef}
        src={src}
        title="Site preview"
        onLoad={(e) => {
          // Links to the coach's own pages open in the preview (re-framed
          // with ?embed=1, which in-frame navigation would drop); in-page
          // anchors scroll; anything else and forms stay put. While a page
          // is under review a tap picks the section instead.
          const frame = e.currentTarget;
          const doc = frame.contentDocument;
          if (doc) {
            const style = doc.createElement("style");
            style.textContent =
              PICK_CSS + (flashBlock ? flashCss(flashBlock) : "");
            doc.head.appendChild(style);
            if (pickRef.current)
              doc.documentElement.setAttribute("data-sf-pick", "");
            if (flashBlock)
              doc
                .querySelector(`[data-block-id="${CSS.escape(flashBlock)}"]`)
                ?.scrollIntoView({ block: "center" });
          }
          doc?.addEventListener(
            "click",
            (ev) => {
              const target = ev.target as Element | null;
              const pick = pickRef.current;
              const block = pick ? target?.closest?.("[data-block-id]") : null;
              if (block && target && pick) {
                ev.preventDefault();
                ev.stopPropagation();
                pick(
                  buildSelectionPayload(
                    target,
                    frame.contentWindow?.location.pathname ?? "/",
                  ),
                  labelOf(block, target),
                );
                return;
              }
              const a = target?.closest?.("a[href]");
              if (!a) return;
              const here = frame.contentWindow?.location;
              const to = new URL(a.getAttribute("href") ?? "", here?.href);
              if (here && to.origin === here.origin) {
                if (to.pathname === here.pathname && to.hash) return;
                to.searchParams.delete("embed");
                onNavigate?.(`${to.pathname}${to.search}`);
              }
              ev.preventDefault();
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

/** The page being composed: its name, three stages advancing as the server
 * reports them, a faint page skeleton beneath. */
export function Composing({
  title,
  stages,
  current,
  note,
}: {
  title: string;
  stages: [string, string, string];
  /** Index of the stage running now. */
  current: number;
  note: string;
}) {
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
