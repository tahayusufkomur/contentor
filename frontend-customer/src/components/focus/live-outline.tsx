"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LiveFrame } from "@/lib/copilot/live";
import { SPECIALIST_LOOK } from "@/lib/copilot/team";

import { WorkingTag } from "./working-tag";

/** The curriculum while the outline is being written: module cards with
 *  their lessons typing in, the one being written outlined in the
 *  specialist's colour and tagged. */
export function LiveOutline({ frame }: { frame: LiveFrame }) {
  const t = useTranslations("admin");
  const working = frame.working;
  const tag = working && (
    <WorkingTag specialist={working.specialist} label={t("focus.writing")} />
  );
  return (
    <div className="space-y-4" aria-live="polite">
      {frame.rows.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm text-muted-foreground">
            {tag}
            {t("focus.outlineSoon")}
          </CardContent>
        </Card>
      )}
      {frame.rows.map((row, index) => (
        <Card
          key={index}
          // The specialist's own colour: data, not a theme token.
          style={
            row.typing && working
              ? {
                  outline: `2px solid ${SPECIALIST_LOOK[working.specialist].color}`,
                  outlineOffset: 2,
                }
              : undefined
          }
        >
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Module {index + 1}: {row.title}
              </CardTitle>
              {row.typing && tag}
            </div>
          </CardHeader>
          {row.lessons.length > 0 && (
            <CardContent>
              <ol className="space-y-1.5 text-sm">
                {row.lessons.map((lesson, i) => (
                  <li key={i} className="rounded-md border px-3 py-2">
                    {lesson}
                  </li>
                ))}
              </ol>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
