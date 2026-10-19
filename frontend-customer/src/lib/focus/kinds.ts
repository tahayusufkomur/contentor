// The kinds focus mode can make (backend apps/core/focus/kinds) and where each
// lives in the studio. A record's own page is never built here: the backend
// gives it as `record.path`.

export type FocusKind =
  | "course"
  | "event"
  | "message"
  | "download"
  | "membership"
  | "bundle"
  | "post";

export interface KindRoutes {
  /** Focus mode's first screen. */
  newHref: string;
  /** The plain form: "Fill it in myself". */
  plainHref: string;
  /** Where Save & leave goes. */
  listHref: string;
  /** The assistant card kind that opens it in focus mode. */
  card?: string;
}

// Partial until every kind's stage adds its row.
export const KIND_ROUTES: Partial<Record<FocusKind, KindRoutes>> = {
  course: {
    newHref: "/admin/courses/new",
    plainHref: "/admin/courses/new?form=1",
    listHref: "/admin/courses",
    card: "create_course",
  },
  event: {
    newHref: "/admin/live?new=1",
    plainHref: "/admin/live?new=1&form=1",
    listHref: "/admin/live",
    card: "create_event",
  },
};

/** Her active time in focus mode on this kind (lib/focus/active-time). */
export const focusTimeKey = (kind: string) => `focus:${kind}`;

/** The focus kind an assistant card opens, or null. */
export function kindForCard(card: string): FocusKind | null {
  const row = Object.entries(KIND_ROUTES).find(([, r]) => r.card === card);
  return row ? (row[0] as FocusKind) : null;
}
