"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Renders children into <body> and locks background scroll while mounted.
 *  Portaling escapes any transformed / overflow-clipped ancestor that would
 *  otherwise trap a `position: fixed` overlay (so the overlay covers the real
 *  viewport and its own body — not the page behind it — does the scrolling). */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
