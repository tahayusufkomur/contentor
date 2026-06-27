import type { ComponentType } from "react";
import { EmptyState } from "@/components/shared/empty-state";

/** Editor-only placeholder shown in place of a block that has no content/data
 *  yet, so a coach who just added (e.g.) a Testimonials block sees a clear
 *  "add your first one" prompt instead of the block vanishing from the canvas.
 *  Public pages still render nothing for an empty block — callers pass this only
 *  when `editable` is set. The dashed border signals "not real content yet". */
export function BlockPlaceholder({
  icon,
  title,
  description,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <section className="px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={icon}
          title={title}
          description={description}
          className="rounded-2xl border border-dashed bg-muted/30 py-12"
        />
      </div>
    </section>
  );
}
