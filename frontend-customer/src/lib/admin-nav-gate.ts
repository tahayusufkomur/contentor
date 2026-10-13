import type { NavSection } from "@/components/shared/app-sidebar";
import {
  isNavItemActive,
  type NavPathState,
} from "@shared/navigation/navigation-state";

/** Real tenant state the nav gates on. */
export interface NavGateState {
  /** TenantConfig.enabled_modules — composed from the coach's setup answers. */
  enabledModules: string[];
  /** Section ids whose "+ N more" the coach has opened. */
  expandedSections: string[];
  /** Where the coach is (or is headed). A page of a module that is off still
   *  shows while she is on it — search and Help link there. */
  path?: NavPathState;
}

/** Pages that only appear once their module is on. */
const MODULE_FOR_HREF: Record<string, string> = {
  "/admin/live": "live",
  "/admin/downloads": "downloads",
};

/** Hide the pages of modules the coach did not choose, and count them so the
 *  tab strip can offer "+ N more". Pure; sections it does not change are
 *  returned as the same objects. */
export function gateAdminNav(
  sections: NavSection[],
  state: NavGateState,
): NavSection[] {
  const expanded = new Set(state.expandedSections);
  return sections.map((section) => {
    if (expanded.has(section.id)) return section;
    const visible = section.items.filter((item) => {
      // NOT `module`: @next/next/no-assign-module-variable forbids the name.
      const moduleId = MODULE_FOR_HREF[item.href];
      if (!moduleId || state.enabledModules.includes(moduleId)) return true;
      return !!state.path && isNavItemActive(state.path, item.href);
    });
    if (visible.length === section.items.length) return section;
    return {
      ...section,
      items: visible,
      hiddenCount: section.items.length - visible.length,
    };
  });
}
