import { getAuthUser } from "@/lib/auth";
import { pageMetadata } from "@/lib/seo";
import { SignupForm } from "./signup-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return pageMetadata((await params).locale, "/signup", "auth.signup.meta");
}

export default async function SignupPage() {
  const user = await getAuthUser();
  // A signed-in coach creating an additional platform has already proven email
  // ownership, so skip the verification round-trip. Students never provision.
  const isCoach = !!user && user.role !== "student" && !user.is_superuser;

  return <SignupForm authenticatedName={isCoach ? user.name : null} />;
}
