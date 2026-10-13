import { redirect } from "next/navigation";

/** Designed-email templates moved under Messages. */
export default function EmailTemplatesRedirect() {
  redirect("/admin/messages/email/templates");
}
