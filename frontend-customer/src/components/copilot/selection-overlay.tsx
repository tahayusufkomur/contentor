"use client";

import { useEffect, useRef } from "react";
import { buildSelectionPayload } from "@/lib/copilot/selection";
import type { SelectionPayload } from "@/lib/copilot/types";

/** Full-page element picker: outlines the hovered element with a single
 * fixed-position ring, captures clicks before the page acts on them, Esc
 * exits. Active only while mounted — the panel mounts it in select mode. */
export function SelectionOverlay({
  onSelect,
  onExit,
}: {
  onSelect: (payload: SelectionPayload) => void;
  onExit: () => void;
}) {
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const ring = ringRef.current;
      if (!target || !ring || target.closest("[data-copilot-ui]")) return;
      const r = target.getBoundingClientRect();
      ring.style.opacity = "1";
      ring.style.transform = `translate(${r.left}px, ${r.top}px)`;
      ring.style.width = `${r.width}px`;
      ring.style.height = `${r.height}px`;
    };
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest("[data-copilot-ui]")) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(buildSelectionPayload(target, window.location.pathname));
      onExit();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [onSelect, onExit]);

  return (
    <div
      ref={ringRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[70] rounded-sm ring-2 ring-primary/70 transition-all duration-75 motion-reduce:transition-none"
      style={{ opacity: 0 }}
    />
  );
}
