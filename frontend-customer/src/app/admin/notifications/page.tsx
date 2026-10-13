import { redirect } from "next/navigation";

/** Announcements are part of Messages; this address is kept for old links. */
export default function NotificationsRedirect() {
  redirect("/admin/messages");
}
