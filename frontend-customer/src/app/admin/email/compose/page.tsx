import { redirect } from "next/navigation";

/** The email designer moved under Messages. Old links carry a template, a
 *  recipient or a step in the query string, so it travels along. */
export default function ComposeRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of [value].flat()) if (v !== undefined) query.append(key, v);
  }
  const qs = query.toString();
  redirect(`/admin/messages/email/new${qs ? `?${qs}` : ""}`);
}
