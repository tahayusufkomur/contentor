"use client";

/** A template's rendered email, shrunk to a card. Sandboxed: nothing in it runs. */
export function TemplateThumb({
  html,
  title,
}: {
  html?: string;
  title: string;
}) {
  return (
    <div className="relative h-56 overflow-hidden rounded-lg border bg-muted">
      {html ? (
        <iframe
          srcDoc={html}
          sandbox=""
          title={title}
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 h-[1400px] w-[680px] origin-top-left scale-[0.4]"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          No preview
        </div>
      )}
    </div>
  );
}
