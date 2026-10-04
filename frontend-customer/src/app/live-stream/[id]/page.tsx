import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import LiveStreamClient from "./live-stream-client";

export const dynamic = "force-dynamic";

export default async function LiveStreamPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getAuthUser();
  if (!user)
    redirect("/login?toast=You+need+to+log+in+to+join&toast_type=info");

  return <LiveStreamClient streamId={params.id} />;
}
