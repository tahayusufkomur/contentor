import type { useTranslations } from "next-intl";

/** The `admin` translator: the labels live under `admin.publish.blockers.*`. */
type BlockerT = ReturnType<typeof useTranslations<"admin">>;

// Deep link for each publish requirement. Keys mirror `publish_blockers`
// in backend/apps/tenant_config/setup_items.py — add a key there, add it here
// and give it a label under `admin.publish.blockers`.
export const PUBLISH_BLOCKER_HREF = {
  plan: "/admin/billing",
  look: "/?edit=1&studio=1",
  first_course: "/admin/courses",
  first_event: "/admin/live",
  first_blog_post: "/admin/blog",
  payouts: "/admin/payouts",
} as const;

type BlockerKey = keyof typeof PUBLISH_BLOCKER_HREF;

const isBlockerKey = (key: string): key is BlockerKey =>
  key in PUBLISH_BLOCKER_HREF;

export function blockerMeta(
  key: string,
  opts: { onFreePlan?: boolean; trialing?: boolean } = {},
  t: BlockerT,
): { label: string; href: string } {
  // Without a paid plan "connect payments" is a dead end: paid content needs
  // Starter first (on a trial, Starter's first charge).
  if (key === "payouts" && opts.onFreePlan) {
    return {
      label: opts.trialing
        ? t("publish.blockers.payoutsTrial")
        : t("publish.blockers.payoutsFreePlan"),
      href: "/admin/billing",
    };
  }
  // An unknown key means the backend gained a requirement this build predates.
  // Show it: an empty list with a disabled button is a dead end.
  if (!isBlockerKey(key))
    return { label: key.replaceAll("_", " "), href: "/admin" };
  return {
    label: t(`publish.blockers.${key}`),
    href: PUBLISH_BLOCKER_HREF[key],
  };
}
