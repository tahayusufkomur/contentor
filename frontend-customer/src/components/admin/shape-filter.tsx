"use client";

import { useTranslations } from "next-intl";

/** The shape a slot wants: "" = any. The same values the photo list
 *  (`?shape=`) and the photo library (`?orientation=`) filter on. */
export type Shape = "" | "landscape" | "portrait" | "square";

const SHAPES: Shape[] = ["", "landscape", "portrait", "square"];

// A small outline of each shape beside its name.
const GLYPH: Record<Exclude<Shape, "">, string> = {
  landscape: "h-2.5 w-4",
  portrait: "h-4 w-2.5",
  square: "h-3 w-3",
};

export function ShapeFilter({
  value,
  onChange,
}: {
  value: Shape;
  onChange: (shape: Shape) => void;
}) {
  const t = useTranslations("admin.media.shape");
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="group"
      aria-label={t("label")}
    >
      {SHAPES.map((shape) => (
        <button
          key={shape || "any"}
          type="button"
          aria-pressed={value === shape}
          onClick={() => onChange(shape)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
            value === shape
              ? "border-foreground bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {shape && (
            <span
              aria-hidden
              className={`inline-block rounded-[2px] border border-current ${GLYPH[shape]}`}
            />
          )}
          {t(shape || "any")}
        </button>
      ))}
    </div>
  );
}
