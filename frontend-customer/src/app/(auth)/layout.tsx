import { redirect } from "next/navigation";

import { getAuthUser } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (user) {
    redirect(user.role === "owner" || user.role === "coach" ? "/admin" : "/");
  }
  return <>{children}</>;
}
