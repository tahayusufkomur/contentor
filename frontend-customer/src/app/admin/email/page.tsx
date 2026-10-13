import { redirect } from "next/navigation";

/** Sent emails are listed with every other message; kept for old links. */
export default function EmailRedirect() {
  redirect("/admin/messages");
}
