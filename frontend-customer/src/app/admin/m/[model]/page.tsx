import { AdminModelPage } from "@shared/admin-kit/model-page";

export default function StudioDataModelPage({
  params,
}: {
  params: { model: string };
}) {
  return (
    <AdminModelPage apiBase="/api/v1/studio-admin" modelKey={params.model} />
  );
}
