import { getAuthUser } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const user = await getAuthUser();
  // A signed-in coach creating an additional platform has already proven email
  // ownership, so skip the verification round-trip. Students never provision.
  const isCoach = !!user && user.role !== "student" && !user.is_superuser;

  return <SignupForm authenticatedName={isCoach ? user.name : null} />;
}
