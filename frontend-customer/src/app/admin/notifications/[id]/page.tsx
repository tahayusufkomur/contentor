import { redirect } from "next/navigation";

/** An announcement's receipt lives under Messages now. */
export default function AnnouncementRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/admin/messages/${params.id}`);
}
