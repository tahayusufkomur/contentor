import { redirect } from "next/navigation";

export default function PlanAccessRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/admin/store/plans/${params.id}`);
}
