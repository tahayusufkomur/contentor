// Copy + deep link for each publish requirement. Keys mirror `publish_blockers`
// in backend/apps/tenant_config/setup_items.py — add a key there, add it here.
export const PUBLISH_BLOCKER_META: Record<
  string,
  { label: string; href: string }
> = {
  look: { label: "Add your logo", href: "/?edit=1&studio=1" },
  first_course: {
    label: "Publish your first course or download",
    href: "/admin/courses",
  },
  first_event: {
    label: "Schedule your first live class or event",
    href: "/admin/live",
  },
  first_blog_post: {
    label: "Publish your first blog post",
    href: "/admin/blog",
  },
  payouts: {
    label: "Connect payments to sell paid content",
    href: "/admin/payouts",
  },
};

export function blockerMeta(
  key: string,
  opts: { onFreePlan?: boolean } = {},
): { label: string; href: string } {
  // On the free plan "connect payments" is a dead end: paid content needs Starter first.
  if (key === "payouts" && opts.onFreePlan) {
    return {
      label: "Paid content needs the Starter plan — upgrade, or make it free",
      href: "/admin/billing",
    };
  }
  // An unknown key means the backend gained a requirement this build predates.
  // Show it: an empty list with a disabled button is a dead end.
  return (
    PUBLISH_BLOCKER_META[key] ?? {
      label: key.replaceAll("_", " "),
      href: "/admin",
    }
  );
}
