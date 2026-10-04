import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import LiveRoomClient from "./live-room-client";

export const dynamic = "force-dynamic";

export default async function LiveRoomPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getAuthUser();
  if (!user)
    redirect("/login?toast=You+need+to+log+in+to+join&toast_type=info");

  return <LiveRoomClient liveClassId={params.id} />;
}
