import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/auth";
import LiveStreamClient from "./live-stream-client";

export const dynamic = "force-dynamic";

export default async function LiveStreamPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getAuthUser();
  if (!user) {
    const t = await getTranslations("student.live");
    redirect(
      `/login?toast=${encodeURIComponent(t("loginToJoin"))}&toast_type=info`,
    );
  }

  return <LiveStreamClient streamId={params.id} />;
}
