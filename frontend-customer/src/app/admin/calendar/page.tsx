import { redirect } from "next/navigation";

/** The calendar is a view of Classes & events; kept for old links. */
export default function CalendarRedirect() {
  redirect("/admin/live?view=calendar");
}
