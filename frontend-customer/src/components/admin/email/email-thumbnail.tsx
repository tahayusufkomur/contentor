"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const FRAME_WIDTH = 640; // a 600 px email with its margin

/** An email as an inbox draws it, shrunk to fit its box (a template card, the
 *  send step). Sandboxed: nothing in it runs or can be clicked. */
export function EmailThumbnail({
  html,
  title,
  className,
}: {
  html: string;
  title: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / FRAME_WIDTH);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      className={cn("relative overflow-hidden bg-muted/40", className)}
    >
      {scale > 0 && (
        <iframe
          srcDoc={html}
          sandbox=""
          title={title}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: FRAME_WIDTH,
            height: (box.current?.clientHeight ?? 0) / scale,
            transform: `scale(${scale})`,
          }}
        />
      )}
    </div>
  );
}
