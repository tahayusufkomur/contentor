import { redirect } from "next/navigation";

/** Live streams are a tab of Live Events; this address is kept for old links. */
export default function LiveStreamsRedirect() {
  redirect("/admin/live?tab=streams");
}
