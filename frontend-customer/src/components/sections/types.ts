import type { ComponentType } from "react";
import type { FamilyId } from "@shared/sections/types";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";

export type { FamilyId };

/** Props every section layout receives. Content fields live at the top level
 *  of `block` (see packages/shared/src/sections/families.json); image fields
 *  are `{ url, photo_id }` objects; item lists are arrays of objects. */
export interface SectionProps {
  block: Block;
  /** Dynamic families only: Course[] (courseShowcase), SubscriptionPlan[]
   *  (pricing) or CalendarEvent[] (events). Undefined while unavailable. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  /** Present on the coach's editing canvas; absent on the public site. */
  editable?: EditableContext;
}

export type SectionComponent = ComponentType<SectionProps>;

/** One style's layouts: family → variant name → component. Every family
 *  must be present; `hero` must include an `intro` variant. */
export type StyleSections = Record<FamilyId, Record<string, SectionComponent>>;
