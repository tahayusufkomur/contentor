import { AdminModelIndex } from '@shared/admin-kit/model-index'

export default function PlatformDataIndexPage() {
  return <AdminModelIndex apiBase="/api/v1/platform-admin" basePath="/admin/m" />
}
