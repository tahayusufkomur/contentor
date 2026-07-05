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

  return (
    <LiveRoomClient
      liveClassId={params.id}
      userId={String(user.id)}
      userName={user.name || user.email}
      userImage={user.avatar_url}
    />
  );
}
