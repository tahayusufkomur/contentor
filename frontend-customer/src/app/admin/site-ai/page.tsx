import { redirect } from "next/navigation";

/** The assistant's change log moved into the assistant panel. */
export default function SiteAiRedirect() {
  redirect("/admin?assistant=history");
}
