import type { NavSection } from "@/components/shared/app-sidebar";

/** Real tenant state the nav gates on. Derived in admin-shell from
 *  useSetupStatus() and useTenant() — never from manual checklist ticks. */
export interface NavGateState {
  /** The site is live (the setup checklist's `publish` item is done). */
  published: boolean;
  /** TenantConfig.enabled_modules — composed from the coach's wizard goals. */
  enabledModules: string[];
  /** The coach opened Content's "+ More" disclosure. */
  contentExpanded: boolean;
}

/** Content items that only appear once their module is enabled. Everything
 *  not listed here (Courses) is always visible; Library is disclosure-only. */
const MODULE_FOR_HREF: Record<string, string> = {
  "/admin/live": "live",
  "/admin/calendar": "live",
  "/admin/downloads": "downloads",
};

/** Shown only behind "+ More": supporting resources, not daily destinations. */
const DISCLOSURE_ONLY_HREFS = new Set(["/admin/photos"]);

/** Annotate + filter the IA from real tenant state. Pure: same input, same
 *  output, no network. The IA itself lives in buildAdminNav and is untouched. */
export function gateAdminNav(
  sections: NavSection[],
  state: NavGateState,
): NavSection[] {
  return sections.map((section) => {
    if (section.id === "marketing" && !state.published) {
      return {
        ...section,
        locked: {
          reasonKey: "nav.locked.marketing",
          href: "/admin#publish-card",
        },
      };
    }
    if (section.id === "content") {
      if (state.contentExpanded) {
        return { ...section, hiddenCount: 0 };
      }
      const visible = section.items.filter((item) => {
        if (DISCLOSURE_ONLY_HREFS.has(item.href)) return false;
        const moduleId = MODULE_FOR_HREF[item.href];
        return moduleId ? state.enabledModules.includes(moduleId) : true;
      });
      return {
        ...section,
        items: visible,
        hiddenCount: section.items.length - visible.length,
      };
    }
    return section;
  });
}
