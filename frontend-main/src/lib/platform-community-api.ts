// Superadmin community rollup API client. Auth rides the same-origin admin
// cookie (like platform-mailbox-api).

export interface TenantCommunityRow {
  tenant: string;
  slug: string;
  enabled: boolean;
  open_reports: number;
  pending_posts: number;
  members: number;
}

export interface CommunityRollup {
  total_open_reports: number;
  total_pending_posts: number;
  by_tenant: TenantCommunityRow[];
}

export async function getCommunityRollup(): Promise<CommunityRollup> {
  const res = await fetch("/api/v1/platform/community/reports/", {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}
