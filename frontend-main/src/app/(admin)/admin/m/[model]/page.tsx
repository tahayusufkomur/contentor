import { AdminModelPage } from "@shared/admin-kit/model-page";

export default function PlatformDataModelPage({
  params,
}: {
  params: { model: string };
}) {
  return (
    <AdminModelPage apiBase="/api/v1/platform-admin" modelKey={params.model} />
  );
}
