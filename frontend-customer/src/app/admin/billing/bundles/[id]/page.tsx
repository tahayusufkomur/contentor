import { redirect } from "next/navigation";

export default function BundleRedirect({ params }: { params: { id: string } }) {
  redirect(`/admin/store/bundles/${params.id}`);
}
