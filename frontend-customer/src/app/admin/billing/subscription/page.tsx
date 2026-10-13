import { redirect } from "next/navigation";

/** The coach's plan is a tab of Billing. Upgrade links across the admin point
 *  here, so this address must keep resolving. */
export default function SubscriptionRedirect() {
  redirect("/admin/billing?tab=subscription");
}
