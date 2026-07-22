/**
 * Coach plan entitlements — pure types + decision logic (no I/O).
 *
 * The backend endpoint `/api/v1/billing/platform/entitlements/` returns one
 * boolean per paid feature: `true` when the coach's plan INCLUDES it. The
 * coach-admin "Paid feature" badge shows for any feature that is locked (the
 * plan does not include it). The network wrapper lives in
 * `lib/api/entitlements.ts`; keep this module import-free so it stays trivially
 * unit-testable.
 */

export type EntitlementKey =
  | "live"
  | "ai_blog"
  | "student_bot"
  | "logo_studio"
  | "payouts"
  | "platform_mailbox";

export type Entitlements = Record<EntitlementKey, boolean>;

/**
 * Whether a "Paid" badge should show for `feature`.
 *
 * True ONLY when entitlements are loaded (`entitlements` is non-null) AND the
 * plan does not include the feature. While loading — or after a failed fetch —
 * `entitlements` is null and this returns false, so the badge never flashes on
 * for a coach whose real (possibly paid) plan hasn't resolved yet.
 */
export function isFeatureLocked(
  entitlements: Entitlements | null,
  feature: EntitlementKey,
): boolean {
  return entitlements ? entitlements[feature] === false : false;
}
