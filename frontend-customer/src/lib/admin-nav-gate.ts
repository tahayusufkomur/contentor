import type { NavSection } from "@/components/shared/app-sidebar";

/** Real tenant state the nav gates on. Derived in admin-shell from
 *  useSetupStatus(), useTenant() and useEntitlements() — never from manual
 *  checklist ticks. */
export interface NavGateState {
  /** The site is live (the setup checklist's `publish` item is done). */
  published: boolean;
  /** TenantConfig.enabled_modules — composed from the coach's wizard goals. */
  enabledModules: string[];
  /** The coach's plan includes AI site editing. MUST be a confirmed true, not
   *  "not locked": while entitlements load we treat it as false so the manual
   *  editor is never hidden from someone who has no AI alternative. */
  hasSiteAi: boolean;
  /** Section ids whose "+ More" / "Advanced editing" disclosure is open. */
  expandedSections: string[];
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

/** The raw site editor. Demoted behind "Advanced editing" ONLY for coaches who
 *  have AI editing — for everyone else this is their only way to change the
 *  site, so it stays a primary destination. */
const ADVANCED_EDITING_HREFS = new Set(["/?edit=1", "/?edit=1&section=brand"]);

/** Annotate + filter the IA from real tenant state. Pure: same input, same
 *  output, no network. The IA itself lives in buildAdminNav and is untouched. */
export function gateAdminNav(
  sections: NavSection[],
  state: NavGateState,
): NavSection[] {
  const expanded = new Set(state.expandedSections);
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
      if (expanded.has("content")) return { ...section, hiddenCount: 0 };
      const visible = section.items.filter((item) => {
        if (DISCLOSURE_ONLY_HREFS.has(item.href)) return false;
        // NOT `module`: Next's @next/next/no-assign-module-variable rule makes
        // a local named `module` a hard lint error.
        const moduleId = MODULE_FOR_HREF[item.href];
        return moduleId ? state.enabledModules.includes(moduleId) : true;
      });
      return {
        ...section,
        items: visible,
        hiddenCount: section.items.length - visible.length,
      };
    }
    if (section.id === "mySite") {
      if (!state.hasSiteAi) return { ...section, hiddenCount: 0 };
      if (expanded.has("mySite")) {
        return {
          ...section,
          hiddenCount: 0,
          moreLabelKey: "nav.advancedEditing",
        };
      }
      const visible = section.items.filter(
        (item) => !ADVANCED_EDITING_HREFS.has(item.href),
      );
      return {
        ...section,
        items: visible,
        hiddenCount: section.items.length - visible.length,
        moreLabelKey: "nav.advancedEditing",
      };
    }
    return section;
  });
}
