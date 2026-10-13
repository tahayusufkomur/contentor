import { redirect } from "next/navigation";

/** A sent email's results live under Messages now. */
export default function CampaignRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/admin/messages/email/${params.id}`);
}
