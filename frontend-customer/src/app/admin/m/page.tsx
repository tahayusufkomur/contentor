import { AdminModelIndex } from "@shared/admin-kit/model-index";

export default function StudioDataIndexPage() {
  return <AdminModelIndex apiBase="/api/v1/studio-admin" basePath="/admin/m" />;
}
