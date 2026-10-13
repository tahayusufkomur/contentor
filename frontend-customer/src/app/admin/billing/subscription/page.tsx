import { redirect } from "next/navigation";

/** Upgrade links across the admin point here, so this address must keep
 *  resolving. The coach's plan is /admin/billing. */
export default function SubscriptionRedirect() {
  redirect("/admin/billing");
}
